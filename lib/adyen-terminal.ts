// Straumur card terminal (posi) = Adyen POS. Cloud Terminal API (nexo): our backend POSTs a
// payment request to Adyen's cloud, which drives the physical terminal and returns approved/declined.
//
// Hard-won facts (see memory/adyen-straumur-terminal.md):
//   • Auth is BASIC AUTH (ws username + password) — the x-API-key returns 401 on this
//     Straumur-provisioned credential. We fall back to x-API-key only if no ws password is set.
//   • The TEST account accepts EUR only (ISK → NotAllowed). Production (live) will do ISK.
//
// Env (all in .env.local; secrets never in the repo):
//   ADYEN_WS_USERNAME + ADYEN_WS_PASSWORD  — Basic auth (preferred)   ·  ADYEN_API_KEY — fallback
//   ADYEN_MERCHANT_ACCOUNT, ADYEN_POS_POIID
//   ADYEN_ENVIRONMENT = test (default) | live   ·   ADYEN_LIVE_PREFIX (live only)
//   ADYEN_CURRENCY = EUR (test) | ISK (live)    ·   ADYEN_SALE_ID (optional POS id)

import { query } from "@/lib/db";

interface AdyenCfg { user: string; pass: string; apiKey: string; poiId: string; merchant: string; env: string; livePrefix: string; saleId: string; currency: string }

