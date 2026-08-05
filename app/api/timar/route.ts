import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Tímar starfsmanna + afgreiðslutölfræði. Gated stjornandi/bokari (middleware /api/timar).
// Klst-reglan alls staðar: vinna = út−inn (eða til núna); fjarvist = hours_override (t.d. 8).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOURS_SQL = `case when te.entry_type <> 'work' then coalesce(te.hours_override, 0)::float8
                        else round(extract(epoch from (coalesce(te.clock_out, now()) - te.clock_in)) / 3600.0, 2)::float8 end`;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // Mánaðarblað EINS starfsmanns: ?employee=<uuid>&month=YYYY-MM → allar færslur mánaðarins.
  const employee = sp.get("employee") ?? "";
  const month = sp.get("month") ?? "";
  if (employee && /^\d{4}-\d{2}$/.test(month)) {
    const emp = (await query<{ id: string; name: string }>(`select id, name from acc.employees where id = $1`, [employee]))[0];
    if (!emp) return NextResponse.json({ error: "Starfsmaður fannst ekki" }, { status: 404 });
    const entries = await query(`
      select te.id, te.entry_type, te.note, te.register_id, te.edited_by,
             te.clock_in::text as clock_in, te.clock_out::text as clock_out,
             (te.clock_in at time zone 'Atlantic/Reykjavik')::date::text as day,
             ${HOURS_SQL} as hours
      from acc.time_entries te
      where te.employee_id = $1
        and (te.clock_in at time zone 'Atlantic/Reykjavik')::date >= ($2 || '-01')::date
        and (te.clock_in at time zone 'Atlantic/Reykjavik')::date < (($2 || '-01')::date + interval '1 month')
      order by te.clock_in`, [employee, month]);
    return NextResponse.json({ employee: emp, month, entries });
  }

  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") ?? "") ? sp.get("from")! : new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to") ?? "") ? sp.get("to")! : new Date().toISOString().slice(0, 10);

  const entries = await query(`
    select te.id, te.employee_id, e.name, te.register_id, te.entry_type, te.note,
           te.clock_in::text as clock_in, te.clock_out::text as clock_out, te.edited_by,
           ${HOURS_SQL} as hours
    from acc.time_entries te join acc.employees e on e.id = te.employee_id
    where te.clock_in >= $1::date and te.clock_in < ($2::date + 1)
    order by te.clock_in desc`, [from, to]);

  const totals = await query(`
    select e.id as employee_id, e.name,
           round(sum(${HOURS_SQL})::numeric, 2)::float8 as hours,
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

const TYPES = ["work", "sick", "vacation", "holiday", "absence"];

// Ný færsla af mánaðarblaðinu: vinna (með tímum) EÐA fjarvist (veikindi/orlof/... með klst).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const employeeId = String(b.employee_id ?? "");
  const type = TYPES.includes(b.entry_type) ? String(b.entry_type) : "work";
  if (!employeeId) return NextResponse.json({ error: "Vantar starfsmann" }, { status: 400 });

  if (type === "work") {
    const cin = b.clock_in ? new Date(b.clock_in) : null;
    const cout = b.clock_out ? new Date(b.clock_out) : null;
    if (!cin || isNaN(cin.getTime())) return NextResponse.json({ error: "Vantar gilda inn-stimplun" }, { status: 400 });
    if (cout && (isNaN(cout.getTime()) || cout <= cin)) return NextResponse.json({ error: "Út-stimplun verður að vera á eftir inn" }, { status: 400 });
    const r = await query<{ id: string }>(`
      insert into acc.time_entries (employee_id, entry_type, clock_in, clock_out, note, edited_by, updated_at)
      values ($1,'work',$2,$3,$4,'bokhald', now()) returning id`,
      [employeeId, cin, cout, b.note ? String(b.note).slice(0, 300) : null])
      .catch((e) => { throw new Error(/time_entries_open_uk/.test(String(e)) ? "Starfsmaðurinn á þegar opna stimplun — ljúktu henni fyrst." : (e instanceof Error ? e.message : "Villa")); });
    return NextResponse.json({ ok: true, id: r[0].id });
  }

  // Fjarvist: dagsetning + klst (sjálfgefið 8) + skýring. clock_in = miðnætti dagsins.
  const day = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") ? String(b.date) : null;
  if (!day) return NextResponse.json({ error: "Vantar dagsetningu" }, { status: 400 });
  const hours = Math.min(24, Math.max(0, Number(b.hours) || 8));
  const r = await query<{ id: string }>(`
    insert into acc.time_entries (employee_id, entry_type, clock_in, clock_out, hours_override, note, edited_by, updated_at)
    values ($1,$2, ($3 || 'T12:00:00')::timestamptz, null, $4, $5, 'bokhald', now()) returning id`,
    [employeeId, type, day, hours, b.note ? String(b.note).slice(0, 300) : null]);
  return NextResponse.json({ ok: true, id: r[0].id });
}

// Leiðrétting á færslu (gleymd út-stimplun, breytt tegund, klst eða skýring) — skráir hver breytti.
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
      entry_type = case when $5 then $6 else entry_type end,
      hours_override = case when $7 then $8 else hours_override end,
      note = case when $9 then $10 else note end,
      edited_by = 'bokhald', updated_at = now()
    where id = $1 returning id`,
    [id, clockIn, clockOut !== undefined, clockOut ?? null,
     TYPES.includes(b.entry_type), TYPES.includes(b.entry_type) ? b.entry_type : null,
     b.hours !== undefined, b.hours !== undefined ? Math.min(24, Math.max(0, Number(b.hours) || 0)) : null,
     b.note !== undefined, b.note !== undefined ? String(b.note ?? "").slice(0, 300) || null : null]);
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
