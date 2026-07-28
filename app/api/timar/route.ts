import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Tímar starfsmanna + afgreiðslutölfræði. Gated stjornandi/bokari (middleware /api/timar).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") ?? "") ? sp.get("from")! : new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to") ?? "") ? sp.get("to")! : new Date().toISOString().slice(0, 10);

  const entries = await query(`
    select te.id, te.employee_id, e.name, te.register_id,
           te.clock_in::text as clock_in, te.clock_out::text as clock_out, te.edited_by,
           round(extract(epoch from (coalesce(te.clock_out, now()) - te.clock_in)) / 3600.0, 2)::float8 as hours
    from acc.time_entries te join acc.employees e on e.id = te.employee_id
    where te.clock_in >= $1::date and te.clock_in < ($2::date + 1)
    order by te.clock_in desc`, [from, to]);

  const totals = await query(`
    select e.id as employee_id, e.name,
           round(sum(extract(epoch from (coalesce(te.clock_out, now()) - te.clock_in))) / 3600.0, 2)::float8 as hours,
           count(*)::int as entries
    from acc.time_entries te join acc.employees e on e.id = te.employee_id
    where te.clock_in >= $1::date and te.clock_in < ($2::date + 1)
    group by e.id, e.name order by hours desc`, [from, to]);

  // Afgreiðslur per starfsmann: sölur merktar við PIN-opnun kassans (voucher_employee).
  const sales = await query(`
    select e.id as employee_id, e.name,
           count(*)::int as sales,
           coalesce(sum((select sum(le.debit) from acc.ledger_entries le where le.voucher_id = v.id)), 0)::float8 as amount
    from acc.voucher_employee x
    join acc.vouchers v on v.id = x.voucher_id and v.status = 'posted'
    join acc.employees e on e.id = x.employee_id
    where v.voucher_date >= $1::date and v.voucher_date <= $2::date
    group by e.id, e.name order by sales desc`, [from, to]);

  return NextResponse.json({ from, to, entries, totals, sales });
}

// Leiðrétting á stimplun (gleymd út-stimplun o.þ.h.) — skráir hver breytti.
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? "");
  if (!id) return NextResponse.json({ error: "Vantar id" }, { status: 400 });
  const clockIn = b.clock_in ? new Date(b.clock_in) : null;
  const clockOut = b.clock_out === null ? null : b.clock_out ? new Date(b.clock_out) : undefined;
  if (clockIn && isNaN(clockIn.getTime())) return NextResponse.json({ error: "Ógild inn-stimplun" }, { status: 400 });
  if (clockOut && isNaN(clockOut.getTime())) return NextResponse.json({ error: "Ógild út-stimplun" }, { status: 400 });
  const r = await query<{ id: string }>(`
    update acc.time_entries set
      clock_in = coalesce($2, clock_in),
      clock_out = case when $3 then $4 else clock_out end,
      edited_by = 'bokhald', updated_at = now()
    where id = $1 returning id`,
    [id, clockIn, clockOut !== undefined, clockOut ?? null]);
  if (!r.length) return NextResponse.json({ error: "Stimplun fannst ekki" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Vantar id" }, { status: 400 });
  const r = await query<{ id: string }>(`delete from acc.time_entries where id = $1 returning id`, [id]);
  if (!r.length) return NextResponse.json({ error: "Fannst ekki" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
