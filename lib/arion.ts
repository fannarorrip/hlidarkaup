// Arion B2B / Business API client.
//   PRODUCTION: OAuth2 client_credentials over mutual-TLS (mTLS) with a búnaðarskilríki (.pfx).
//   SANDBOX:    no cert/mTLS — a portal-generated bearer token (ARION_ACCESS_TOKEN) + subscription key.
// Host + Cards paths were confirmed against the live sandbox (GET /cards/api/v1/cards → 200).
// NB the gateway wants the request-id header spelled `xRequestID` (not X-Request-ID).
//   ARION_SANDBOX            "true" → sandbox host + no mTLS
//   ARION_BASE_URL           gateway host (default apigwsandbox/apigw .arionbanki.is by sandbox flag)
//   ARION_TOKEN_URL          OAuth token endpoint (production only)
//   ARION_USERNAME/PASSWORD  dedicated netbank user (production OAuth client_id/secret)
//   ARION_SUBSCRIPTION_KEY   Ocp-Apim-Subscription-Key from the developer portal
//   ARION_ACCESS_TOKEN       sandbox: paste the portal "Generate Token" JWT (expires ~1 h)
//   ARION_CERT_PATH/PASSWORD búnaðarskilríki .pfx (production mTLS)
//   ARION_SCOPE              (default "openid b2b")
//   ARION_CARDS_PATH / ARION_CARD_TX_PATH   override the Cards endpoint paths
import https from "https";
import fs from "fs";
import { randomUUID, createHash } from "crypto";

interface ArionConfig {
  sandbox: boolean; baseUrl: string; tokenUrl: string; username: string; password: string;
  subscriptionKey: string; psd2Key: string; claimsKey: string; accessToken: string;
  certPath: string; certPassword: string; scope: string; redirectUri: string; psuId: string;
}

function cfg(): ArionConfig {
  const sandbox = process.env.ARION_SANDBOX === "true";
  return {
    sandbox,
    baseUrl: process.env.ARION_BASE_URL || (sandbox ? "https://apigwsandbox.arionbanki.is" : "https://apigw.arionbanki.is"),
    tokenUrl: process.env.ARION_TOKEN_URL || "https://apigw.arionbanki.is/oauth/v2/oauth-token",
    username: process.env.ARION_USERNAME || "",
    password: process.env.ARION_PASSWORD || "",
    subscriptionKey: process.env.ARION_SUBSCRIPTION_KEY || "",          // Cards product
    psd2Key: process.env.ARION_PSD2_SUBSCRIPTION_KEY || "",             // PSD2 product (separate!)
    claimsKey: process.env.ARION_CLAIMS_SUBSCRIPTION_KEY || "",         // Claims product (separate!)
    accessToken: process.env.ARION_ACCESS_TOKEN || "",                  // SANDBOX ONLY (portal token)
    certPath: process.env.ARION_CERT_PATH || "",
    certPassword: process.env.ARION_CERT_PASSWORD || "",
    scope: process.env.ARION_SCOPE || "openid b2b",
    redirectUri: process.env.ARION_REDIRECT_URI || "",                  // REQUIRED in production
    psuId: process.env.ARION_PSU_ID || "",                              // netbank user kt (payments)
  };
}

export interface ArionStatus {
  sandbox: boolean; baseUrl: string; tokenUrl: string;
  have: {
    username: boolean; password: boolean; subscriptionKey: boolean; psd2Key: boolean; claimsKey: boolean;
    accessToken: boolean; certPath: boolean; certPassword: boolean; certFileFound: boolean; redirectUri: boolean;
  };
  /** Cards-family readiness (back-compat alias of readyCards). */
  ready: boolean;
  readyCards: boolean;
  readyPsd2: boolean;
  readyClaims: boolean;
}
export function arionStatus(): ArionStatus {
  const c = cfg();
  const has = (v: string) => v.length > 0;
  const certFileFound = c.certPath ? (() => { try { return fs.existsSync(c.certPath); } catch { return false; } })() : false;
  // Base auth: sandbox = portal token; production = OAuth client creds over mTLS.
  const authReady = c.sandbox
    ? has(c.accessToken)
    : has(c.username) && has(c.password) && has(c.certPath) && certFileFound;
  const readyCards = authReady && has(c.subscriptionKey);
  const readyPsd2 = authReady && has(c.psd2Key) && (c.sandbox || has(c.redirectUri));
  const readyClaims = authReady && has(c.claimsKey);
  return {
    sandbox: c.sandbox, baseUrl: c.baseUrl, tokenUrl: c.tokenUrl,
    have: {
      username: has(c.username), password: has(c.password), subscriptionKey: has(c.subscriptionKey),
      psd2Key: has(c.psd2Key), claimsKey: has(c.claimsKey), accessToken: has(c.accessToken),
      certPath: has(c.certPath), certPassword: has(c.certPassword), certFileFound, redirectUri: has(c.redirectUri),
    },
    ready: readyCards, readyCards, readyPsd2, readyClaims,
  };
}

