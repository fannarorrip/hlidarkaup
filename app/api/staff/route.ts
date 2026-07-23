import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ROLES } from "@/lib/roles";

export async function GET() {
  const staff = await query(`select email, name, role, is_active from shop.staff order by role, email`);
  return NextResponse.json({ staff });
}

// Create a staff member: Supabase account (service role) + role record.
export async function POST(req: NextRequest) {
  const { email, name, password, role } = await req.json();
  if (!email || !password || !ROLES.includes(role)) return NextResponse.json({ error: "Vantar reiti eða ógilt hlutverk" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let uid: string | null = null;
  if (url && srv) {
    const r = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: srv, authorization: `Bearer ${srv}` },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (r.ok) { const d = await r.json(); uid = d.id ?? null; }
    else if (r.status !== 422) { // 422 = already registered → still upsert the role
      return NextResponse.json({ error: "Supabase: " + (await r.text()).slice(0, 140) }, { status: 400 });
    }
  }
  await query(
    `insert into shop.staff (email, name, role, supabase_uid) values ($1,$2,$3,$4)
     on conflict (email) do update set name = excluded.name, role = excluded.role, is_active = true`,
    [email, name || null, role, uid]);
  return NextResponse.json({ ok: true });
}

// Update a staff member's role / active state — or reset their password directly.
// Password reset is admin-driven (no Supabase recovery email): the store logs in over
// LAN and Supabase's built-in mail is rate-limited + would point at the wrong URL, so
// a stjórnandi just sets a new password here and tells the employee.
export async function PATCH(req: NextRequest) {
  const { email, role, is_active, password } = await req.json();
  if (!email) return NextResponse.json({ error: "Vantar netfang" }, { status: 400 });
  if (role && !ROLES.includes(role)) return NextResponse.json({ error: "Ógilt hlutverk" }, { status: 400 });

  if (password) {
    if (String(password).length < 8) return NextResponse.json({ error: "Lykilorð verður að vera a.m.k. 8 stafir" }, { status: 400 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !srv) return NextResponse.json({ error: "Supabase þjónustulykill vantar — get ekki breytt lykilorði." }, { status: 400 });
    const uid = (await query<{ supabase_uid: string | null }>(`select supabase_uid from shop.staff where email = $1`, [email]))[0]?.supabase_uid;
    if (!uid) return NextResponse.json({ error: "Enginn Supabase-aðgangur á þessum starfsmanni." }, { status: 404 });
    const r = await fetch(`${url}/auth/v1/admin/users/${uid}`, {
      method: "PUT",
      headers: { "content-type": "application/json", apikey: srv, authorization: `Bearer ${srv}` },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) return NextResponse.json({ error: "Supabase: " + (await r.text()).slice(0, 140) }, { status: 400 });
    return NextResponse.json({ ok: true, passwordReset: true });
  }

  await query(
    `update shop.staff set role = coalesce($2, role), is_active = coalesce($3, is_active) where email = $1`,
    [email, role ?? null, typeof is_active === "boolean" ? is_active : null]);
  return NextResponse.json({ ok: true });
}
