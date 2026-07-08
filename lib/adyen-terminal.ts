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

interface AdyenCfg { user: string; pass: string; apiKey: string; poiId: string; merchant: string; env: string; livePrefix: string; saleId: string; currency: string }

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

export interface TerminalResult { approved: boolean; error?: string; poiTxId?: string }

/** Run a card payment on the terminal. Blocks until the customer completes (or it times out).
 *  `opts` lets a specific register override the terminal (POIID) and SaleID it charges. */
export async function sendPaymentToTerminal(amountKr: number, ref: string, opts?: { poiid?: string; saleId?: string }): Promise<TerminalResult> {
  const c = adyenConfig();
  if (!adyenEnabled()) return { approved: false, error: "Posa-tenging er ekki uppsett." };
  const poiId = opts?.poiid || c.poiId;
  const saleId = opts?.saleId || c.saleId;

  const body = {
    SaleToPOIRequest: {
      MessageHeader: { ProtocolVersion: "3.0", MessageClass: "Service", MessageCategory: "Payment", MessageType: "Request", SaleID: saleId, ServiceID: String(Date.now()).slice(-10), POIID: poiId },
      PaymentRequest: {
        SaleData: { SaleTransactionID: { TransactionID: ref, TimeStamp: new Date().toISOString() } },
        PaymentTransaction: { AmountsReq: { Currency: c.currency, RequestedAmount: requestedAmount(amountKr, c.currency) } },
      },
    },
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180_000); // Adyen holds the sync connection ~150s waiting for the card
  let res: Response;
  try {
    res = await fetch(endpoint(c), { method: "POST", headers: { ...authHeaders(c), "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    return { approved: false, error: "Náði ekki sambandi við posa: " + (e instanceof Error ? e.message : "") };
  } finally { clearTimeout(t); }

  const text = await res.text();
  if (!res.ok) return { approved: false, error: `Posi HTTP ${res.status}: ${text.slice(0, 200)}` };
  let d: Record<string, unknown>;
  try { d = JSON.parse(text); } catch { return { approved: false, error: "Ógilt svar frá posa" }; }

  // Adyen may reply with an EventNotification/Reject (e.g. the terminal is offline) instead of a payment response.
  const ev = ((d.SaleToPOIRequest as Record<string, unknown>)?.EventNotification) as Record<string, unknown> | undefined;
  if (ev?.EventToNotify === "Reject") {
    const det = String(ev.EventDetails ?? "");
    const msg = /POI/i.test(det)
      ? "Posinn svarar ekki — athugaðu að hann sé kveiktur, nettengdur og í skýjastillingu (cloud)."
      : (decodeURIComponent(det.replace(/^message=/, "").replace(/\+/g, " ")) || "Posi hafnaði beiðni");
    return { approved: false, error: msg };
  }

  const pr = (((d.SaleToPOIResponse as Record<string, unknown>)?.PaymentResponse) ?? {}) as Record<string, unknown>;
  const resp = (pr.Response ?? {}) as Record<string, unknown>;
  const poiTxId = (((pr.POIData as Record<string, unknown>)?.POITransactionID) as Record<string, unknown>)?.TransactionID as string | undefined;
  if (resp.Result === "Success") return { approved: true, poiTxId };
  let msg = String(resp.ErrorCondition || resp.AdditionalResponse || "Greiðslu hafnað");
  try { msg = decodeURIComponent(msg); } catch { /* leave raw */ }
  return { approved: false, error: msg, poiTxId };
}
