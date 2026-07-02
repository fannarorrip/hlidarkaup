import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeLines } from "../route";
import { PayrollError } from "@/lib/payroll";

// Recompute a draft run (adjust hours / pay date). Posted runs are immutable.
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { pay_date, entries } = await req.json();
  const client = await db.connect();
  try {
    await client.query("begin");
    const run = (await client.query<{ year: number; month: number; status: string }>(
      `select year, month, status from acc.payroll_runs where id = $1 for update`, [id])).rows[0];
    if (!run) throw new PayrollError("Launakeyrsla fannst ekki", 404);
    if (run.status === "posted") throw new PayrollError("Þegar bókað — ekki hægt að breyta", 409);
    if (pay_date) await client.query(`update acc.payroll_runs set pay_date = $1::date where id = $2`, [pay_date, id]);
    if (Array.isArray(entries)) await computeLines(client, id, run.year, run.month, entries);
    await client.query("commit");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("rollback");
    const status = err instanceof PayrollError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Villa" }, { status });
  } finally {
    client.release();
  }
}
