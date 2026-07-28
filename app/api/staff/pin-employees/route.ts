import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Afgreiðslustarfsmenn með PIN (engin innskráning, ekkert netfang/lykilorð): stofnaðir hér með
// sjálfvirkum einkvæmum 4-stafa kóða — hann opnar kassa, stimplar inn/út og merkir sölur.
// Gated stjornandi (middleware /api/staff).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function freePin(): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const pin = String(Math.floor(1000 + Math.random() * 9000)); // 1000–9999, aldrei með fornúlli
    const taken = await query<{ n: string }>(`select 1 as n from acc.employees where pin = $1`, [pin]);
    if (!taken.length) return pin;
  }
  throw new Error("Fann ekki lausan PIN");
}

export async function GET() {
  // PIN-arnir sjálfir fara ALDREI út úr þjóninum eftir stofnun — aðeins hvort hann sé settur.
  const rows = await query(`
    select id, name, kennitala, (pin is not null) as has_pin, is_active, employment_type, hourly_rate::float8 as hourly_rate
    from acc.employees where pin is not null or staff_email is null
    order by is_active desc, name`);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim();
  const kt = String(b.kennitala ?? "").replace(/\D/g, "");
  if (!name) return NextResponse.json({ error: "Vantar nafn" }, { status: 400 });
  if (kt.length !== 10) return NextResponse.json({ error: "Kennitala verður að vera 10 tölustafir" }, { status: 400 });
  try {
    const pin = await freePin();
    const r = await query<{ id: string }>(`
      insert into acc.employees (kennitala, name, pin, employment_type, hourly_rate)
      values ($1, $2, $3, 'hourly', $4) returning id`,
      [kt, name, pin, Number(b.hourly_rate) || 0]);
    return NextResponse.json({ ok: true, id: r[0].id, pin });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: msg.includes("unique") || msg.includes("kennitala") ? "Kennitala er þegar skráð (starfsmaðurinn er til — breyttu honum í staðinn)" : "Villa við stofnun" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? "");
  if (!id) return NextResponse.json({ error: "Vantar id" }, { status: 400 });
  let pin: string | null | undefined = undefined;
  if (b.pin !== undefined) {
    if (b.pin === null || b.pin === "") pin = null;
    else {
      pin = String(b.pin).replace(/\D/g, "");
      if (pin.length !== 4) return NextResponse.json({ error: "PIN er 4 tölustafir" }, { status: 400 });
    }
  }
  try {
    const r = await query<{ id: string }>(`
      update acc.employees set
        name = coalesce($2, name),
        pin = case when $3 then $4 else pin end,
        is_active = coalesce($5, is_active)
      where id = $1 returning id`,
      [id, b.name != null ? String(b.name).trim() : null, pin !== undefined, pin ?? null,
       typeof b.is_active === "boolean" ? b.is_active : null]);
    if (!r.length) return NextResponse.json({ error: "Fannst ekki" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "PIN er þegar í notkun hjá öðrum" }, { status: 409 });
  }
}
