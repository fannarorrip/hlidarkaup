import { NextRequest, NextResponse } from "next/server";
import { createStaffSession, STAFF_COOKIE } from "@/lib/staff-session";
import { query } from "@/lib/db";
import { challengeFactor, verifyFactor } from "@/lib/staff-auth";

// Second factor: consume the pending-login ticket (holds the Supabase access token
// server-side), challenge + verify the TOTP code, then issue the real staff session.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MFA_TICKET_COOKIE = "hk_mfa";

interface Ticket { id: string; email: string; role: string; supabase_uid: string | null; access_token: string; factor_id: string | null; }

export async function POST(req: NextRequest) {
  const { code } = await req.json();
  const ticketId = req.cookies.get(MFA_TICKET_COOKIE)?.value;
  if (!ticketId) return NextResponse.json({ error: "Innskráning útrunnin — byrjaðu aftur." }, { status: 400 });
  if (!code || !/^\d{6}$/.test(String(code).trim())) return NextResponse.json({ error: "Sláðu inn 6 stafa kóða." }, { status: 400 });

  const t = (await query<Ticket>(
    `select id, email, role, supabase_uid, access_token, factor_id
       from acc.staff_login_tickets where id = $1 and expires_at > now()`, [ticketId]))[0];
  if (!t || !t.factor_id) {
    return NextResponse.json({ error: "Innskráning útrunnin — byrjaðu aftur." }, { status: 400 });
  }

  const ch = await challengeFactor(t.access_token, t.factor_id);
  if (!ch.ok || !ch.challengeId) return NextResponse.json({ error: "Gat ekki staðfest kóða. Reyndu aftur." }, { status: 500 });
  const v = await verifyFactor(t.access_token, t.factor_id, ch.challengeId, String(code).trim());
  if (!v.ok) return NextResponse.json({ error: v.error ?? "Rangur kóði" }, { status: 401 });

  // Success — consume the ticket, issue the MFA-backed session.
  await query(`delete from acc.staff_login_tickets where id = $1`, [t.id]).catch(() => {});
  const token = await createStaffSession({ email: t.email, sub: t.supabase_uid ?? undefined, role: t.role, mfa: true });
  const res = NextResponse.json({ ok: true, role: t.role });
  const isHttps = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  res.cookies.set(STAFF_COOKIE, token, { httpOnly: true, secure: isHttps, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  res.cookies.set(MFA_TICKET_COOKIE, "", { httpOnly: true, secure: isHttps, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
