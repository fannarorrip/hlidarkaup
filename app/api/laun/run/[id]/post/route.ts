import { NextRequest, NextResponse } from "next/server";
import { postPayrollRun, PayrollError } from "@/lib/payroll";

// Post a draft payroll run to the ledger (one balanced PAYROLL voucher).
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await postPayrollRun(id);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    const status = err instanceof PayrollError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Villa" }, { status });
  }
}
