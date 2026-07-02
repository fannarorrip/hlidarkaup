// Accounts-payable open items (ógreiddir reikningar). recordPayable is called from the purchase
// posting paths (postPurchase / confirmReceipt) to register each credit-booked supplier invoice.
// settlePayable posts a payment voucher (Dr AP / Cr bank) and closes the item.
import { db, query } from "@/lib/db";

interface Queryable { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> }

export interface PayableInput {
  voucherId: string; supplierId?: string | null; invoiceNumber?: string | null;
  invoiceDate?: string | null; dueDate?: string | null; amount: number; apAccount?: string;
}

/** Register an open payable for a just-posted purchase voucher. Idempotent on voucher_id.
 *  Runs inside the caller's posting transaction, so it is wrapped in a SAVEPOINT: any failure
 *  is rolled back to the savepoint (which un-poisons the transaction) and re-thrown for the caller
 *  to log — the purchase voucher itself still commits. This is what makes it truly best-effort;
 *  without the savepoint a pg error would abort the whole transaction and lose the posting. */
export async function recordPayable(client: Queryable, p: PayableInput): Promise<void> {
  const amount = Math.round((Number(p.amount) || 0) * 100) / 100;
  if (!p.voucherId || amount <= 0) return;
  await client.query("savepoint sp_payable");
  try {
    await client.query(
      `insert into acc.payables (voucher_id, supplier_id, invoice_number, invoice_date, due_date, amount, ap_account)
       values ($1,$2,$3,$4::date,$5::date,$6,$7)
       on conflict (voucher_id) do nothing`,
      [p.voucherId, p.supplierId ?? null, p.invoiceNumber ?? null, p.invoiceDate || null, p.dueDate || null, amount, p.apAccount || "9300"],
    );
    await client.query("release savepoint sp_payable");
  } catch (e) {
    await client.query("rollback to savepoint sp_payable");
    throw e;
  }
}

export interface OpenPayable {
  id: string; voucher_id: string; supplier_id: string | null; supplier_name: string | null;
  supplier_iban: string | null; invoice_number: string | null; invoice_date: string | null;
  due_date: string | null; amount: number; ap_account: string; status: string;
  payment_ref: string | null; payment_status: string | null; days_overdue: number | null;
  series_code: string | null; voucher_number: string | null;
}

/** Open + pending payables, newest-due first, with supplier + days-overdue (negative = not yet due). */
export function listOpenPayables() {
  return query<OpenPayable>(
    `select p.id, p.voucher_id, p.supplier_id, s.name as supplier_name, s.iban as supplier_iban,
            p.invoice_number, p.invoice_date::text as invoice_date, p.due_date::text as due_date,
            p.amount::float8 as amount, p.ap_account, p.status, p.payment_ref, p.payment_status,
            case when p.due_date is null then null else (current_date - p.due_date) end as days_overdue,
            v.series_code, v.voucher_number::text as voucher_number
     from acc.payables p
     left join acc.suppliers s on s.id = p.supplier_id
     left join acc.vouchers v on v.id = p.voucher_id
     where p.status in ('open','pending')
     order by p.due_date asc nulls last, p.created_at asc`);
}

export interface SettleResult { ok: boolean; message?: string; voucher?: { series_code: string; voucher_number: string } }

/** Settle a payable by posting a payment voucher: Dr AP (9300) / Cr bank. Concurrency-safe
 *  (row locked, conditional close). Use for a payment already made (netbanki) or after a PSD2
 *  payment settled. `paymentRef`/`paymentStatus` record the Arion paymentId when relevant. */
