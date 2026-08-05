import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calcLine, getTaxConfig, getUnionFunds, PayrollError, type Employee, type UnionFund, type PayComponent } from "@/lib/payroll";
import { resolveWageRates } from "@/lib/wage-scale";

// Create a draft payroll run and compute its lines for the given employees.
export const runtime = "nodejs";

interface Entry {
  employee_id: string; hours?: number; components?: PayComponent[];
  // Klst á kjarasamningstöxtum (aðeins nýtt hjá starfsfólki með wage_category) — taxtarnir
  // leysast SERVER-megin úr acc.wage_scale; vafranum er ekki treyst fyrir töxtum.
  ev_hours?: number; nv_hours?: number; yv_hours?: number; sh_hours?: number;
}
interface Queryable { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }> }

// Compute + (re)insert payroll_lines for a run. Shared by create and recompute.
export async function computeLines(client: Queryable, runId: string, year: number, month: number, entries: Entry[]) {
  const cfg = await getTaxConfig(year);
  const ids = entries.map((e) => e.employee_id);
  const emps = (await client.query(`select * from acc.employees where id = any($1::uuid[])`, [ids])).rows as unknown as (Employee & { union_id: string | null })[];
  const byId = new Map(emps.map((e) => [e.id, e]));
  const fundCache = new Map<string, UnionFund[]>();
  // Taxtadagur = lok launatímabilsins (25.–24.): 24. í uppgjörsmánuðinum.
  const rateDate = new Date(Date.UTC(year, month - 1, 24));
  await client.query(`delete from acc.payroll_lines where run_id = $1`, [runId]);
  for (const entry of entries) {
    const emp = byId.get(entry.employee_id);
    if (!emp) continue;
    const uid = emp.union_id;
    if (uid && !fundCache.has(uid)) fundCache.set(uid, await getUnionFunds(uid));
    const funds = uid ? fundCache.get(uid)! : [];

    // KJARASAMNINGSTAXTI: grunnlaun skrifast yfir úr wage_scale (aldur úr kennitölu +
    // starfsaldur ráða þrepinu) og klst-álögin verða einingar × taxti þrepsins — eftirvinna,
    // næturvinna, yfirvinna, stórhátíðarkaup. Fólk ÁN wage_category heldur handvirkum launum.
    const components: PayComponent[] = [...(entry.components ?? [])];
    if (emp.wage_category) {
      const w = await resolveWageRates({
        kennitala: emp.kennitala, category: emp.wage_category,
        startDate: emp.start_date ?? null, tradeStart: emp.trade_start ?? null, at: rateDate,
      });
      if (w) {
        emp.hourly_rate = w.dagvinna;
        emp.monthly_salary = w.monthly;
        const hrs = (v: unknown) => Math.max(0, Number(v) || 0);
        if (hrs(entry.ev_hours) && w.eftirvinna) components.push({ kind: "yfirvinna", label: "Eftirvinna", units: hrs(entry.ev_hours), rate: w.eftirvinna });
        if (hrs(entry.nv_hours) && w.naeturvinna) components.push({ kind: "yfirvinna", label: "Næturvinna", units: hrs(entry.nv_hours), rate: w.naeturvinna });
        if (hrs(entry.yv_hours)) components.push({ kind: "yfirvinna", label: "Yfirvinna", units: hrs(entry.yv_hours), rate: w.yfirvinna });
        if (hrs(entry.sh_hours)) components.push({ kind: "alag", label: "Stórhátíðarkaup", units: hrs(entry.sh_hours), rate: w.storhatid });
      }
    }
    const ln = calcLine(emp, { hours: entry.hours, components: components.length ? components : undefined }, cfg, funds, month);
    await client.query(
      `insert into acc.payroll_lines
        (run_id, employee_id, employee_name, kennitala, hours, gross, taxable, income_tax, personal_credit_used,
         pension_employee, pension_employer, private_employee, private_employer, union_dues, union_employer,
         tryggingagjald, vacation_accrual, net_pay, breakdown)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)`,
      [runId, ln.employee_id, ln.employee_name, ln.kennitala, ln.hours, ln.gross, ln.taxable, ln.income_tax,
       ln.personal_credit_used, ln.pension_employee, ln.pension_employer, ln.private_employee, ln.private_employer,
       ln.union_dues, ln.union_employer, ln.tryggingagjald, ln.vacation_accrual, ln.net_pay, JSON.stringify(ln.breakdown)]);
  }
}

export async function POST(req: NextRequest) {
  const { year, month, pay_date, entries } = await req.json();
  if (!year || !month || !pay_date) return NextResponse.json({ error: "Vantar tímabil eða útborgunardag" }, { status: 400 });
  if (!Array.isArray(entries) || !entries.length) return NextResponse.json({ error: "Engir launþegar valdir" }, { status: 400 });

  const client = await db.connect();
  try {
    await client.query("begin");
    const run = (await client.query<{ id: string }>(
      `insert into acc.payroll_runs (year, month, pay_date, status, created_by) values ($1,$2,$3::date,'draft','bokhald') returning id`,
      [year, month, pay_date])).rows[0];
    await computeLines(client, run.id, Number(year), Number(month), entries);
    await client.query("commit");
    return NextResponse.json({ ok: true, runId: run.id });
  } catch (err) {
    await client.query("rollback");
    const status = err instanceof PayrollError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Villa" }, { status });
  } finally {
    client.release();
  }
}