// Posa-annáll (acc.terminal_log): hver færsla skráð með niðurstöðu svo tvírukkanir og
// týndar heimildir sjáist við afstemmingu móti Straumi. Best-effort — stöðvar aldrei greiðslu.
async function logTerminal(row: { kind: "pay" | "refund" | "abort" | "verify"; poiid?: string; serviceId?: string; ref?: string; amount?: number; currency?: string; approved?: boolean; error?: string; poiTxId?: string }) {
  try {
    await query(
      `insert into acc.terminal_log (kind, poiid, service_id, ref, amount, currency, approved, error, poi_tx_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [row.kind, row.poiid ?? null, row.serviceId ?? null, row.ref ?? null, row.amount ?? null, row.currency ?? null, row.approved ?? null, row.error?.slice(0, 500) ?? null, row.poiTxId ?? null]);
  } catch (e) { console.error("[posi-annáll]", e); }
}

export function adyenConfig(): AdyenCfg {
  return {
    user: process.env.ADYEN_WS_USERNAME ?? "",
    pass: process.env.ADYEN_WS_PASSWORD ?? "",
    apiKey: process.env.ADYEN_API_KEY ?? "",
    poiId: process.env.ADYEN_POS_POIID ?? process.env.ADYEN_POI_ID ?? "",
    merchant: process.env.ADYEN_MERCHANT_ACCOUNT ?? "",
    env: (process.env.ADYEN_ENVIRONMENT ?? process.env.ADYEN_TERMINAL_ENV ?? "test").toLowerCase(),
    livePrefix: process.env.ADYEN_LIVE_PREFIX ?? process.env.ADYEN_LIVE_URL_PREFIX ?? "",
    saleId: process.env.ADYEN_SALE_ID ?? "HlidarkaupKiosk",
    currency: (process.env.ADYEN_CURRENCY ?? "ISK").toUpperCase(), // live default; test .env.local sets EUR
  };
}

function hasAuth(c: AdyenCfg): boolean { return !!((c.user && c.pass) || c.apiKey); }
/** Enough config to attempt a terminal payment (auth + terminal + merchant). */
export function adyenEnabled(): boolean { const c = adyenConfig(); return hasAuth(c) && !!c.poiId && !!c.merchant; }

function authHeaders(c: AdyenCfg): Record<string, string> {
  if (c.user && c.pass) return { Authorization: "Basic " + Buffer.from(`${c.user}:${c.pass}`).toString("base64") };
  return c.apiKey ? { "x-API-key": c.apiKey } : {};
}

function endpoint(c: AdyenCfg): string {
  if (process.env.ADYEN_TERMINAL_ENDPOINT) return process.env.ADYEN_TERMINAL_ENDPOINT;
  if (c.env === "live" && c.livePrefix) return `https://${c.livePrefix}-terminal-api-live.adyenpayments.com/sync`;
  return "https://terminal-api-test.adyen.com/sync";
}

/** The till works in ISK króna (integer). Terminal API wants a decimal amount in the configured
 *  currency. ISK has no subunits → send the króna as-is. On the EUR test account, map króna→euro
 *  by /100 so the terminal shows a sensible figure (250 kr → €2.50). */
function requestedAmount(amountKr: number, currency: string): number {
  const kr = Math.round(amountKr);
  return currency === "ISK" ? kr : kr / 100;
}

// `unknown: true` = sambandið við skýið rofnaði og afdrif fengust EKKI staðfest — kortið GÆTI
// hafa verið rukkað. Kassinn verður þá að fara verify-leiðina, ALDREI sýna venjulega höfnun
// (höfnun býður upp á "reyna aftur" = tvírukkun).
export interface TerminalResult { approved: boolean; error?: string; poiTxId?: string; unknown?: boolean }

/** Run a card payment on the terminal. Blocks until the customer completes (or it times out).
 *  `opts` lets a specific register override the terminal (POIID) and SaleID it charges.
 *  `opts.refund` makes it a standalone REFUND (money OUT to the card the shopper presents) — used
 *  for skil/endurgreiðsla. It is a Payment-category message with PaymentData.PaymentType = "Refund",
 *  so the customer taps their card and the amount is credited back; abort works the same way. */
export async function sendPaymentToTerminal(amountKr: number, ref: string, opts?: { poiid?: string; saleId?: string; serviceId?: string; refund?: boolean; moto?: boolean }): Promise<TerminalResult> {
  const c = adyenConfig();
  if (!adyenEnabled()) return { approved: false, error: "Posa-tenging er ekki uppsett." };
  const poiId = opts?.poiid || c.poiId;
  const saleId = opts?.saleId || c.saleId;
  const serviceId = opts?.serviceId || String(Date.now()).slice(-10);
  const kind = opts?.refund ? ("refund" as const) : ("pay" as const);
  // Niðurstaðan fer alltaf í annálinn — líka villur, því "villa hjá okkur" getur verið
  // "heimild hjá kortaútgefanda" (tvöfalda-frátektar-tilfellið) og þarf að vera rekjanleg.
  // EKKI await: svar til kassans má aldrei hanga á annálsskrifum (hangandi DB frysti annars
  // approved-svarið — og frosinn biðskjár endar í "Hætta við" + endurtekinni rukkun).
  // amount = það sem posinn RAUNVERULEGA rukkar (EUR-test: kr/100) svo afstemming við Straum stemmi.
  const done = (r: TerminalResult): TerminalResult => {
    void logTerminal({ kind, poiid: poiId, serviceId, ref, amount: requestedAmount(amountKr, c.currency), currency: c.currency, approved: r.approved, error: r.unknown ? `ÓVÍST: ${r.error ?? ""}` : r.error, poiTxId: r.poiTxId });
    return r;
  };

  const body = {
    SaleToPOIRequest: {
      MessageHeader: { ProtocolVersion: "3.0", MessageClass: "Service", MessageCategory: "Payment", MessageType: "Request", SaleID: saleId, ServiceID: serviceId, POIID: poiId },
      PaymentRequest: {
        // MOTO (símgreiðsla / phone order): tenderOption=MOTO makes the terminal prompt the cashier to
        // KEY the card number on the posi itself (PCI-safe — the PAN never touches our system). Requires
        // "Allow MOTO payments" enabled on the terminal in the Adyen/Straumur Customer Area.
        SaleData: { SaleTransactionID: { TransactionID: ref, TimeStamp: new Date().toISOString() }, ...(opts?.moto ? { SaleToAcquirerData: "tenderOption=MOTO" } : {}) },
        PaymentTransaction: { AmountsReq: { Currency: c.currency, RequestedAmount: requestedAmount(amountKr, c.currency) } },
        ...(opts?.refund ? { PaymentData: { PaymentType: "Refund" } } : {}),
      },
    },
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180_000); // Adyen holds the sync connection ~150s waiting for the card
  let res: Response;
  try {
    res = await fetch(endpoint(c), { method: "POST", headers: { ...authHeaders(c), "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    // Sambandið við skýið rofnaði MEÐAN posinn var mögulega að klára færsluna. Spyrjum skýið
    // um afdrif hennar HÉR — þetta má aldrei skila sér sem venjuleg höfnun, því höfnun býður
    // afgreiðslumanninum að reyna aftur og viðskiptavinurinn getur þá verið rukkaður tvisvar.
    const v = await queryTerminalTransaction(serviceId, { poiid: poiId, saleId });
    if (v.known) return done({ approved: v.approved === true, error: v.approved ? undefined : (v.error ?? "hafnað"), poiTxId: v.poiTxId });
    return done({ approved: false, unknown: true, error: "Náði ekki sambandi við posa: " + (e instanceof Error ? e.message : "") });
  } finally { clearTimeout(t); }

  const text = await res.text();
  // 5xx frá skýinu er líka TVÍRÆTT (beiðnin gæti hafa unnist) — 4xx þýðir að hún vannst ekki.
  if (!res.ok) return done({ approved: false, unknown: res.status >= 500, error: `Posi HTTP ${res.status}: ${text.slice(0, 200)}` });
  let d: Record<string, unknown>;
  try { d = JSON.parse(text); } catch { return done({ approved: false, error: "Ógilt svar frá posa" }); }

  // Adyen may reply with an EventNotification/Reject (e.g. the terminal is offline) instead of a payment response.
  const ev = ((d.SaleToPOIRequest as Record<string, unknown>)?.EventNotification) as Record<string, unknown> | undefined;
  if (ev?.EventToNotify === "Reject") {
    const det = String(ev.EventDetails ?? "");
    const msg = /POI/i.test(det)
      ? "Posinn svarar ekki — athugaðu að hann sé kveiktur, nettengdur og í skýjastillingu (cloud)."
      : (decodeURIComponent(det.replace(/^message=/, "").replace(/\+/g, " ")) || "Posi hafnaði beiðni");
    return done({ approved: false, error: msg });
  }

  const pr = (((d.SaleToPOIResponse as Record<string, unknown>)?.PaymentResponse) ?? {}) as Record<string, unknown>;
  const resp = (pr.Response ?? {}) as Record<string, unknown>;
  const poiTxId = (((pr.POIData as Record<string, unknown>)?.POITransactionID) as Record<string, unknown>)?.TransactionID as string | undefined;
  if (resp.Result === "Success") return done({ approved: true, poiTxId });
  let msg = String(resp.ErrorCondition || resp.AdditionalResponse || "Greiðslu hafnað");
  try { msg = decodeURIComponent(msg); } catch { /* leave raw */ }
  return done({ approved: false, error: msg, poiTxId });
}

/** Spyrja posann/skýið um AFDRIF greiðslu (nexo TransactionStatus) þegar sambandið rofnaði og
 *  óvíst er hvort rukkað var. `known:true` = öruggt svar (approved segir hvort rukkað var);
 *  `known:false` = enn í vinnslu eða fyrirspurnin sjálf brást — EKKI reyna aftur í blindni. */
export async function queryTerminalTransaction(origServiceId: string, opts?: { poiid?: string; saleId?: string }): Promise<{ known: boolean; approved?: boolean; error?: string; poiTxId?: string }> {
  const c = adyenConfig();
  if (!adyenEnabled()) return { known: false, error: "Posa-tenging er ekki uppsett." };
  const poiId = opts?.poiid || c.poiId;
  const saleId = opts?.saleId || c.saleId;
  const done = (r: { known: boolean; approved?: boolean; error?: string; poiTxId?: string }) => {
    void logTerminal({ kind: "verify", poiid: poiId, serviceId: origServiceId, approved: r.approved, error: r.known ? r.error : `ósvarað: ${r.error ?? ""}`, poiTxId: r.poiTxId });
    return r;
  };
  // NotFound í FYRSTU tilraun getur verið tímaröðun (upprunalega beiðnin enn á leið í skýið
  // þegar sambandið rofnaði okkar megin) — "aldrei rukkað" má ekki fullyrðast fyrr en NotFound
  // fæst líka eftir stutta bið, annars rukkar "óhætt að reyna aftur" ofan á seinkuðu færsluna.
  for (let attempt = 0; ; attempt++) {
    const r = await queryStatusOnce(c, poiId, saleId, origServiceId);
    if (r.notFound && attempt === 0) { await new Promise((res) => setTimeout(res, 4000)); continue; }
    return done({ known: r.known, approved: r.approved, error: r.error, poiTxId: r.poiTxId });
  }
}

async function queryStatusOnce(c: AdyenCfg, poiId: string, saleId: string, origServiceId: string): Promise<{ known: boolean; approved?: boolean; error?: string; poiTxId?: string; notFound?: boolean }> {
  const body = {
    SaleToPOIRequest: {
      MessageHeader: { ProtocolVersion: "3.0", MessageClass: "Service", MessageCategory: "TransactionStatus", MessageType: "Request", SaleID: saleId, ServiceID: String(Date.now()).slice(-10), POIID: poiId },
      TransactionStatusRequest: { MessageReference: { MessageCategory: "Payment", SaleID: saleId, ServiceID: origServiceId } },
    },
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(endpoint(c), { method: "POST", headers: { ...authHeaders(c), "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    return { known: false, error: e instanceof Error ? e.message : "net" };
  } finally { clearTimeout(t); }
  const text = await res.text();
  if (!res.ok) return { known: false, error: `HTTP ${res.status}` };
  let d: Record<string, unknown>;
  try { d = JSON.parse(text); } catch { return { known: false, error: "ógilt svar" }; }
  const tsr = (((d.SaleToPOIResponse as Record<string, unknown>)?.TransactionStatusResponse) ?? {}) as Record<string, unknown>;
  const outer = (tsr.Response ?? {}) as Record<string, unknown>;
  if (outer.Result === "Success") {
    // Svarið ber upprunalega PaymentResponse-ið endurtekið (RepeatedMessageResponse).
    const rep = ((((tsr.RepeatedMessageResponse as Record<string, unknown>)?.RepeatedResponseMessageBody) as Record<string, unknown>)?.PaymentResponse ?? {}) as Record<string, unknown>;
    const resp = (rep.Response ?? {}) as Record<string, unknown>;
    const poiTxId = (((rep.POIData as Record<string, unknown>)?.POITransactionID) as Record<string, unknown>)?.TransactionID as string | undefined;
    return { known: true, approved: resp.Result === "Success", poiTxId, error: resp.Result === "Success" ? undefined : String(resp.ErrorCondition ?? "hafnað") };
  }
  const cond = String(outer.ErrorCondition ?? "");
  // NotFound = færslan náði aldrei í vinnslu → EKKI rukkað. InProgress = enn á posanum → óvíst.
  if (/notfound/i.test(cond)) return { known: true, approved: false, error: "fannst ekki (aldrei rukkað)", notFound: true };
  return { known: false, error: cond || "óvíst" };
}

/** Refund a card on the terminal (skil/endurgreiðsla). Standalone: the shopper presents a card and
 *  the amount is credited to it — no reference to the original sale needed, matching the till's
 *  scan-fresh return flow. Same blocking/abort behaviour as a payment. */
export function sendRefundToTerminal(amountKr: number, ref: string, opts?: { poiid?: string; saleId?: string; serviceId?: string }): Promise<TerminalResult> {
  return sendPaymentToTerminal(amountKr, ref, { ...opts, refund: true });
}

/** Cancel an in-flight payment ON the terminal (Nexo Abort) — cashier pressed "Hætta við" so the
 *  posi clears itself instead of needing the red X pressed physically. serviceId = the payment's. */
export async function abortTerminalPayment(opts: { poiid?: string; saleId?: string; serviceId: string }): Promise<{ ok: boolean; error?: string }> {
  const c = adyenConfig();
  if (!adyenEnabled()) return { ok: false, error: "Posa-tenging er ekki uppsett." };
  const poiId = opts.poiid || c.poiId;
  const saleId = opts.saleId || c.saleId;
  const body = {
    SaleToPOIRequest: {
      MessageHeader: { ProtocolVersion: "3.0", MessageClass: "Service", MessageCategory: "Abort", MessageType: "Request", SaleID: saleId, ServiceID: String(Date.now()).slice(-10), POIID: poiId },
      AbortRequest: {
        AbortReason: "MerchantAbort",
        MessageReference: { MessageCategory: "Payment", SaleID: saleId, ServiceID: opts.serviceId },
      },
    },
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(endpoint(c), { method: "POST", headers: { ...authHeaders(c), "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    await res.text().catch(() => "");
    void logTerminal({ kind: "abort", poiid: poiId, serviceId: opts.serviceId, approved: res.ok });
    return { ok: res.ok };
  } catch (e) {
    void logTerminal({ kind: "abort", poiid: poiId, serviceId: opts.serviceId, approved: false, error: e instanceof Error ? e.message : "" });
    return { ok: false, error: e instanceof Error ? e.message : "" };
  } finally { clearTimeout(t); }
}
