import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveRegister } from "@/lib/registers";

// Stimpilklukka á kassanum: starfsmaður slær sinn PIN — opin stimplun lokast (ÚT), annars
// stofnast ný (INN). Ein opin stimplun per starfsmann (unique index ver kapphlaup).
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const pin = String(b.pin ?? "").replace(/\D/g, "");
  if (pin.length !== 4) return NextResponse.json({ error: "PIN er 4 tölustafir" }, { status: 400 });
  const registerId = resolveRegister(b.reg, "sjalfsafgreidsla").id;

  const client = await db.connect();
  try {
    await client.query("begin");
    const emp = (await client.query<{ id: string; name: string }>(
      `select id, name from acc.employees where pin = $1 and is_active limit 1`, [pin])).rows[0];
    if (!emp) { await client.query("rollback"); return NextResponse.json({ error: "Rangur kóði" }, { status: 401 }); }

    const open = (await client.query<{ id: string; clock_in: string }>(
      `select id, clock_in::text from acc.time_entries where employee_id = $1 and clock_out is null for update`, [emp.id])).rows[0];

    if (open) {
      await client.query(`update acc.time_entries set clock_out = now() where id = $1`, [open.id]);
      await client.query("commit");
      const mins = Math.round((Date.now() - new Date(open.clock_in).getTime()) / 60000);
      return NextResponse.json({ ok: true, name: emp.name, action: "out", hours: Math.floor(mins / 60), minutes: mins % 60 });
    }
    await client.query(`insert into acc.time_entries (employee_id, register_id) values ($1, $2)`, [emp.id, registerId]);
    await client.query("commit");
    return NextResponse.json({ ok: true, name: emp.name, action: "in" });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.error("[stimpil] error:", e);
    return NextResponse.json({ error: "Villa við stimplun" }, { status: 500 });
  } finally { client.release(); }
}