function httpsRequest(opts: https.RequestOptions, body?: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode || 0, text: d }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

let _token: { value: string; exp: number } | null = null;

export async function arionAccessToken(force = false): Promise<string> {
  const c = cfg();
  // Portal tokens are a SANDBOX convenience only — in production a leftover ARION_ACCESS_TOKEN
  // must never bypass OAuth/mTLS (it expires in ~1h and would 401 everything).
  if (c.sandbox && c.accessToken) return c.accessToken;
  if (!c.sandbox && (!c.certPath || !fs.existsSync(c.certPath))) {
    throw new Error("Búnaðarskilríki vantar (ARION_CERT_PATH) — framleiðsla notar OAuth yfir mTLS.");
  }
  if (!force && _token && Date.now() < _token.exp - 30_000) return _token.value;
  const u = new URL(c.tokenUrl);
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: c.username, client_secret: c.password, scope: c.scope }).toString();
  const { status, text } = await httpsRequest({
    hostname: u.hostname, port: u.port ? Number(u.port) : 443, path: u.pathname + u.search, method: "POST",
    pfx: fs.readFileSync(c.certPath), passphrase: c.certPassword,
    headers: { "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(body), accept: "application/json" },
  }, body);
  if (status < 200 || status >= 300) throw new Error(`Token endpoint svaraði ${status}: ${text.slice(0, 300)}`);
  let token = "", exp = Date.now() + 3_000_000;
  try { const j = JSON.parse(text); token = j.access_token || j.token || ""; if (j.expires_in) exp = Date.now() + Number(j.expires_in) * 1000; }
  catch { token = text.trim(); }
  if (!token) throw new Error("Enginn aðgangslykill í svari frá Arion");
  _token = { value: token, exp };
  return token;
}

// Authenticated Arion API call. mTLS is attached only in production (sandbox uses no cert).
// init.bearerToken overrides the env/OAuth token (used for the on-page sandbox tester).
export async function arionRequest(path: string, init: { method?: string; body?: string; headers?: Record<string, string>; bearerToken?: string; subscriptionKey?: string } = {}) {
  const c = cfg();
  const token = init.bearerToken || await arionAccessToken();
  const u = new URL(path.startsWith("http") ? path : c.baseUrl + path);
  const withCert = !c.sandbox && !!c.certPath && fs.existsSync(c.certPath);
  const rid = randomUUID();
  return httpsRequest({
    hostname: u.hostname, port: u.port ? Number(u.port) : 443, path: u.pathname + u.search, method: init.method || "GET",
    ...(withCert ? { pfx: fs.readFileSync(c.certPath), passphrase: c.certPassword } : {}),
    headers: {
      accept: "application/json",
      "Ocp-Apim-Subscription-Key": init.subscriptionKey || c.subscriptionKey,
      Authorization: `Bearer ${token}`,
      xRequestID: rid,          // Cards API spelling
      "X-Request-ID": rid,      // PSD2 API spelling
      ...(init.body ? { "content-type": "application/json", "content-length": Buffer.byteLength(init.body) } : {}),
      ...(init.headers || {}),
    },
  }, init.body);
}

// ── Cards (Business API) adapter — paths confirmed live (list) + documented (transactions) ─────
const CARDS_LIST_PATH = process.env.ARION_CARDS_PATH || "/cards/api/v1/cards";
const cardTxPath = (cardId: string) =>
  (process.env.ARION_CARD_TX_PATH || "/cards/api/v1/cards/{id}/transactions").replace("{id}", encodeURIComponent(cardId));

export interface ArionCard { id: string; name?: string; maskedNumber?: string; holder?: string; currency?: string; available?: number }
export interface ArionCardTx { id: string; date: string; amount: number; currency?: string; description?: string; merchant?: string }

