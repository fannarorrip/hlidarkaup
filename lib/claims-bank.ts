// Bank-side claim operations: flush queued claims to Arion (Kröfupottur) and pull settlements back
// into the ledger. Gated by ARION_CLAIMS_ENABLED. The payment-back loop posts a receipt voucher
// (Dr settlement bank / Cr customer AR 7600) so a paid claim actually clears the receivable.
import { db, query } from "@/lib/db";
import { createArionClaim, getArionClaimTransactions } from "@/lib/arion";
import { claimsEnabled } from "@/lib/claims";
import { getDefaultProfile, getCollectionSettings } from "@/lib/collection";

interface Auth { bearerToken?: string; subscriptionKey?: string }

export interface SendResult { sent: number; failed: number; skipped: number; requeued: number; reason?: string }

// Auth/transport failures (creds, gateway, network) must NOT burn claims to 'failed' —
// they stay retriable. Only a real 4xx validation rejection is terminal.
const isTransient = (msg: string) =>
  /HTTP (401|403|408|429|5\d\d)|áskriftarlykil|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket|network/i.test(msg);

/** Push all 'queued' claims to Arion. Each becomes a real greiðsluseðill in the Kröfupottur.
 *  Two-phase per claim: atomically flip queued→sending (claims the row), call the bank, then
 *  sending→created/failed — or BACK to queued on transient errors. A crash mid-send leaves the
 *  row in 'sending' for manual review instead of silently re-sending a possibly-registered claim. */
