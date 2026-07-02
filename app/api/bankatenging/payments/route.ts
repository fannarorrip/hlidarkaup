import { NextRequest, NextResponse } from "next/server";
import { arionStatus, createArionPayment, getArionPaymentStatus } from "@/lib/arion";
import { query } from "@/lib/db";
import { claimPayableForPayment, revertPayableInitiation, markPayablePending, settlePayable } from "@/lib/payables";

// PSD2 Payment Initiation (PIS) to pay a supplier invoice. `initiate` creates the payment (amount
// + creditor come from the payable server-side, not the client) and returns the scaRedirect; the
// PSU approves it, then `status` polls Arion and, once accepted, settles the payable in the ledger.
// Gated stjornandi via middleware (/api/bankatenging). Needs the openbanking.readwrite scope.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Only settle the ledger when the transfer has actually EXECUTED. ACSC/ACCC = settlement completed.
// Deliberately excludes: RCVD/ACTC/ACCP (pre-SCA validation), ACSP (in progress, can still reject),
// ACWC (accepted WITH CHANGE — bank may have altered amount → would mismatch the payable).
const ACCEPTED = new Set(["ACSC", "ACCC"]);

interface PayableRow { amount: string; invoice_number: string | null; supplier_id: string | null; supplier_name: string | null; supplier_iban: string | null; status: string }

async function loadPayable(id: string) {
  const r = await query<PayableRow>(
    `select p.amount::text as amount, p.invoice_number, p.supplier_id, s.name as supplier_name, s.iban as supplier_iban, p.status
     from acc.payables p left join acc.suppliers s on s.id = p.supplier_id where p.id = $1`, [id]);
  return r[0] ?? null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const st = arionStatus();
  // Pasted credentials are a SANDBOX affordance only — production runs on server env (mTLS OAuth).
  const token = st.sandbox && typeof body.token === "string" ? body.token.trim() : "";
  const subKey = st.sandbox && typeof body.subscriptionKey === "string" ? body.subscriptionKey.trim() : "";
  if (!subKey && !st.have.psd2Key) return NextResponse.json({ ok: false, reason: "not_configured", message: "Vantar PSD2 áskriftarlykil (ARION_PSD2_SUBSCRIPTION_KEY)." });
  if (!token && !st.readyPsd2) return NextResponse.json({ ok: false, reason: "not_configured", message: st.sandbox ? "Límdu Arion aðgangslykil." : "PSD2 tenging ekki tilbúin — athugaðu skilríki og lykla í .env." });
  const bearer = token || undefined;
  const key = subKey || undefined;

  try {
    if (action === "initiate") {
      const payableId = String(body.payableId || "").trim();
      const debtorIban = String(body.debtorIban || "").replace(/\s/g, "");
      const creditorIban = String(body.creditorIban || "").replace(/\s/g, "");
      // PSU-ID (netbank user kt): server env in production; the sandbox tester value only in sandbox.
      const psuId = (process.env.ARION_PSU_ID || "").replace(/\D/g, "")
        || (st.sandbox ? String(body.psuId || "").replace(/\D/g, "") : "") || undefined;
      if (!UUID_RE.test(payableId)) return NextResponse.json({ ok: false, message: "Ógildur reikningur." });
      if (!debtorIban || !creditorIban) return NextResponse.json({ ok: false, message: "Vantar IBAN (greiðandi/móttakandi)." });
      const p = await loadPayable(payableId);
      if (!p) return NextResponse.json({ ok: false, message: "Reikningur fannst ekki." });
      const amount = Math.round(Math.abs(Number(p.amount) || 0) * 100) / 100;
      if (!amount) return NextResponse.json({ ok: false, message: "Upphæð er 0." });

      // Payee is server-authoritative: if the supplier has an IBAN on file, pay THAT (ignore the
      // client value) so a tampered/compromised request can't redirect a real payable's amount to
      // an arbitrary account. Only accept a client IBAN when the supplier has none — then remember it.
      const onFile = (p.supplier_iban || "").replace(/\s/g, "");
      const payeeIban = onFile || creditorIban;
      if (!payeeIban) return NextResponse.json({ ok: false, message: "Vantar IBAN móttakanda (birgi)." });
      if (!onFile && p.supplier_id && creditorIban) {
        await query(`update acc.suppliers set iban = $1 where id = $2 and (iban is null or iban = '')`, [creditorIban, p.supplier_id]).catch(() => {});
      }
      const e2e = (p.invoice_number || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 35) || undefined;

      // Claim the payable BEFORE the bank call — a crash/double-click after this point can never
      // initiate a second payment for the same invoice (status is no longer 'open').
      if (!(await claimPayableForPayment(payableId))) {
        return NextResponse.json({ ok: false, message: "Reikningur er ekki opinn (greiðsla þegar hafin eða frágengin)." });
      }
      try {
        const pay = await createArionPayment({
          debtorIban, creditorIban: payeeIban, creditorName: p.supplier_name || "Birgir", amount,
          remittance: p.invoice_number || undefined, endToEndId: e2e,
          psuId, bearerToken: bearer, subscriptionKey: key,
        });
        if (!pay.paymentId) {
          await revertPayableInitiation(payableId);
          return NextResponse.json({ ok: false, message: "Ekkert greiðslunúmer frá Arion." });
        }
        await markPayablePending(payableId, pay.paymentId, pay.status);
        return NextResponse.json({ ok: true, paymentId: pay.paymentId, status: pay.status, scaRedirect: pay.scaRedirect });
      } catch (e) {
        await revertPayableInitiation(payableId); // never reached the bank (or bank rejected) → reopen
        throw e;
      }
    }

    if (action === "status") {
      const paymentId = String(body.paymentId || "").trim();
      const payableId = String(body.payableId || "").trim();
      const bankAccount = String(body.bankAccount || "").trim();
      if (!paymentId) return NextResponse.json({ ok: false, message: "Vantar greiðslunúmer." });
      const status = await getArionPaymentStatus(paymentId, bearer, key);
      // Surface transport failures instead of showing a benign-looking "HTTP 404" as a status.
      if (/^HTTP /.test(status) || status === "?") return NextResponse.json({ ok: false, message: `Ekki tókst að sækja stöðu greiðslu (${status}).` });
      let settled: { series_code: string; voucher_number: string } | undefined;
      let settleError: string | undefined;
      if (ACCEPTED.has(status) && UUID_RE.test(payableId) && bankAccount) {
        const res = await settlePayable(payableId, bankAccount, { paymentRef: paymentId, paymentStatus: status, allowPending: true });
        if (res.ok) settled = res.voucher; else settleError = res.message;
      }
      return NextResponse.json({ ok: true, status, settled, settleError });
    }

    return NextResponse.json({ ok: false, message: "Óþekkt aðgerð." });
  } catch (e) {
    console.error("bankatenging/payments failed:", e);
    return NextResponse.json({ ok: false, message: "Greiðsla mistókst. Athugaðu tengingu og reyndu aftur." });
  }
}
