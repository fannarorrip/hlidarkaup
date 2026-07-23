import { NextRequest, NextResponse } from "next/server";
import { createStaffSession, STAFF_COOKIE } from "@/lib/staff-session";
import { getStaffByEmail } from "@/lib/staff";
import { query } from "@/lib/db";
import { passwordGrant, listFactors, verifiedTotp, enrollTotp, staffAuthConfigured } from "@/lib/staff-auth";

// Staff login. Two-factor for stjórnendur (TOTP): password verifies here, then the
// client is sent to the MFA step (see /api/auth/staff/mfa). Non-admins log in in one step.
// STAFF_PASSWORD stays a break-glass door (no MFA) for when Supabase is unreachable.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MFA_TICKET_COOKIE = "hk_mfa";

function setSecureCookie(req: NextRequest, res: NextResponse, name: string, value: string, maxAge: number) {
  const isHttps = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  res.cookies.set(name, value, { httpOnly: true, secure: isHttps, sameSite: "lax", path: "/", maxAge });
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!password) return NextResponse.json({ error: "Vantar lykilorð" }, { status: 400 });

  // 1) Break-glass shared password (any email) — no MFA, emergency access.
  if (process.env.STAFF_PASSWORD && password === process.env.STAFF_PASSWORD) {
    const token = await createStaffSession({ email: email || "starf", role: "stjornandi", mfa: true });
    const res = NextResponse.json({ ok: true, role: "stjornandi" });
    setSecureCookie(req, res, STAFF_COOKIE, token, 60 * 60 * 12);
    return res;
  }

  // 2) Supabase password grant.
  if (!staffAuthConfigured() || !email) return NextResponse.json({ error: "Rangt netfang eða lykilorð" }, { status: 401 });
  const grant = await passwordGrant(email, password);
  if (!grant.ok || !grant.accessToken) return NextResponse.json({ error: "Rangt netfang eða lykilorð" }, { status: 401 });

  // Role gate — Supabase users must have an active staff record.
  const staff = await getStaffByEmail(email);
  if (!staff || !staff.is_active) {
    return NextResponse.json({ error: "Notandi hefur ekki hlutverk. Hafðu samband við stjórnanda." }, { status: 403 });
  }
  const role = staff.role;

  // Backfill the supabase_uid link the first time we see it (created outside the app / seeded).
  if (grant.userId) {
    await query(`update shop.staff set supabase_uid = $2 where email = $1 and supabase_uid is distinct from $2`, [email, grant.userId]).catch(() => {});
  }

  // 3) MFA required for stjórnendur.
  if (role === "stjornandi") {
    const factors = await listFactors(grant.accessToken);
    const totp = verifiedTotp(factors);
    let factorId = totp?.id;
    let mode: "challenge" | "enroll" = "challenge";
    let qr: string | undefined, secret: string | undefined;

    if (!totp) {
      // First-time setup: enroll now, before any admin access is granted.
      const en = await enrollTotp(grant.accessToken);
      if (!en.ok || !en.factorId) return NextResponse.json({ error: "Gat ekki sett upp auðkenningu. Reyndu aftur." }, { status: 500 });
      factorId = en.factorId; qr = en.qr; secret = en.secret; mode = "enroll";
    }

    const ticket = (await query<{ id: string }>(
      `insert into acc.staff_login_tickets (email, role, supabase_uid, access_token, factor_id, mode, expires_at)
       values ($1,$2,$3,$4,$5,$6, now() + interval '5 minutes') returning id`,
      [email, role, grant.userId ?? null, grant.accessToken, factorId ?? null, mode]))[0];

    const res = NextResponse.json({ step: "mfa", mode, ...(mode === "enroll" ? { qr, secret } : {}) });
    setSecureCookie(req, res, MFA_TICKET_COOKIE, ticket.id, 5 * 60);
    return res;
  }

  // 4) Non-admin — straight in.
  const token = await createStaffSession({ email, sub: grant.userId, role });
  const res = NextResponse.json({ ok: true, role });
  setSecureCookie(req, res, STAFF_COOKIE, token, 60 * 60 * 12);
  return res;
}