type Raw = Record<string, unknown>;
const pickStr = (o: Raw, ...keys: string[]): string | undefined => {
  for (const k of keys) { const v = o[k]; if (typeof v === "string" && v) return v; if (typeof v === "number") return String(v); }
  return undefined;
};
const pickNum = (o: Raw, ...keys: string[]): number => {
  for (const k of keys) { const v = o[k]; if (v != null && v !== "" && !isNaN(Number(v))) return Number(v); }
  return 0;
};
function asRows(j: unknown): Raw[] {
  if (Array.isArray(j)) return j as Raw[];
  if (j && typeof j === "object") {
    const o = j as Raw;
    for (const k of ["accounts", "cards", "transactions", "items", "data", "results", "return"]) if (Array.isArray(o[k])) return o[k] as Raw[];
  }
  return [];
}
// Arion card balances = [{balanceAmount:{amount,currency}, balanceType:"interimAvailable"|...}]
function availableBalance(c: Raw): number | undefined {
  const b = c.balances;
  if (!Array.isArray(b)) return undefined;
  const avail = (b as Raw[]).find((x) => x.balanceType === "interimAvailable") ?? (b as Raw[])[0];
  const amt = avail && typeof avail.balanceAmount === "object" ? (avail.balanceAmount as Raw) : undefined;
  return amt ? pickNum(amt, "amount") : undefined;
}

/** List the company's cards. `bearerToken` overrides the env token (on-page sandbox tester). */
export async function getArionCards(bearerToken?: string): Promise<ArionCard[]> {
  const r = await arionRequest(CARDS_LIST_PATH, { bearerToken });
  if (r.status < 200 || r.status >= 300) throw new Error(`Kortalisti — Arion svaraði ${r.status}: ${r.text.slice(0, 200)}`);
  return asRows(JSON.parse(r.text || "[]")).map((c) => ({
    id: pickStr(c, "resourceId", "id", "cardId", "panId") || "",
    name: pickStr(c, "displayName", "name", "product"),
    maskedNumber: pickStr(c, "maskedPan", "maskedCardNumber", "pan"),
    holder: pickStr(c, "cardholderName", "ownerName", "holder", "name"),
    currency: pickStr(c, "currency"),
    available: availableBalance(c),
  })).filter((c) => c.id);
}

// Transactions come back nested under cardTransactions.{booked,pending}[].
function cardTxRows(j: unknown): Raw[] {
  const o = (j && typeof j === "object" ? j : {}) as Raw;
  const ct = o.cardTransactions && typeof o.cardTransactions === "object" ? (o.cardTransactions as Raw) : undefined;
  if (ct) {
    const b = Array.isArray(ct.booked) ? (ct.booked as Raw[]) : [];
    const p = Array.isArray(ct.pending) ? (ct.pending as Raw[]) : [];
    return [...b, ...p];
  }
  return asRows(j);
}

/** Fetch card transactions for reconciliation against the card account (7716).
 *  bookingStatus + dateFrom + dateTo are REQUIRED by the API (route 404s without them);
 *  defaults to the last 90 days. */
export async function getArionCardTransactions(cardId: string, dateFrom?: string, dateTo?: string, bearerToken?: string): Promise<ArionCardTx[]> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const from = dateFrom || iso(new Date(now.getTime() - 90 * 864e5));
  const to = dateTo || iso(now);
  const qs = new URLSearchParams({ bookingStatus: "booked", dateFrom: from, dateTo: to });
  const r = await arionRequest(`${cardTxPath(cardId)}?${qs}`, { bearerToken });
  if (r.status < 200 || r.status >= 300) throw new Error(`Kortafærslur — Arion svaraði ${r.status}: ${r.text.slice(0, 200)}`);
  return cardTxRows(JSON.parse(r.text || "{}")).map((t) => {
    const amtObj = t.transactionAmount && typeof t.transactionAmount === "object" ? (t.transactionAmount as Raw) : t;
    return {
      id: pickStr(t, "cardTransactionId", "transactionId", "entryReference", "id") || "",
      date: pickStr(t, "transactionDate", "bookingDate", "acceptorTransactionDateTime", "date") || "",
      amount: pickNum(amtObj, "amount", "value") || pickNum(t, "amount", "value"),
      currency: pickStr(amtObj, "currency") || pickStr(t, "currency"),
      description: pickStr(t, "transactionDetails", "description", "text", "narrative", "merchantName"),
      merchant: pickStr(t, "transactionDetails", "merchant", "merchantName", "payee"),
    };
  });
}

