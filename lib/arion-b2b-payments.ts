// Arion / RB B2B PaymentService client — útgreiðslur, millifærslur og GREIÐSLA KRÖFU.
// Contract (live WSDL, confirmed 2026-07-10):
//   https://ws.b2b.is/Payments/20131015/PaymentService.svc — SOAP 1.2
//   ns P  = http://IcelandicOnlineBanking/2013/10/15/Payments
//   ns PT = http://IcelandicOnlineBanking/2013/10/15/PaymentTypes   (elementFormDefault=qualified)
//   DoPayment (SYNCHRONOUS single payment) -> PaymentsResult{ID,Status,Success[],Errors[],DateOfPayment}
//   PaymentIn = choice(Claim|Transfer) FIRST, then Amount, then optional Description (<=35).
//   Claim key = Account (útibú4+höfuðbók2+númer6, same shape as our kröfur), Claimant kt, PayorID kt,
//   DueDate, IsDeposit (false = pay IN FULL — bank may add costs, reconcile on the RETURNED amount).
// Reached through the B2B Bridge (plain UsernameToken) exactly like BillService — the raw ws.b2b.is
// endpoint is WCF AsymmetricBinding X509 and must NEVER be called directly from Node.
// GOTCHAS (from Arion docs): identical same-day payment between same accounts is REJECTED (treat as
// already-done); without "straight through" (STP) user config results come back NotConfirmed and wait
// for manual confirmation in netbanki; Status "InProgress" on a single payment means unknown/error.
import { XMLParser } from "fast-xml-parser";

const P = "http://IcelandicOnlineBanking/2013/10/15/Payments";
const PT = "http://IcelandicOnlineBanking/2013/10/15/PaymentTypes";
const WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const PW_TEXT = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";
const ACTION_DO_PAYMENT = "http://IcelandicOnlineBanking/2013/10/15/DoPayment";

interface Cfg { url: string; user: string; pass: string; debitAccount: string; debitOwnerId: string }
function cfg(): Cfg {
  return {
    url: process.env.ARION_B2B_PAYMENTS_URL || "",
    user: process.env.ARION_B2B_USERNAME || process.env.ARION_USERNAME || "",
    pass: process.env.ARION_B2B_PASSWORD || process.env.ARION_PASSWORD || "",
    debitAccount: (process.env.ARION_B2B_DEBIT_ACCOUNT || "").replace(/\D/g, ""), // 12 digits: útibú+hb+reikningur
    debitOwnerId: (process.env.ARION_B2B_PAYOR_ID || process.env.ARION_PSU_ID || "").replace(/\D/g, ""),
  };
}

export interface PaymentsStatus { configured: boolean; have: { url: boolean; user: boolean; pass: boolean; debitAccount: boolean } }
export function paymentsStatus(): PaymentsStatus {
  const c = cfg(); const has = (v: string) => v.length > 0;
  return {
    configured: has(c.url) && has(c.user) && has(c.pass) && c.debitAccount.length === 12,
    have: { url: has(c.url), user: has(c.user), pass: has(c.pass), debitAccount: c.debitAccount.length === 12 },
  };
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });
const arr = <T>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isk = (n: number) => (Math.round(Math.abs(n) * 100) / 100).toFixed(2); // xs:decimal, 2 fraction digits

// SOAP 1.2 Fault detail carries IOBSFault (ns .../2013/10/15/Exceptions) — surface the Icelandic text.
function faultText(body: Record<string, unknown>): string | null {
  const fault = body.Fault as Record<string, unknown> | undefined;
  if (!fault) return null;
  const flat = JSON.stringify(fault);
  const m = flat.match(/"(?:BanksErrorText|GeneralErrorText|GeneralSourceText)":"([^"]{1,200})"/);
  return m ? m[1] : flat.slice(0, 300);
}

export interface PayClaimInput {
  claimAccount: string;   // 12 digits: útibú(4)+höfuðbók(2)+kröfunúmer(6)
  claimantId: string;     // kt kröfuhafa (ledger 66); for other ledgers = payor kt per XSD
  payorId?: string;       // kt greiðanda — defaults to our kt (ARION_B2B_PAYOR_ID)
  dueDate: string;        // YYYY-MM-DD gjalddagi
  amount: number;         // ISK; with isDeposit=false the bank pays IN FULL (may exceed this — costs)
  description?: string;   // skýring, max 35 chars, shows in netbanki
  isDeposit?: boolean;    // true = partial payment of exactly `amount`; false (default) = pay in full
}

export interface PayResult {
  ok: boolean;
  status: string;                 // BatchStatus from the bank
  paymentId?: string;             // PaymentsResult.ID — the receipt/operation id
  paidAmount?: number;            // ACTUAL amount withdrawn (may exceed requested — claim costs)
  dateOfPayment?: string;
  needsConfirmation?: boolean;    // NotConfirmed* — payment waits for manual confirmation in netbanki
  error?: string;
}

