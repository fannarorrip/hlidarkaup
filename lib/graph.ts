// Microsoft Graph client — app-only (client-credentials) OAuth, READ-ONLY.
// Reads the Hlíðarkaup mailbox to pull invoice attachments into Skráning.
// The mailbox is never modified; dedupe is done in the DB (acc.email_invoices.message_id).
//
//   MS_TENANT_ID       Azure AD tenant (directory) id
//   MS_CLIENT_ID       app registration (client) id
//   MS_CLIENT_SECRET   client secret value
//   MS_MAILBOX         mailbox UPN, e.g. hlidarkaup@hlidarkaup.is
//
// The app registration needs the *application* permission Mail.Read with admin
// consent, scoped to this one mailbox via an Exchange Application Access Policy
// (see deploy/EMAIL_ONBOARDING.md) — otherwise application Mail.Read reads every
// mailbox in the tenant.
import { randomUUID } from "crypto";

const GRAPH = "https://graph.microsoft.com/v1.0";

interface GraphConfig { tenantId: string; clientId: string; clientSecret: string; mailbox: string }
function cfg(): GraphConfig {
  return {
    tenantId: process.env.MS_TENANT_ID || "",
    clientId: process.env.MS_CLIENT_ID || "",
    clientSecret: process.env.MS_CLIENT_SECRET || "",
    mailbox: process.env.MS_MAILBOX || "",
  };
}

export interface GraphStatus {
  mailbox: string;
  have: { tenantId: boolean; clientId: boolean; clientSecret: boolean; mailbox: boolean };
  ready: boolean;
}
export function graphStatus(): GraphStatus {
  const c = cfg();
  const has = (v: string) => v.length > 0;
  return {
    mailbox: c.mailbox,
    have: { tenantId: has(c.tenantId), clientId: has(c.clientId), clientSecret: has(c.clientSecret), mailbox: has(c.mailbox) },
    ready: has(c.tenantId) && has(c.clientId) && has(c.clientSecret) && has(c.mailbox),
  };
}

let _token: { value: string; exp: number } | null = null;

export async function graphToken(force = false): Promise<string> {
  const c = cfg();
  if (!c.tenantId || !c.clientId || !c.clientSecret) throw new Error("Microsoft 365 tenging er ekki fullstillt (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET).");
  if (!force && _token && Date.now() < _token.exp - 60_000) return _token.value;
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token endpoint svaraði ${res.status}: ${text.slice(0, 300)}`);
  const j = JSON.parse(text);
  const token = j.access_token as string;
  if (!token) throw new Error("Enginn aðgangslykill í svari frá Microsoft");
  _token = { value: token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return token;
}

async function graphGet<T>(path: string): Promise<T> {
  const token = await graphToken();
  const res = await fetch(path.startsWith("http") ? path : GRAPH + path, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json", "client-request-id": randomUUID() },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

export interface GraphMessage {
  id: string;
  subject: string;
  receivedDateTime: string;
  hasAttachments: boolean;
  from?: { emailAddress?: { name?: string; address?: string } };
}

/** List inbox messages with attachments, newest first, optionally received on/after sinceISO. */
export async function listInboxMessages(sinceISO?: string, top = 50): Promise<GraphMessage[]> {
  const c = cfg();
  if (!c.mailbox) throw new Error("MS_MAILBOX vantar.");
  // Graph throws "InefficientFilter" if $filter and $orderby reference different
  // properties (e.g. hasAttachments + receivedDateTime). So filter+sort on the SAME
  // property (receivedDateTime) and screen hasAttachments client-side.
  const qs =
    `?$select=${encodeURIComponent("id,subject,from,receivedDateTime,hasAttachments")}` +
    (sinceISO ? `&$filter=${encodeURIComponent("receivedDateTime ge " + sinceISO)}` : "") +
    `&$orderby=${encodeURIComponent("receivedDateTime desc")}` +
    `&$top=${top}`;
  const data = await graphGet<{ value: GraphMessage[] }>(`/users/${encodeURIComponent(c.mailbox)}/mailFolders/inbox/messages${qs}`);
  return (data.value ?? []).filter((m) => m.hasAttachments);
}

export interface GraphAttachment { id: string; name: string; contentType: string; size: number; contentBytes: string }

/** Get the file attachments (with base64 contentBytes) of a message. */
export async function getMessageAttachments(messageId: string): Promise<GraphAttachment[]> {
  const c = cfg();
  const data = await graphGet<{ value: (GraphAttachment & { "@odata.type"?: string })[] }>(
    `/users/${encodeURIComponent(c.mailbox)}/messages/${encodeURIComponent(messageId)}/attachments`);
  return (data.value ?? []).filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && a.contentBytes);
}

/** Light connectivity probe: fetch a token and read the inbox message count. */
export async function graphTest(): Promise<{ ok: boolean; mailbox: string; inboxCount?: number; error?: string }> {
  const c = cfg();
  try {
    await graphToken(true);
    const data = await graphGet<{ "@odata.count"?: number }>(
      `/users/${encodeURIComponent(c.mailbox)}/mailFolders/inbox?$select=totalItemCount`);
    return { ok: true, mailbox: c.mailbox, inboxCount: (data as { totalItemCount?: number }).totalItemCount };
  } catch (e) {
    return { ok: false, mailbox: c.mailbox, error: e instanceof Error ? e.message : String(e) };
  }
}