// ── PSD2 / Open Banking (Accounts & Payments) adapter ─────────────────────────
// Base: {host}/psd2/api/v1 (from the Arion sandbox sample console). Consent flow:
// POST /consents → open _links.scaRedirect (browser SCA approval) → GET /accounts with the
// Consent-ID header. Same bearer token as Cards (openbanking scopes). Host by sandbox flag.
const PSD2_BASE = process.env.ARION_PSD2_PATH || "/psd2/api/v1";
// PSD2 is a SEPARATE product subscription from Cards. NO silent fallback to the Cards key —
// that produced opaque gateway 401s. Missing key = loud, fixable error.
const psd2Sub = (k?: string): string => {
  const key = k || process.env.ARION_PSD2_SUBSCRIPTION_KEY || "";
  if (!key) throw new Error("Vantar PSD2 áskriftarlykil (ARION_PSD2_SUBSCRIPTION_KEY) — sér vara, ekki sami lykill og Cards.");
  return key;
};
// SCA redirect: sandbox may fall back to localhost; production MUST have a registered URI.
function redirectUriOrThrow(override?: string): string {
  const c = cfg();
  const uri = override || c.redirectUri;
  if (uri) return uri;
  if (c.sandbox) return "http://localhost:3000/bokhald/bankatenging";
  throw new Error("Vantar ARION_REDIRECT_URI — skráða framleiðslu-slóð fyrir SCA-staðfestingu.");
}

export interface ArionConsent { consentId: string; status?: string; scaRedirect?: string }
export interface ArionAccount { id: string; iban?: string; name?: string; currency?: string; balance?: number }

function accountBalance(a: Raw): number | undefined {
  const b = a.balances;
  if (!Array.isArray(b)) return undefined;
  const pref = (b as Raw[]).find((x) => x.balanceType === "interimAvailable" || x.balanceType === "interimBooked") ?? (b as Raw[])[0];
  const amt = pref && typeof pref.balanceAmount === "object" ? (pref.balanceAmount as Raw) : undefined;
  return amt ? pickNum(amt, "amount") : undefined;
}

