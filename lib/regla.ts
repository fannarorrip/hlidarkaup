// Shared Regla REST API helper (token cache + calls)
const REGLA_BASE = process.env.REGLA_BASE_URL ?? "https://www.regla.is/fibs/RestAPI2019";
const REGLA_USER = process.env.REGLA_USERNAME ?? "";
const REGLA_PASS = process.env.REGLA_PASSWORD ?? "";

let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getReglaToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${REGLA_BASE}/Login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: REGLA_USER, password: REGLA_PASS }),
  });
  const data = await res.json();
  if (!data?.Result?.Success) throw new Error("Regla login failed");
  const token = data.Result.Messages?.[0];
  if (!token || token.startsWith("INFO_")) throw new Error("No token");
  cachedToken = token;
  tokenExpiry = Date.now() + 20 * 60 * 1000;
  return token;
}

export async function reglaPost(endpoint: string, body: object) {
  const res = await fetch(`${REGLA_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Regla ${endpoint} HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReglaProduct = any;

/** Gross price (with VAT) in whole ISK for a Regla product. */
export function grossPrice(p: ReglaProduct): number {
  const net = p.UnitPrice ?? 0;
  return Math.round(net * (1 + vatPct(p) / 100));
}

/** VAT percentage for a Regla product (defaults to 24%). */
export function vatPct(p: ReglaProduct): number {
  return p.VatDefinition?.Percentage ?? 24;
}