export async function sendQueuedClaims(auth: Auth = {}): Promise<SendResult> {
  if (!claimsEnabled()) return { sent: 0, failed: 0, skipped: 0, requeued: 0, reason: "disabled" };
  // Readiness guard: a pure config problem must not touch (and mass-fail) the queue at all.
  if (!auth.subscriptionKey && !process.env.ARION_CLAIMS_SUBSCRIPTION_KEY) {
    return { sent: 0, failed: 0, skipped: 0, requeued: 0, reason: "no_key" };
  }
  const profile = await getDefaultProfile();
  if (!profile) return { sent: 0, failed: 0, skipped: 0, requeued: 0, reason: "no_profile" };
  // The claimKey needs the store's kennitala + the 4-digit útibú from the innheimtusamningur —
  // both live in kröfustillingar. Missing config must not touch (and mass-fail) the queue.
  const settings = await getCollectionSettings();
  const claimant = (settings.kennitala_krofuhafa || "").replace(/\D/g, "");
  const bank = (settings.claim_bank || "").replace(/\D/g, "");
  if (claimant.length !== 10 || bank.length !== 4) {
    return { sent: 0, failed: 0, skipped: 0, requeued: 0, reason: "no_settings" };
  }
  const addDays = (iso: string, n: number) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const rows = await query<{ id: string; kennitala: string | null; amount: string; due_date: string | null;
    claim_number: string | null; series_code: string | null; voucher_number: string | null; billing_invoice_number: string | null }>(
    `select cl.id, cl.kennitala, cl.amount::text as amount, cl.due_date::text as due_date,
            cl.claim_number::text as claim_number, v.series_code, v.voucher_number::text as voucher_number,
            bi.invoice_number as billing_invoice_number
     from acc.claims cl
     left join acc.vouchers v on v.id = cl.voucher_id
     left join acc.billing_invoices bi on bi.id = cl.billing_invoice_id
     where cl.status = 'queued' order by cl.created_at asc limit 200`);

  let sent = 0, failed = 0, skipped = 0, requeued = 0;
  for (const c of rows) {
    const kt = (c.kennitala || "").replace(/\D/g, "");
    const amount = Math.round(Number(c.amount) || 0);
    if (!kt || amount <= 0 || !c.due_date) { skipped++; continue; }
    // Phase 1: claim the row. 0 rows = another worker already took it.
    const took = await query<{ id: string }>(
      `update acc.claims set status='sending', sent_at=now() where id=$1 and status='queued' returning id`, [c.id]);
    if (!took.length) { skipped++; continue; }

    // Kröfunúmer = the claim's own number for monthly claims, else the voucher number
    // (per-trip: the invoice IS the claim, RB-style). Both are ≤6 digits.
    const numberDigits = (c.claim_number || c.voucher_number || "").replace(/\D/g, "");
    if (!numberDigits || numberDigits.length > 6) {
      await query(`update acc.claims set status='failed', last_error=$2 where id=$1 and status='sending'`,
        [c.id, numberDigits ? "Kröfunúmer passar ekki sem 6 stafa tala." : "Vantar kröfunúmer."]);
      failed++; continue;
    }
    // tilvísun = the invoice number (monthly M-nr or per-trip series-voucher); omit if neither.
    const reference = c.billing_invoice_number ?? (c.series_code && c.voucher_number ? `${c.series_code}-${c.voucher_number}` : undefined);
    try {
      const res = await createArionClaim({
        claimantKennitala: claimant,
        claimBank: bank,
        claimNumber: numberDigits,
        templateCode: profile.code,
        debtorKennitala: kt,
        amount,
        dueDate: c.due_date,
        finalDueDate: addDays(c.due_date, Math.max(0, settings.final_due_days)),
        expirationDate: addDays(c.due_date, Math.max(1, settings.expires_after_days)),
        reference,
        billNumber: numberDigits,
        idempotencyKey: c.id, // claim row uuid — a crash-resend is idempotent at the bank
      }, auth);
      if (res.claimRef) {
        await query(`update acc.claims set status='created', arion_ref=$2, profile_id=$3, last_error=null where id=$1 and status='sending'`,
          [c.id, res.claimRef, profile.id]);
        sent++;
      } else if (res.ok) {
        // HTTP succeeded but no kröfunúmer in the response → the claim MAY have been created at the
        // bank. Flag for review (not auto-retried) rather than burying it as a plain failure.
        await query(`update acc.claims set status='failed', profile_id=$3, last_error=$2 where id=$1 and status='sending'`,
          [c.id, "Svar 2xx en kröfunúmer vantar — yfirfara hjá Arion (möguleg skráning).", profile.id]);
        failed++;
      } else if (isTransient(res.error || "")) {
        await query(`update acc.claims set status='queued', last_error=$2 where id=$1 and status='sending'`,
          [c.id, ("Tímabundin villa (endursent næst): " + (res.error || "")).slice(0, 300)]);
        requeued++;
      } else {
        await query(`update acc.claims set status='failed', last_error=$2 where id=$1 and status='sending'`,
          [c.id, (res.error || "Óþekkt villa").slice(0, 300)]);
        failed++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Thrown = never reached the bank (missing key, network) → always safe to requeue.
      await query(`update acc.claims set status='queued', last_error=$2 where id=$1 and status='sending'`,
        [c.id, ("Tímabundin villa (endursent næst): " + msg).slice(0, 300)]);
      requeued++;
    }
  }
  return { sent, failed, skipped, requeued };
}

export interface SyncResult { settled: number; checked: number; errors: string[]; reason?: string }

/** Pull settlements for 'created' claims. When paid in full, post the receipt voucher and mark paid.
 *  Network fetch happens outside the DB transaction; the ledger post is locked + idempotent. */
export async function syncClaimPayments(auth: Auth = {}): Promise<SyncResult> {
  if (!claimsEnabled()) return { settled: 0, checked: 0, errors: [], reason: "disabled" };

  const rows = await query<{ id: string; amount: string; arion_ref: string | null; customer_id: string | null;
    ar_account: string | null; settlement_ledger: string | null }>(
    `select cl.id, cl.amount::text as amount, cl.arion_ref, cl.customer_id,
            coalesce(cu.ar_account, '7600') as ar_account,
            coalesce(pr.settlement_ledger, dpr.settlement_ledger) as settlement_ledger
     from acc.claims cl
     left join shop.customers cu on cu.id = cl.customer_id
     left join acc.collection_profiles pr on pr.id = cl.profile_id
     left join acc.collection_profiles dpr on dpr.is_default and dpr.is_active
     where cl.status = 'created' and cl.arion_ref is not null
     order by cl.created_at asc limit 200`);

  let settled = 0, checked = 0;
  const errors: string[] = [];
  for (const c of rows) {
    checked++;
    try {
      const pays = await getArionClaimTransactions(c.arion_ref as string, auth);
      const paid = pays.reduce((a, p) => a + (Number(p.amount) || 0), 0);
      const amount = Math.round(Number(c.amount) || 0);
      if (Math.round(paid) < amount) continue; // not fully paid yet
      if (!c.settlement_ledger) { errors.push(`${c.arion_ref}: vantar ráðstöfunarreikning (kröfusnið).`); continue; }
      const lastDate = pays.map((p) => (p.date || "").slice(0, 10)).filter(Boolean).sort().pop() || new Date().toISOString().slice(0, 10);
      const res = await settleClaim(c.id, c.settlement_ledger, c.ar_account || "7600", amount, c.customer_id, c.arion_ref as string, lastDate);
      if (res.ok) settled++; else if (res.message) errors.push(`${c.arion_ref}: ${res.message}`);
    } catch (e) {
      errors.push(`${c.arion_ref}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { settled, checked, errors };
}

/** Post the receipt that clears a paid claim: Dr settlement bank / Cr customer AR (7600),
 *  customer-tagged. Locked + conditional so a claim settles at most once. */
async function settleClaim(
  claimId: string, bankAccount: string, arAccount: string, amount: number, customerId: string | null, arionRef: string, date: string,
): Promise<{ ok: boolean; message?: string }> {
  if (bankAccount === arAccount) return { ok: false, message: "Ráðstöfunarreikningur og kröfulykill mega ekki vera sami." };
  const client = await db.connect();
  try {
    await client.query("begin");
    const q = await client.query<{ status: string }>("select status from acc.claims where id = $1 for update", [claimId]);
    if (!q.rows[0]) { await client.query("rollback"); return { ok: false, message: "Krafa fannst ekki." }; }
    if (q.rows[0].status !== "created") { await client.query("rollback"); return { ok: false }; } // already handled
    const acct = await client.query<{ account_number: string }>(
      "select account_number from acc.accounts where account_number = any($1) and is_postable", [[bankAccount, arAccount]]);
    const found = new Set(acct.rows.map((r: { account_number: string }) => r.account_number));
    if (!found.has(bankAccount) || !found.has(arAccount)) { await client.query("rollback"); return { ok: false, message: "Lyklar finnast ekki (ráðstöfunar/krafna)." }; }

    const desc = `Innborgun kröfu ${arionRef}`.slice(0, 140);
    const lines = [
      { account: bankAccount, debit: amount, credit: 0, vat_code: null, description: desc },
      { account: arAccount, debit: 0, credit: amount, vat_code: null, description: desc },
    ];
    const v = await client.query<{ id: string }>(
      "select id from acc.post_voucher('JOURNAL',$1::date,'receipt',$2,$3,'bokhald',$4::jsonb, p_customer_id => $5::uuid)",
      [date, desc, arionRef, JSON.stringify(lines), customerId]);
    const upd = await client.query("update acc.claims set status='paid', payment_voucher_id=$2, paid_at=now() where id=$1 and status='created'",
      [claimId, v.rows[0].id]);
    if (upd.rowCount === 0) { await client.query("rollback"); return { ok: false }; }
    await client.query("commit");
    return { ok: true };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* */ }
    console.error("settleClaim failed:", e);
    return { ok: false, message: "Bókun innborgunar mistókst." };
  } finally {
    client.release();
  }
}
