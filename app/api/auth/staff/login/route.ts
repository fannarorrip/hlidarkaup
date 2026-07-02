import { NextRequest, NextResponse } from "next/server";
import { createStaffSession, STAFF_COOKIE } from "@/lib/staff-session";
import { getStaffByEmail } from "@/lib/staff";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!password) return NextResponse.json({ error: "Vantar lykilorð" }, { status: 400 });

  let authedEmail: string | null = null;
  let sub: string | undefined;
  let breakGlass = false;

  // 1) Shared break-glass password (any email)
  if (process.env.STAFF_PASSWORD && password === process.env.STAFF_PASSWORD) {
    breakGlass = true;
    authedEmail = email || "starf";
  } else {
    // 2) Supabase staff account
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && anon && email) {
      const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { "content-type": "application/json", apikey: anon },
        body: JSON.stringify({ email, password }),
      });
      if (r.ok) { const d = await r.json(); authedEmail = email; sub = d.user?.id; }
    }
  }

  if (!authedEmail) return NextResponse.json({ error: "Rangt netfang eða lykilorð" }, { status: 401 });

  // Resolve role. Break-glass = full admin; Supabase users must have an active staff record.
  let role = "stjornandi";
  if (!breakGlass) {
    const staff = await getStaffByEmail(authedEmail);
    if (!staff || !staff.is_active) {
      return NextResponse.json({ error: "Notandi hefur ekki hlutverk. Hafðu samband við stjórnanda." }, { status: 403 });
    }
    role = staff.role;
  }

  const token = await createStaffSession({ email: authedEmail, sub, role });
  const res = NextResponse.json({ ok: true, role });
  // secure follows the ACTUAL protocol, not NODE_ENV: staff in the store log in over plain-HTTP
  // LAN/VPN (http://<lan-ip>:3000) where a Secure cookie would silently never be stored.
  const isHttps = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  res.cookies.set(STAFF_COOKIE, token, {
    httpOnly: true, secure: isHttps, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12,
  });
  return res;
}
