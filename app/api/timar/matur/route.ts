import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Yfirseta hádegismatarfrádráttar per dag: „matur greiddur" = starfsmaðurinn vann í gegnum
// matinn — enginn frádráttur þann dag og tíminn greiðist með EFTIRVINNUKAUPI (kjarasamningur).
// POST { employee_id, day, paid: true } setur yfirsetuna; paid: false fjarlægir hana.
// Gated stjornandi/bokari via middleware (/api/timar).
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const employeeId = String(b.employee_id ?? "");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(b.day ?? "") ? String(b.day) : "";
  if (!employeeId || !day) return NextResponse.json({ error: "Vantar starfsmann eða dag" }, { status: 400 });
  if (b.paid === true) {
    await query(`insert into acc.time_lunch_overrides (employee_id, day, created_by) values ($1,$2,'bokhald') on conflict do nothing`, [employeeId, day]);
  } else {
    await query(`delete from acc.time_lunch_overrides where employee_id = $1 and day = $2`, [employeeId, day]);
  }
  return NextResponse.json({ ok: true });
}