export async function settlePayable(
  payableId: string, bankAccount: string, opts: { paymentRef?: string; paymentStatus?: string; allowPending?: boolean } = {},
): Promise<SettleResult> {
  // Manual settle only closes an 'open' item; a 'pending' item (PSD2 payment in flight) may only be
  // settled by the PSD2 status flow (allowPending) so a manual close can't double-pay it.
  const allowed = opts.allowPending ? ["open", "pending"] : ["open"];
  const client = await db.connect();
  try {
    await client.query("begin");
    const q = await client.query<{ amount: string; ap_account: string; status: string; supplier_id: string | null; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null }>(
      `select p.amount::text as amount, p.ap_account, p.status, p.supplier_id, s.name as supplier_name,
              p.invoice_number, p.invoice_date::text as invoice_date
       from acc.payables p left join acc.suppliers s on s.id = p.supplier_id
       where p.id = $1 for update`, [payableId]);
    const p = q.rows[0];
    if (!p) { await client.query("rollback"); return { ok: false, message: "Reikningur fannst ekki." }; }
    if (!allowed.includes(p.status)) {
      await client.query("rollback");
      return { ok: false, message: p.status === "pending" ? "Greiðsla er þegar í vinnslu (PSD2)." : "Reikningur er þegar frágenginn." };
    }
    const amount = Math.round(Math.abs(Number(p.amount) || 0) * 100) / 100;
    if (!amount) { await client.query("rollback"); return { ok: false, message: "Upphæð er 0." }; }
    if (p.ap_account === bankAccount) { await client.query("rollback"); return { ok: false, message: "Bankalykill má ekki vera sami og skuldalykill." }; }

    const acct = await client.query<{ account_number: string }>(
      "select account_number from acc.accounts where account_number = any($1) and is_postable", [[p.ap_account, bankAccount]]);
    const found = new Set(acct.rows.map((r: { account_number: string }) => r.account_number));
    if (!found.has(p.ap_account) || !found.has(bankAccount)) {
      await client.query("rollback");
      return { ok: false, message: "Bankalykill eða skuldalykill finnst ekki (eða er ekki færanlegur)." };
    }

    const desc = `Greiðsla – ${p.supplier_name ?? ""}`.slice(0, 140);
    const lines = [
      { account: p.ap_account, debit: amount, credit: 0, vat_code: null, description: desc },
      { account: bankAccount, debit: 0, credit: amount, vat_code: null, description: desc },
    ];
    const v = await client.query<{ id: string; series_code: string; voucher_number: string }>(
      "select id, series_code, voucher_number::text as voucher_number from acc.post_voucher('JOURNAL',current_date,'payment',$1,$2,'bokhald',$3::jsonb, p_supplier_id => $4::uuid)",
      [desc, p.invoice_number || "greidsla", JSON.stringify(lines), p.supplier_id]);
    const upd = await client.query(
      `update acc.payables set status='paid', paid_amount=$1, payment_voucher_id=$2, paid_at=now(),
              payment_ref=coalesce($3,payment_ref), payment_status=coalesce($4,payment_status)
       where id=$5 and status = any($6::text[])`,
      [amount, v.rows[0].id, opts.paymentRef ?? null, opts.paymentStatus ?? null, payableId, allowed]);
    if (upd.rowCount === 0) { await client.query("rollback"); return { ok: false, message: "Reikningur var þegar frágenginn." }; }
    await client.query("commit");
    return { ok: true, voucher: { series_code: v.rows[0].series_code, voucher_number: v.rows[0].voucher_number } };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* */ }
    console.error("settlePayable failed:", e);
    return { ok: false, message: "Frágangur mistókst. Athugaðu lykla og reyndu aftur." };
  } finally {
    client.release();
  }
}

/** Mark a payable as pending (PSD2 payment initiated, awaiting SCA/settlement). */
export async function markPayablePending(payableId: string, paymentRef: string, paymentStatus?: string) {
  await query(
    `update acc.payables set status='pending', payment_ref=$2, payment_status=$3
     where id=$1 and status='open'`, [payableId, paymentRef, paymentStatus ?? "RCVD"]);
}

/** Import open items from the ledger for supplier-tagged posted vouchers that still carry a net
 *  credit on their AP account and aren't registered yet. Due date = voucher date + payment terms. */
export async function backfillPayables(): Promise<{ imported: number }> {
  const r = await query<{ n: string }>(
    `with ins as (
       insert into acc.payables (voucher_id, supplier_id, invoice_number, invoice_date, due_date, amount, ap_account)
       select v.id, v.supplier_id, v.external_reference, v.voucher_date,
              v.voucher_date + coalesce(s.payment_terms_days, 0), sum(le.credit - le.debit),
              coalesce(s.ap_account, '9300')
       from acc.vouchers v
       left join acc.suppliers s on s.id = v.supplier_id
       join acc.ledger_entries le on le.voucher_id = v.id and le.account_number = coalesce(s.ap_account, '9300')
       where v.status = 'posted' and v.supplier_id is not null
         and not exists (select 1 from acc.payables p where p.voucher_id = v.id)
       group by v.id, v.supplier_id, v.external_reference, v.voucher_date, s.payment_terms_days, s.ap_account
       having sum(le.credit - le.debit) > 0
       returning 1)
     select count(*)::text as n from ins`);
  return { imported: Number(r[0]?.n || 0) };
}
