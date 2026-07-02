import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

interface FundInput { line_number?: string; name: string; rate_pct?: number | null; fixed_amount?: number | null; payer?: string; fund_type?: string; pay_month?: number | null; sort?: number }

// Update a union's header fields and/or replace its full fund-line set.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  const client = await db.connect();
  try {
    await client.query("begin");
    const cols: string[] = []; const vals: unknown[] = [];
    for (const f of ["code", "name", "orlof_period_start", "orlof_period_end", "is_active"]) {
      if (b[f] !== undefined) { vals.push(b[f] === "" ? null : b[f]); cols.push(`${f} = $${vals.length + 1}`); }
    }
    if (cols.length) await client.query(`update acc.unions set ${cols.join(", ")} where id = $1`, [id, ...vals]);

    if (Array.isArray(b.funds)) {
      await client.query(`delete from acc.union_funds where union_id = $1`, [id]);
      let sort = 0;
      for (const f of b.funds as FundInput[]) {
        if (!f.name) continue;
        await client.query(
          `insert into acc.union_funds (union_id, line_number, name, rate_pct, fixed_amount, payer, fund_type, pay_month, sort)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, f.line_number || null, f.name,
           f.rate_pct === undefined || f.rate_pct === null || (f.rate_pct as unknown) === "" ? null : f.rate_pct,
           f.fixed_amount === undefined || f.fixed_amount === null || (f.fixed_amount as unknown) === "" ? null : f.fixed_amount,
           f.payer || "employer", f.fund_type || "other",
           f.pay_month === undefined || (f.pay_month as unknown) === "" ? null : f.pay_month, sort++]);
      }
    }
    await client.query("commit");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("rollback");
    return NextResponse.json({ error: err instanceof Error ? err.message : "Villa" }, { status: 400 });
  } finally {
    client.release();
  }
}
