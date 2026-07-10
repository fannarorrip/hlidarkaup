// inExchange SEND client (SOAP 1.1) for InvoiceService.svc — transmits outgoing e-invoices.
// Contract (from the WSDL): namespace http://inexchange.com; methods
//   HelloWorld() -> string
//   IsRecipient(Username, Password, ReceiverPartyIdentifier, ReceiverPartyIdentifierType) -> bool
//   InvoiceToInExchange(Username, Password, Subaccount, Filename, Invoice[base64]) -> Reply{ReturnCode,ReturnString}
// Auth = plain Username/Password body elements (same creds as the receive side; verified live).
// SENDING IS GATED: sendInvoice refuses unless INEXCHANGE_SEND_ENABLED=true — a human switch,
// because there is no reachable sandbox (ws-test does not resolve) so every send is a real, billable transmission.
import { XMLParser } from "fast-xml-parser";

const NS = "http://inexchange.com";
const ACTION = `${NS}/IInvoiceService`;

interface Cfg { url: string; user: string; pass: string; subaccount: string; enabled: boolean }
function cfg(): Cfg {
  return {
    url: process.env.INEXCHANGE_SEND_URL || "https://ws.inexchange.is/InvoiceService/InExchange.InvoiceService.InvoiceService.svc",
    user: process.env.INEXCHANGE_USERNAME || "",
    pass: process.env.INEXCHANGE_PASSWORD || "",
    subaccount: process.env.INEXCHANGE_SUBACCOUNT || "",
    enabled: (process.env.INEXCHANGE_SEND_ENABLED || "").toLowerCase() === "true",
  };
}

export interface SendStatus { configured: boolean; enabled: boolean; have: { url: boolean; user: boolean; pass: boolean } }
export function sendStatus(): SendStatus {
  const c = cfg(); const has = (v: string) => v.length > 0;
  return { configured: has(c.url) && has(c.user) && has(c.pass), enabled: c.enabled, have: { url: has(c.url), user: has(c.user), pass: has(c.pass) } };
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

async function soapCall(method: string, innerXml: string): Promise<Record<string, unknown>> {
  const c = cfg();
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><${method} xmlns="${NS}">${innerXml}</${method}></soap:Body></soap:Envelope>`;
  const res = await fetch(c.url, { method: "POST", headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: `"${ACTION}/${method}"` }, body: envelope });
  const text = await res.text();
  if (!res.ok) throw new Error(`inExchange send ${method} HTTP ${res.status}: ${text.slice(0, 400)}`);
  const parsed = parser.parse(text) as Record<string, unknown>;
  const body = ((parsed.Envelope as Record<string, unknown>)?.Body ?? {}) as Record<string, unknown>;
  return (body[`${method}Response`] as Record<string, unknown>) ?? body;
}

const creds = () => { const c = cfg(); return `<Username>${esc(c.user)}</Username><Password>${esc(c.pass)}</Password>`; };

/** Connectivity probe — no auth. */
export async function helloWorld(): Promise<{ ok: boolean; result?: string; error?: string }> {
  try {
    const r = await soapCall("HelloWorld", "");
    return { ok: true, result: String(r.HelloWorldResult ?? "") };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Can this kennitala receive e-invoices through inExchange? Read-only; safe to call any time. */
export async function isRecipient(kennitala: string): Promise<{ ok: boolean; recipient?: boolean; error?: string }> {
  const id = (kennitala || "").replace(/\D/g, "");
  if (id.length !== 10) return { ok: false, error: "Ógild kennitala" };
  try {
    const r = await soapCall("IsRecipient",
      `${creds()}<ReceiverPartyIdentifier>${esc(id)}</ReceiverPartyIdentifier><ReceiverPartyIdentifierType>IS_KT</ReceiverPartyIdentifierType>`);
    return { ok: true, recipient: String(r.IsRecipientResult ?? "").toLowerCase() === "true" };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export interface SendResult { ok: boolean; sent: boolean; returnCode?: number; returnString?: string; error?: string }

/** Transmit a UBL invoice (real, billable). GATED behind INEXCHANGE_SEND_ENABLED=true. */
export async function sendInvoice(filename: string, ublXml: string): Promise<SendResult> {
  const c = cfg();
  if (!c.enabled) return { ok: false, sent: false, error: "Rafræn sending er óvirk (INEXCHANGE_SEND_ENABLED=true til að virkja)." };
  if (!c.user || !c.pass) return { ok: false, sent: false, error: "inExchange innskráning vantar." };
  try {
    const b64 = Buffer.from(ublXml, "utf8").toString("base64");
    // Only send <Subaccount> when configured — inExchange rejects an empty value (ReturnCode 120).
    const subEl = c.subaccount ? `<Subaccount>${esc(c.subaccount)}</Subaccount>` : "";
    const r = await soapCall("InvoiceToInExchange",
      `${creds()}${subEl}<Filename>${esc(filename)}</Filename><Invoice>${b64}</Invoice>`);
    const reply = (r.InvoiceToInExchangeResult ?? {}) as Record<string, unknown>;
    const code = Number(reply.ReturnCode ?? -1);
    const str = String(reply.ReturnString ?? "");
    // inExchange success = ReturnCode 100 ("Reception successful"); 0 also accepted for safety.
    const success = code === 100 || code === 0;
    return { ok: success, sent: success, returnCode: code, returnString: str, error: success ? undefined : str || `ReturnCode ${code}` };
  } catch (e) { return { ok: false, sent: false, error: e instanceof Error ? e.message : String(e) }; }
}
