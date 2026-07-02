// Signed staff session token (HMAC-SHA256, Web Crypto — works in both the
// Edge middleware and Node route handlers). Stateless httpOnly cookie.
const SECRET =
  process.env.STAFF_SESSION_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "dev-insecure-secret-change-me";

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64urlEncode = (str: string) => b64urlFromBytes(new TextEncoder().encode(str));
function b64urlDecode(b64: string): string {
  const str = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlFromBytes(new Uint8Array(sig));
}

export interface StaffSession { email: string; sub?: string; role: string; exp: number; }

export async function createStaffSession(
  payload: { email: string; sub?: string; role: string }, ttlSeconds = 60 * 60 * 12,
): Promise<string> {
  const body: StaffSession = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const p = b64urlEncode(JSON.stringify(body));
  return `${p}.${await sign(p)}`;
}

export async function verifyStaffSession(token: string): Promise<StaffSession | null> {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const p = token.slice(0, dot);
  const s = token.slice(dot + 1);
  if (s !== (await sign(p))) return null;
  try {
    const body = JSON.parse(b64urlDecode(p)) as StaffSession;
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export const STAFF_COOKIE = "hk_staff";
