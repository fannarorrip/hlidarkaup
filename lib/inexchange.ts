// inExchange e-invoice RECEIVE client (SOAP 1.1) for ws.inexchange.is/OutgoingInvoices/sksk.asmx.
// Poll loop: GetTransactionList → GetTransaction (payload = TS-236/UBL XML) → parse →
// goods-receipt draft (móttaka) → UpdateTransactionStatus (acknowledge). Auth = Authorization
// (username) + AuthorizationKey (password) on every call. See deploy/INEXCHANGE_ONBOARDING.md.
import { XMLParser } from "fast-xml-parser";
import { db } from "@/lib/db";
import { parsePeppolInvoice } from "@/lib/peppol";
import { createSkraningDraftFromParsed } from "@/lib/einvoice-inbound";

const NS = "http://skhub.transactions/";
const ACTION = "http://www.InExchange.is/"; // SOAPAction base (per the .asmx contract)

interface Cfg { url: string; user: string; pass: string; receiver: string; standard: string; txnType: string; ackStatus: string }
function cfg(): Cfg {
  return {
    url: process.env.INEXCHANGE_RECEIVE_URL || "https://ws.inexchange.is/OutgoingInvoices/sksk.asmx",
    user: process.env.INEXCHANGE_USERNAME || "",
    pass: process.env.INEXCHANGE_PASSWORD || "",
    receiver: process.env.INEXCHANGE_RECEIVER_ID || "",
    standard: process.env.INEXCHANGE_STANDARD || "",       // e.g. "TS236" (empty = all)
    txnType: process.env.INEXCHANGE_TRANSACTION_TYPE || "", // e.g. "invoice" (empty = all)
    ackStatus: process.env.INEXCHANGE_ACK_STATUS || "",     // status string to mark fetched (empty = don't ack; UUID dedupe protects)
  };
}

export interface InexchangeStatus { have: { url: boolean; user: boolean; pass: boolean; receiver: boolean }; ready: boolean }
export function inexchangeStatus(): InexchangeStatus {
  const c = cfg(); const has = (v: string) => v.length > 0;
  return { have: { url: has(c.url), user: has(c.user), pass: has(c.pass), receiver: has(c.receiver) }, ready: has(c.url) && has(c.user) && has(c.pass) && has(c.receiver) };
}

export function inexchangeWebhookSecret(): string { return process.env.INEXCHANGE_WEBHOOK_SECRET || ""; }

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });
const arr = <T>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

async function soapCall(method: string, innerXml: string): Promise<Record<string, unknown>> {
  const c = cfg();
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><${method} xmlns="${NS}">${innerXml}</${method}></soap:Body></soap:Envelope>`;
  const res = await fetch(c.url, { method: "POST", headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: `"${ACTION}${method}"` }, body: envelope });
  const text = await res.text();
  if (!res.ok) throw new Error(`inExchange ${method} HTTP ${res.status}: ${text.slice(0, 400)}`);
  const parsed = parser.parse(text) as Record<string, unknown>;
  const body = ((parsed.Envelope as Record<string, unknown>)?.Body ?? {}) as Record<string, unknown>;
  return (body[`${method}Response`] as Record<string, unknown>) ?? body;
}

const auth = () => { const c = cfg(); return `<Authorization>${esc(c.user)}</Authorization><AuthorizationKey>${esc(c.pass)}</AuthorizationKey>`; };

/** Connectivity probe — does NOT require credentials. Proves the SOAP client reaches inExchange. */
export async function ping(): Promise<{ ok: boolean; result?: string; error?: string }> {
  try {
    const r = await soapCall("Ping", "");
    return { ok: true, result: JSON.stringify(r).slice(0, 200) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

async function getTransactionList(): Promise<{ uuids: string[]; errorCode: string; errorMessage: string }> {
  const c = cfg();
  const r = await soapCall("GetTransactionList",
    `<ReceiverPartyIdentifier>${esc(c.receiver)}</ReceiverPartyIdentifier><Standard>${esc(c.standard)}</Standard><TransactionType>${esc(c.txnType)}</TransactionType>${auth()}`);
  const ret = (r.return ?? {}) as Record<string, unknown>;
  return { uuids: arr(ret.lines as unknown).map((x) => String(x)).filter(Boolean), errorCode: String(ret.errorCode ?? ""), errorMessage: String(ret.errorMessage ?? "") };
}

async function getTransaction(uuid: string): Promise<{ payload: string; sender: string; standard: string; errorCode: string; errorMessage: string }> {
  const r = await soapCall("GetTransaction", `<TransactionUUID>${esc(uuid)}</TransactionUUID>${auth()}`);
  const ret = (r.return ?? {}) as Record<string, unknown>;
  return { payload: String(ret.payload ?? ""), sender: String(ret.sender ?? ""), standard: String(ret.standard ?? ""), errorCode: String(ret.errorCode ?? ""), errorMessage: String(ret.errorMessage ?? "") };
}

async function updateTransactionStatus(uuid: string, status: string, msg: string): Promise<void> {
  await soapCall("UpdateTransactionStatus", `<TransactionUUID>${esc(uuid)}</TransactionUUID>${auth()}<Status>${esc(status)}</Status><ResultMessage>${esc(msg)}</ResultMessage>`);
}

// payload may be raw XML or base64-wrapped XML — detect and return the XML string.
function decodePayload(payload: string): string {
  const t = (payload || "").trim();
  if (t.startsWith("<")) return t;
  try { const d = Buffer.from(t, "base64").toString("utf8").trim(); if (d.startsWith("<")) return d; } catch { /* not base64 */ }
  return t;
}

export interface PollSummary { ok: boolean; configured: boolean; checked: number; created: number; skipped: number; errors: number; message?: string; error?: string }

/** Fetch new inExchange invoices → goods-receipt drafts (móttaka). Dedupes by transaction UUID. */
export async function inexchangePoll(): Promise<PollSummary> {
  const empty: PollSummary = { ok: false, configured: false, checked: 0, created: 0, skipped: 0, errors: 0 };
  if (!inexchangeStatus().ready) return { ...empty, message: "inExchange er ekki fullstillt (INEXCHANGE_USERNAME/PASSWORD/RECEIVER_ID)." };

  const list = await getTransactionList();
  if (list.errorCode) return { ...empty, configured: true, error: `inExchange: ${list.errorMessage || "villa"} (${list.errorCode})` };

  const out: PollSummary = { ok: true, configured: true, checked: list.uuids.length, created: 0, skipped: 0, errors: 0 };
  const c = cfg();
  for (const uuid of list.uuids.slice(0, 50)) {
    try {
      // Dedupe in the Skráning Pósthólf (received e-invoices land there, not in Móttaka).
      if ((await db.query(`select 1 from acc.email_invoices where message_id = $1`, [`inexchange:${uuid}`])).rows[0]) { out.skipped++; continue; }
      const t = await getTransaction(uuid);
      if (t.errorCode) { out.errors++; continue; }
      const xml = decodePayload(t.payload);
      const parsed = parsePeppolInvoice(xml);
      const res = await createSkraningDraftFromParsed(parsed, xml, uuid);
      if (res.created) out.created++; else out.skipped++;
      if (res.created && c.ackStatus) { try { await updateTransactionStatus(uuid, c.ackStatus, "Móttekið — Hlíðarkaup"); } catch { /* ack failure is non-fatal; UUID dedupe protects */ } }
    } catch { out.errors++; }
  }
  return out;
}