/** Create an account-information consent. Returns the consentId + the scaRedirect link to approve. */
export async function createArionConsent(opts: { psuId: string; ibans?: string[]; validUntil?: string; bearerToken?: string; subscriptionKey?: string; redirectUri?: string }): Promise<ArionConsent> {
  const access = opts.ibans && opts.ibans.length
    ? { accounts: opts.ibans.map((iban) => ({ iban })) }
    : { allPsd2: "allAccounts" };
  const validUntil = opts.validUntil || new Date(Date.now() + 89 * 864e5).toISOString();
  const body = JSON.stringify({ access, recurringIndicator: true, validUntil, frequencyPerDay: 4, combinedServiceIndicator: false });
  // Redirect SCA: the bank builds the scaRedirect with this URL and sends the PSU back here
  // after approval. Must match a Redirect URI registered on the app.
  const redirectUri = redirectUriOrThrow(opts.redirectUri);
  const r = await arionRequest(`${PSD2_BASE}/consents`, {
    method: "POST", body, bearerToken: opts.bearerToken, subscriptionKey: psd2Sub(opts.subscriptionKey),
    headers: {
      "content-type": "application/json-patch+json", "PSU-ID": opts.psuId, "PSU-IP-Address": "127.0.0.1",
      "TPP-Redirect-Preferred": "true", "TPP-Redirect-URI": redirectUri, "TPP-Nok-Redirect-URI": redirectUri,
    },
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`Samþykki — Arion svaraði ${r.status}: ${r.text.slice(0, 220)}`);
  const j = JSON.parse(r.text || "{}") as Raw;
  const links = (j._links || j.links) as Raw | undefined;
  const sca = links && typeof links.scaRedirect === "object" ? (links.scaRedirect as Raw) : undefined;
  return {
    consentId: pickStr(j, "consentId", "consentID", "id") || "",
    status: pickStr(j, "consentStatus", "status"),
    scaRedirect: sca ? pickStr(sca, "href") : undefined,
  };
}

/** Current status of a consent ("received" = not yet approved, "valid" = approved & usable). */
export async function getArionConsentStatus(consentId: string, bearerToken?: string, subscriptionKey?: string): Promise<string> {
  const r = await arionRequest(`${PSD2_BASE}/consents/${encodeURIComponent(consentId)}/status`, {
    bearerToken, subscriptionKey: psd2Sub(subscriptionKey), headers: { "Consent-ID": consentId, consentID: consentId },
  });
  if (r.status < 200 || r.status >= 300) return `HTTP ${r.status}`;
  try { return pickStr(JSON.parse(r.text || "{}") as Raw, "consentStatus", "status") || "?"; } catch { return "?"; }
}

/** List the PSU's accounts (requires an approved consentId). */
export async function getArionAccounts(consentId: string, bearerToken?: string, subscriptionKey?: string): Promise<ArionAccount[]> {
  const r = await arionRequest(`${PSD2_BASE}/accounts?withBalance=true`, { bearerToken, subscriptionKey: psd2Sub(subscriptionKey), headers: { "Consent-ID": consentId, consentID: consentId } });
  if (r.status < 200 || r.status >= 300) throw new Error(`Reikningar — Arion svaraði ${r.status}: ${r.text.slice(0, 220)}`);
  return asRows(JSON.parse(r.text || "[]")).map((a) => ({
    id: pickStr(a, "resourceId", "id", "accountId", "iban") || "",
    iban: pickStr(a, "iban"),
    name: pickStr(a, "name", "displayName", "product", "cashAccountType", "ownerName"),
    currency: pickStr(a, "currency"),
    balance: accountBalance(a),
  })).filter((a) => a.id);
}

// Bank-account statement line (Berlin Group). amount is SIGNED: positive = money in
// (credit to the account), negative = money out (debit). counterparty is the other party.
export interface ArionAccountTx {
  id: string; bookingDate: string; valueDate?: string; amount: number; currency?: string;
  counterparty?: string; remittance?: string; reference?: string;
}

// Statement lines come back nested under transactions.{booked,pending}[].
function accountTxRows(j: unknown): Raw[] {
  const o = (j && typeof j === "object" ? j : {}) as Raw;
  const t = o.transactions && typeof o.transactions === "object" ? (o.transactions as Raw) : undefined;
  if (t) {
    const b = Array.isArray(t.booked) ? (t.booked as Raw[]) : [];
    const p = Array.isArray(t.pending) ? (t.pending as Raw[]) : [];
    return [...b, ...p];
  }
  return asRows(j);
}

// remittanceInformationUnstructured may be a string or an array of strings. (Do NOT fall back to
// purposeCode — that's a coded enum, not human remittance text, and would pollute the voucher narrative.)
function remittance(t: Raw): string | undefined {
  const arr = t.remittanceInformationUnstructuredArray;
  if (Array.isArray(arr) && arr.length) return arr.filter((x) => typeof x === "string").join(" ").trim() || undefined;
  return pickStr(t, "remittanceInformationUnstructured", "additionalInformation");
}

/** Fetch an account's statement lines via PSD2 (Berlin Group GET /accounts/{id}/transactions).
 *  Requires an approved consentId (Consent-ID header). Only BOOKED lines are returned — pending
 *  entries lack a stable transactionId and re-key when they book, which would double-count them.
 *  PSD2 uses its OWN subscription key (separate product from Cards). */
export async function getArionAccountTransactions(
  accountId: string, consentId: string, dateFrom?: string, dateTo?: string, bearerToken?: string, subscriptionKey?: string,
): Promise<ArionAccountTx[]> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const from = dateFrom || iso(new Date(now.getTime() - 90 * 864e5));
  const to = dateTo || iso(now);
  const qs = new URLSearchParams({ bookingStatus: "booked", dateFrom: from, dateTo: to });
  const r = await arionRequest(`${PSD2_BASE}/accounts/${encodeURIComponent(accountId)}/transactions?${qs}`, {
    bearerToken, subscriptionKey: psd2Sub(subscriptionKey), headers: { "Consent-ID": consentId, consentID: consentId },
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`Hreyfingar — Arion svaraði ${r.status}: ${r.text.slice(0, 220)}`);
  const seen = new Map<string, number>(); // occurrence counter: identical lines must NOT collapse
  return accountTxRows(JSON.parse(r.text || "{}")).map((t) => {
    const amtObj = t.transactionAmount && typeof t.transactionAmount === "object" ? (t.transactionAmount as Raw) : t;
    const amount = pickNum(amtObj, "amount", "value") || pickNum(t, "amount", "value");
    const bookingDate = pickStr(t, "bookingDate", "valueDate", "transactionDate") || "";
    // incoming → the debtor is the payer; outgoing → the creditor is the payee. No cross-direction
    // fallback: substituting the other party would mislabel the counterparty as ourselves.
    const counterparty = amount >= 0
      ? pickStr(t, "debtorName", "ultimateDebtor")
      : pickStr(t, "creditorName", "ultimateCreditor");
    const rem = remittance(t);
    // Identity: stable bank ids only. endToEndId is often the shared literal "NOTPROVIDED", so it is
    // NOT used as identity (it would collapse distinct lines). When no stable id exists, synthesise a
    // deterministic key from the line's own fields; an occurrence suffix keeps two IDENTICAL lines
    // (same day, merchant, amount — e.g. two coffees) distinct instead of silently dropping one.
    const stableId = pickStr(t, "transactionId", "entryReference", "internalTransactionId");
    let id = stableId;
    if (!id) {
      const base = "syn_" + createHash("sha1").update(`${accountId}|${bookingDate}|${amount}|${counterparty || ""}|${rem || ""}`).digest("hex").slice(0, 20);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      id = n === 0 ? base : `${base}_${n}`;
    }
    return {
      id,
      bookingDate,
      valueDate: pickStr(t, "valueDate", "bookingDate"),
      amount,
      currency: pickStr(amtObj, "currency") || pickStr(t, "currency"),
      counterparty,
      remittance: rem,
      reference: pickStr(t, "endToEndId", "checkId", "mandateId"),
    };
  }).filter((t) => !!(t.amount || t.counterparty || t.remittance));
}

// ── PSD2 Payment Initiation (PIS) — pay a supplier ────────────────────────────
// POST /payments/{product}. The exact ISK domestic product string varies in Arion's docs
// (credit-transfers / sepa-credit-transfers) — override with ARION_PAYMENT_PRODUCT if needed.
// A payment does NOT reuse the AIS consent: it creates its own resource + its own SCA, dynamically
// bound to this amount + payee. Needs the openbanking.readwrite scope on the token.
const PAYMENT_PRODUCT = process.env.ARION_PAYMENT_PRODUCT || "sepa-credit-transfers";

export interface ArionPayment { paymentId: string; status?: string; scaRedirect?: string }

/** Initiate a single credit transfer. Returns the paymentId + the scaRedirect the PSU must open
 *  to authorise THIS payment. amount is a positive number (formatted to 2 decimals for the API). */
export async function createArionPayment(opts: {
  debtorIban: string; creditorIban: string; creditorName: string; amount: number; currency?: string;
  remittance?: string; endToEndId?: string; psuId?: string; bearerToken?: string; subscriptionKey?: string; redirectUri?: string;
}): Promise<ArionPayment> {
  const body = JSON.stringify({
    debtorAccount: { iban: opts.debtorIban },
    instructedAmount: { currency: opts.currency || "ISK", amount: (Math.round(Math.abs(opts.amount) * 100) / 100).toFixed(2) },
    creditorAccount: { iban: opts.creditorIban },
    creditorName: (opts.creditorName || "").slice(0, 70),
    ...(opts.remittance ? { remittanceInformationUnstructured: opts.remittance.slice(0, 140) } : {}),
    ...(opts.endToEndId ? { endToEndIdentification: opts.endToEndId.slice(0, 35) } : {}),
  });
  const redirectUri = redirectUriOrThrow(opts.redirectUri);
  const r = await arionRequest(`${PSD2_BASE}/payments/${encodeURIComponent(PAYMENT_PRODUCT)}`, {
    method: "POST", body, bearerToken: opts.bearerToken, subscriptionKey: psd2Sub(opts.subscriptionKey),
    headers: {
      "content-type": "application/json", "PSU-IP-Address": "127.0.0.1",
      ...(opts.psuId ? { "PSU-ID": opts.psuId } : {}),
      "TPP-Redirect-Preferred": "true", "TPP-Redirect-URI": redirectUri, "TPP-Nok-Redirect-URI": redirectUri,
    },
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`Greiðsla — Arion svaraði ${r.status}: ${r.text.slice(0, 220)}`);
  const j = JSON.parse(r.text || "{}") as Raw;
  const links = (j._links || j.links) as Raw | undefined;
  const sca = links && typeof links.scaRedirect === "object" ? (links.scaRedirect as Raw) : undefined;
  return {
    paymentId: pickStr(j, "paymentId", "paymentID", "id") || "",
    status: pickStr(j, "transactionStatus", "status"),
    scaRedirect: sca ? pickStr(sca, "href") : (links ? pickStr(links, "scaRedirect") : undefined),
  };
}

/** Poll a payment's status. RCVD (received) → ACTC/ACCP (validated, PRE-SCA) → after the PSU
 *  authorises: ACSP (settlement in progress) → ACSC/ACCC (settlement COMPLETED) or RJCT (rejected).
 *  Only ACSC/ACCC mean the transfer actually executed — never treat the earlier states as paid. */
export async function getArionPaymentStatus(paymentId: string, bearerToken?: string, subscriptionKey?: string): Promise<string> {
  const r = await arionRequest(`${PSD2_BASE}/payments/${encodeURIComponent(PAYMENT_PRODUCT)}/${encodeURIComponent(paymentId)}/status`, {
    bearerToken, subscriptionKey: psd2Sub(subscriptionKey),
  });
  if (r.status < 200 || r.status >= 300) return `HTTP ${r.status}`;
  try { return pickStr(JSON.parse(r.text || "{}") as Raw, "transactionStatus", "status") || "?"; } catch { return "?"; }
}

// ── Claims / Innheimta (Business API REST) — issue greiðsluseðlar to customers ─────
// Arion wraps RB's Kröfupottur in a REST Claims API (same mTLS/búnaðarskilríki auth as Cards).
// Claims is its own product subscription → its own key. Request/response shapes follow the
// OFFICIAL reference (confirmed by Arion, July 2026):
//   https://arionbanki.gitbook.io/arion-banki/business-apis/claims-api/claims-api-refererence
// A claim is keyed by claimKey = { claimantId (kt), account (12 digits: 4-digit útibú + '66' +
// 6-digit kröfunúmer), dueDate }; finalDueDate and expirationDate are REQUIRED. NOTE: the claims
// sandbox is not live yet (Arion targets autumn 2026) — gated by ARION_CLAIMS_ENABLED until a
// controlled production test passes.
const CLAIMS_BASE = process.env.ARION_CLAIMS_API_PATH || "/claims/api/v1";
const claimsSub = (k?: string): string => {
  const key = k || process.env.ARION_CLAIMS_SUBSCRIPTION_KEY || "";
  if (!key) throw new Error("Vantar Claims áskriftarlykil (ARION_CLAIMS_SUBSCRIPTION_KEY) — sér vara, ekki sami lykill og Cards.");
  return key;
};

export interface ArionClaimInput {
  claimantKennitala: string;  // kt kröfuhafa (verslunarinnar) — claimKey.claimantId
  claimBank: string;          // 4-digit útibú from the innheimtusamningur
  claimNumber: string;        // 6-digit kröfunúmer (we use the invoice/voucher number)
  templateCode: string;       // kröfusnið ([0-9A-Z]{3} per the reference)
  debtorKennitala: string;    // kt greiðanda — payorId
  amount: number;             // upphæð (heilar krónur)
  dueDate: string;            // gjalddagi YYYY-MM-DD
  finalDueDate: string;       // eindagi — REQUIRED by the API
  expirationDate: string;     // lokadagur — REQUIRED by the API
  reference?: string;         // tilvísun (max 16)
  billNumber?: string;        // reikningsnúmer (max 7)
  customerNumber?: string;    // viðskiptanúmer (max 16)
  idempotencyKey?: string;    // UUID → X-Idempotency-Key (we pass the claim row id)
  paymentFeePrinting?: number;  // innheimtu-/tilkynningagjald, prentaður seðill (paymentFee.printingFee)
  paymentFeePaperless?: number; // sama, rafrænn seðill (paymentFee.paperlessFee) — bankinn leggur
                                // gjaldið ofan á; greiðandi borgar amount + gjald
}
// ok = HTTP 2xx (the request itself succeeded). claimRef may still be empty if the response used
// an unexpected field name — callers must NOT treat ok+empty-claimRef as a plain failure (the claim
// may exist at the bank), only as needs-review, so it isn't silently buried + un-retried.
export interface ArionClaimResult { ok: boolean; claimRef: string; status?: string; error?: string }

/** Create (register) a claim in the bank's Kröfupottur (POST /claims per the official reference).
 *  Returns the bank's claimId as claimRef. */
export async function createArionClaim(claim: ArionClaimInput, opts: { bearerToken?: string; subscriptionKey?: string } = {}): Promise<ArionClaimResult> {
  const digits = (s: string) => (s || "").replace(/\D/g, "");
  const claimant = digits(claim.claimantKennitala);
  const payor = digits(claim.debtorKennitala);
  const bank = digits(claim.claimBank);
  const num = digits(claim.claimNumber);
  if (claimant.length !== 10) return { ok: false, claimRef: "", status: "failed", error: "Kennitala kröfuhafa verður að vera 10 tölustafir (kröfustillingar)." };
  if (payor.length !== 10) return { ok: false, claimRef: "", status: "failed", error: "Kennitala greiðanda verður að vera 10 tölustafir." };
  if (bank.length !== 4) return { ok: false, claimRef: "", status: "failed", error: "Útibúsnúmer kröfureiknings verður að vera 4 tölustafir (kröfustillingar)." };
  if (num.length < 1 || num.length > 6) return { ok: false, claimRef: "", status: "failed", error: "Kröfunúmer verður að vera 1–6 tölustafir." };

  const account = `${bank}66${num.padStart(6, "0")}`;   // 12 digits: útibú + höfuðbók 66 + kröfunúmer
  const body = JSON.stringify({
    claimKey: { claimantId: claimant, account, dueDate: claim.dueDate },
    payorId: payor,
    templateCode: (claim.templateCode || "").toUpperCase().slice(0, 3),
    amount: Math.round(Math.abs(claim.amount) || 0),
    finalDueDate: claim.finalDueDate,
    expirationDate: claim.expirationDate,
    claimType: "NormalClaim",
    ...(claim.reference ? { reference: claim.reference.slice(0, 16) } : {}),
    ...(claim.billNumber ? { billNumber: digits(claim.billNumber).slice(0, 7) } : {}),
    ...(claim.customerNumber ? { customerNumber: claim.customerNumber.slice(0, 16) } : {}),
    ...(claim.paymentFeePrinting || claim.paymentFeePaperless
      ? { paymentFee: { printingFee: Math.round(claim.paymentFeePrinting || 0), paperlessFee: Math.round(claim.paymentFeePaperless || 0) } }
      : {}),
  });
  const r = await arionRequest(`${CLAIMS_BASE}/claims`, {
    method: "POST", body, bearerToken: opts.bearerToken, subscriptionKey: claimsSub(opts.subscriptionKey),
    ...(claim.idempotencyKey ? { headers: { "X-Idempotency-Key": claim.idempotencyKey } } : {}),
  });
  const j = (() => { try { return JSON.parse(r.text || "{}") as Raw; } catch { return {} as Raw; } })();
  const ok = r.status >= 200 && r.status < 300;
  const success = j.success && typeof j.success === "object" ? (j.success as Raw) : undefined;
  const errObj = j.error && typeof j.error === "object" ? (j.error as Raw) : undefined;

  if (!ok) {
    return { ok: false, claimRef: "", status: "failed", error: pickStr(j, "error", "message", "title", "detail") || `HTTP ${r.status}: ${r.text.slice(0, 160)}` };
  }
  if (success) {
    return { ok: true, claimRef: pickStr(success, "claimId") || account, status: "created" };
  }
  if (errObj) {
    const code = pickStr(errObj, "resultCode");
    // CLAIM_EXISTS: a retry hit a claim we already registered (e.g. after a crash mid-send) —
    // that's a success for our purposes; recover the claimId so settlement tracking works.
    if (code === "CLAIM_EXISTS") {
      return { ok: true, claimRef: pickStr(errObj, "claimId") || account, status: "created" };
    }
    return { ok: false, claimRef: pickStr(errObj, "claimId") || "", status: "failed", error: `${code}: ${pickStr(errObj, "resultMessage", "resultSubCode")}`.slice(0, 300) };
  }
  // 2xx but neither envelope — legacy fallback parse; caller treats ok+empty claimRef as needs-review.
  return {
    ok: true,
    claimRef: pickStr(j, "claimId", "claimNumber", "claimRef", "id") || "",
    status: pickStr(j, "status", "responseCode"),
  };
}

export interface ArionClaimPayment { date: string; amount: number }

// Settlements may be nested under a claims-specific wrapper key; try the likely ones.
function claimTxRows(j: unknown): Raw[] {
  if (Array.isArray(j)) return j as Raw[];
  if (j && typeof j === "object") {
    const o = j as Raw;
    for (const k of ["payments", "greidslur", "transactions", "claimTransactions", "items", "data", "results"]) if (Array.isArray(o[k])) return o[k] as Raw[];
  }
  return [];
}

/** Fetch settlements against a claim (greiðsluskrá). Sum of amounts ≥ claim amount ⇒ paid.
 *  NOTE: this subresource is NOT in the published reference excerpt — confirm the exact path
 *  against the claims sandbox when Arion releases it (autumn 2026). The documented alternative
 *  is GET /claims?dateFrom&dateTo&status=Paid, which the sync loop can switch to if needed. */
export async function getArionClaimTransactions(claimRef: string, opts: { bearerToken?: string; subscriptionKey?: string } = {}): Promise<ArionClaimPayment[]> {
  const r = await arionRequest(`${CLAIMS_BASE}/claims/${encodeURIComponent(claimRef)}/transactions`, {
    bearerToken: opts.bearerToken, subscriptionKey: claimsSub(opts.subscriptionKey),
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`Kröfuhreyfingar — Arion svaraði ${r.status}: ${r.text.slice(0, 200)}`);
  return claimTxRows(JSON.parse(r.text || "{}")).map((t) => {
    const amtObj = t.paymentAmount && typeof t.paymentAmount === "object" ? (t.paymentAmount as Raw) : t;
    return {
      date: pickStr(t, "paymentDate", "date", "bookingDate", "valueDate") || "",
      amount: pickNum(amtObj, "amount", "value") || pickNum(t, "paidAmount", "amount", "value"),
    };
  }).filter((p) => p.amount);
}
