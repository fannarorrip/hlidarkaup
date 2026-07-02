// Straumur card terminal = Adyen POS. Cloud Terminal API (nexo): our backend POSTs a payment
// request to Adyen's cloud, which drives the physical terminal and returns approved/declined.
// Fully gated — does nothing until ADYEN_API_KEY + ADYEN_POI_ID + ADYEN_MERCHANT_ACCOUNT are set.
//   ADYEN_TERMINAL_ENV = test (default) | live   ·   ADYEN_LIVE_URL_PREFIX (live only)
//   ADYEN_SALE_ID (optional POS id)
// ISK is a zero-decimal currency, so RequestedAmount is the plain króna amount.

interface AdyenCfg { apiKey: string; poiId: string; merchant: string; env: string; livePrefix: string; saleId: string }
export function adyenConfig(): AdyenCfg {
  return {
    apiKey: process.env.ADYEN_API_KEY ?? "",
    poiId: process.env.ADYEN_POI_ID ?? "",
    merchant: process.env.ADYEN_MERCHANT_ACCOUNT ?? "",
    env: (process.env.ADYEN_TERMINAL_ENV ?? "test").toLowerCase(),
    livePrefix: process.env.ADYEN_LIVE_URL_PREFIX ?? "",
    saleId: process.env.ADYEN_SALE_ID ?? "HlidarkaupTill",
  };
}
// Cloud Terminal API needs only the API key + POI ID (the terminal carries the merchant binding).
export function adyenEnabled(): boolean { const c = adyenConfig(); return !!(c.apiKey && c.poiId); }
function endpoint(c: AdyenCfg): string {
  return c.env === "live" ? `https://${c.livePrefix}-terminal-api-live.adyen.com/sync` : "https://terminal-api-test.adyen.com/sync";
}

export interface TerminalResult { approved: boolean; error?: string; poiTxId?: string }

/** Run a card payment on the terminal. Blocks until the customer completes (or it times out). */
export async function sendPaymentToTerminal(amountKr: number, ref: string): Promise<TerminalResult> {
  const c = adyenConfig();
  if (!adyenEnabled()) return { approved: false, error: "Posa-tenging er ekki uppsett." };

  const serviceId = String(Date.now()).slice(-10);
  const body = {
    SaleToPOIRequest: {
      MessageHeader: { ProtocolVersion: "3.0", MessageClass: "Service", MessageCategory: "Payment", MessageType: "Request", SaleID: c.saleId, ServiceID: serviceId, POIID: c.poiId },
      PaymentRequest: {
        SaleData: { SaleTransactionID: { TransactionID: ref, TimeStamp: new Date().toISOString() } },
        PaymentTransaction: { AmountsReq: { Currency: "ISK", RequestedAmount: Math.round(amountKr) } },
      },
    },
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 130000); // terminal interaction can take ~2 min
  let res: Response;
  try {
    res = await fetch(endpoint(c), { method: "POST", headers: { "x-API-key": c.apiKey, "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
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
  return { approved: false, error: String(resp.ErrorCondition || resp.AdditionalResponse || "Greiðslu hafnað"), poiTxId };
}