/** Pay a krafa (bank claim) IN FULL (or partially with isDeposit) via DoPayment. REAL MONEY. */
export async function payClaim(input: PayClaimInput): Promise<PayResult> {
  const c = cfg();
  const st = paymentsStatus();
  if (!st.configured) return { ok: false, status: "not_configured", error: "B2B greiðsluþjónusta er ekki stillt (ARION_B2B_PAYMENTS_URL + ARION_B2B_DEBIT_ACCOUNT)." };
  const claimAccount = (input.claimAccount || "").replace(/\D/g, "");
  const claimant = (input.claimantId || "").replace(/\D/g, "");
  const payor = (input.payorId || c.debitOwnerId).replace(/\D/g, "");
  if (claimAccount.length !== 12) return { ok: false, status: "invalid", error: "Kröfureikningur verður að vera 12 tölustafir (útibú+höfuðbók+númer)." };
  if (claimant.length !== 10 || payor.length !== 10) return { ok: false, status: "invalid", error: "Kennitölur kröfuhafa/greiðanda verða að vera 10 tölustafir." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate || "")) return { ok: false, status: "invalid", error: "Gjalddagi vantar (YYYY-MM-DD)." };
  if (!(input.amount > 0)) return { ok: false, status: "invalid", error: "Upphæð verður að vera stærri en 0." };

  // Element order is schema-enforced: In = choice item FIRST, then Amount, then Description.
  // DateOfForwardPayment omitted = pay now. (If the Bridge faults 1200 on a missing element,
  // the schema vintage requires it — then send today's date explicitly.)
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:pt="${PT}">` +
    `<s:Header><wsse:Security s:mustUnderstand="1" xmlns:wsse="${WSSE}">` +
    `<wsse:UsernameToken><wsse:Username>${esc(cfg().user)}</wsse:Username>` +
    `<wsse:Password Type="${PW_TEXT}">${esc(cfg().pass)}</wsse:Password></wsse:UsernameToken>` +
    `</wsse:Security></s:Header>` +
    `<s:Body><DoPayment xmlns="${P}"><Payment>` +
    `<pt:Out><pt:Account>${esc(c.debitAccount)}</pt:Account><pt:AccountOwnerID>${esc(c.debitOwnerId)}</pt:AccountOwnerID></pt:Out>` +
    `<pt:In>` +
    `<pt:Claim><pt:Account>${esc(claimAccount)}</pt:Account><pt:Claimant>${esc(claimant)}</pt:Claimant>` +
    `<pt:PayorID>${esc(payor)}</pt:PayorID><pt:DueDate>${esc(input.dueDate)}</pt:DueDate>` +
    `<pt:IsDeposit>${input.isDeposit ? "true" : "false"}</pt:IsDeposit></pt:Claim>` +
    `<pt:Amount>${isk(input.amount)}</pt:Amount>` +
    (input.description ? `<pt:Description>${esc(String(input.description).slice(0, 35))}</pt:Description>` : "") +
    `</pt:In>` +
    `</Payment></DoPayment></s:Body></s:Envelope>`;

  try {
    const res = await fetch(c.url, {
      method: "POST",
      headers: { "content-type": `application/soap+xml; charset=utf-8; action="${ACTION_DO_PAYMENT}"` },
      body: envelope,
    });
    const text = await res.text();
    const parsed = parser.parse(text) as Record<string, unknown>;
    const body = ((parsed.Envelope as Record<string, unknown>)?.Body ?? {}) as Record<string, unknown>;
    const fault = faultText(body);
    if (fault) return { ok: false, status: "fault", error: fault };
    if (!res.ok) return { ok: false, status: `http_${res.status}`, error: `B2B Bridge svaraði ${res.status}: ${text.slice(0, 300)}` };

    const result = (((body.DoPaymentResponse ?? {}) as Record<string, unknown>).PaymentsResult ?? {}) as Record<string, unknown>;
    const status = String(result.Status ?? "");
    const id = String(result.ID ?? "");
    const errors = arr(result.Errors as Record<string, unknown> | Record<string, unknown>[]);
    const success = arr(result.Success as Record<string, unknown> | Record<string, unknown>[]);
    if (errors.length) {
      const e0 = (errors[0].Error ?? {}) as Record<string, unknown>;
      return { ok: false, status, paymentId: id || undefined, error: `${e0.Code ?? ""}: ${e0.Message ?? "villa í greiðslu"}`.slice(0, 300) };
    }
    // Actual paid amount comes from the Success detail (claim costs may increase it).
    const paid = success.length ? Number(String((success[0] as Record<string, unknown>).Amount ?? "").replace(",", ".")) || undefined : undefined;
    const dateOfPayment = result.DateOfPayment ? String(result.DateOfPayment) : undefined;
    if (status === "Completed" || status === "CompletedWithErrors") {
      return { ok: true, status, paymentId: id, paidAmount: paid, dateOfPayment };
    }
    if (status === "NotConfirmed" || status === "NotConfirmedWithErrors" || status === "OnHold") {
      // Payment registered but waiting (manual confirmation in netbanki, or forward-dated).
      return { ok: true, status, paymentId: id, paidAmount: paid, dateOfPayment, needsConfirmation: true };
    }
    // "InProgress" on a single payment = unknown/failed state per Arion docs; "Cancelled" = failed.
    return { ok: false, status: status || "unknown", paymentId: id || undefined, error: `Óvænt staða frá banka: ${status || "engin"}` };
  } catch (e) {
    return { ok: false, status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
