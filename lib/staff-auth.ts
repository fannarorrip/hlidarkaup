// Server-side Supabase GoTrue helpers for staff auth: password grant, TOTP MFA
// (enroll / challenge / verify), and admin ops (create user, recovery link).
// The staff session itself is our own signed cookie (lib/staff-session) — these
// helpers only talk to Supabase over REST with the anon or service-role key.
const URL_ = () => process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SRV = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const staffAuthConfigured = () => !!(URL_() && ANON());
export const staffAdminConfigured = () => !!(URL_() && SRV());

async function goTrue(path: string, init: RequestInit & { token?: string; admin?: boolean }) {
  const key = init.admin ? SRV() : ANON();
  const headers: Record<string, string> = {
    apikey: key, "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  else if (init.admin) headers.authorization = `Bearer ${SRV()}`;
  const r = await fetch(`${URL_()}/auth/v1${path}`, { ...init, headers });
  const text = await r.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { ok: r.ok, status: r.status, json: json as Record<string, unknown> | null, text };
}

export interface PasswordGrant { ok: boolean; accessToken?: string; userId?: string; error?: string }

/** Verify email+password against Supabase. Returns an AAL1 access token. */
export async function passwordGrant(email: string, password: string): Promise<PasswordGrant> {
  const r = await goTrue(`/token?grant_type=password`, { method: "POST", body: JSON.stringify({ email, password }) });
  if (!r.ok) return { ok: false, error: "Rangt netfang eða lykilorð" };
  const at = r.json?.access_token as string | undefined;
  const uid = (r.json?.user as Record<string, unknown> | undefined)?.id as string | undefined;
  return { ok: !!at, accessToken: at, userId: uid };
}

export interface Factor { id: string; status: string; factor_type: string }

/** List a user's MFA factors (needs their access token). GoTrue hefur ekki
 *  GET /factors (405) — factoralistinn fylgir notandahlutnum á GET /user. */
export async function listFactors(accessToken: string): Promise<Factor[]> {
  const r = await goTrue(`/user`, { method: "GET", token: accessToken });
  if (!r.ok) return [];
  const arr = (r.json?.factors ?? []) as Factor[] | undefined;
  return Array.isArray(arr) ? arr : [];
}

export const verifiedTotp = (factors: Factor[]) => factors.find((f) => f.factor_type === "totp" && f.status === "verified");

export interface EnrollResult { ok: boolean; factorId?: string; qr?: string; secret?: string; error?: string }

/** Begin TOTP enrollment — returns a QR (svg data-uri) + secret to show once. */
export async function enrollTotp(accessToken: string, friendlyName = "Hlíðarkaup"): Promise<EnrollResult> {
  const r = await goTrue(`/factors`, {
    method: "POST", token: accessToken,
    body: JSON.stringify({ factor_type: "totp", friendly_name: `${friendlyName}-${Date.now()}` }),
  });
  if (!r.ok) return { ok: false, error: r.text.slice(0, 160) };
  const totp = r.json?.totp as Record<string, unknown> | undefined;
  return { ok: true, factorId: r.json?.id as string, qr: totp?.qr_code as string, secret: totp?.secret as string };
}

/** Create a challenge for a factor (step before verify). */
export async function challengeFactor(accessToken: string, factorId: string): Promise<{ ok: boolean; challengeId?: string }> {
  const r = await goTrue(`/factors/${factorId}/challenge`, { method: "POST", token: accessToken });
  return { ok: r.ok, challengeId: r.json?.id as string | undefined };
}

/** Verify a TOTP code. On success the factor is marked verified and the session steps up to AAL2. */
export async function verifyFactor(accessToken: string, factorId: string, challengeId: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const r = await goTrue(`/factors/${factorId}/verify`, {
    method: "POST", token: accessToken,
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
  if (!r.ok) return { ok: false, error: r.status === 422 ? "Rangur kóði — reyndu aftur" : r.text.slice(0, 160) };
  return { ok: true };
}

/** Find a Supabase auth user by email (admin). Returns uid + email_confirmed. */
export async function findUserByEmail(email: string): Promise<{ id: string; confirmed: boolean } | null> {
  const r = await goTrue(`/admin/users?email=${encodeURIComponent(email)}`, { method: "GET", admin: true });
  const users = (r.json?.users as Record<string, unknown>[] | undefined) ?? [];
  const u = users.find((x) => String(x.email).toLowerCase() === email.toLowerCase());
  return u ? { id: u.id as string, confirmed: !!u.email_confirmed_at } : null;
}

/** Ensure a confirmed Supabase auth user exists for this email (admin). Returns its uid.
 *  New accounts get a random password — the user sets their own via the recovery email. */
export async function ensureSupabaseUser(email: string): Promise<{ ok: boolean; uid?: string; created?: boolean; error?: string }> {
  const existing = await findUserByEmail(email);
  if (existing) return { ok: true, uid: existing.id, created: false };
  const randomPw = crypto.randomUUID() + crypto.randomUUID();
  const r = await goTrue(`/admin/users`, {
    method: "POST", admin: true,
    body: JSON.stringify({ email, password: randomPw, email_confirm: true }),
  });
  if (!r.ok) return { ok: false, error: r.text.slice(0, 160) };
  return { ok: true, uid: r.json?.id as string, created: true };
}

/** Generate a password-recovery action link (admin) WITHOUT Supabase sending an email —
 *  we deliver it ourselves via Resend so it's on our domain and not rate-limited. */
export async function generateRecoveryLink(email: string, redirectTo: string): Promise<{ ok: boolean; link?: string; error?: string }> {
  const r = await goTrue(`/admin/generate_link`, {
    method: "POST", admin: true,
    body: JSON.stringify({ type: "recovery", email, redirect_to: redirectTo }),
  });
  if (!r.ok) return { ok: false, error: r.text.slice(0, 160) };
  const link = (r.json?.action_link ?? (r.json?.properties as Record<string, unknown> | undefined)?.action_link) as string | undefined;
  return link ? { ok: true, link } : { ok: false, error: "Enginn hlekkur í svari" };
}
