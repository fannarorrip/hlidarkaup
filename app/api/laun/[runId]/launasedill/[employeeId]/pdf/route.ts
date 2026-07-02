import { NextRequest, NextResponse } from "next/server";
import { getPayrollRun, getPayrollLine, getEmployeeById, getEmployeeYtd } from "@/lib/accounting-queries";
import { renderPayslipPdf } from "@/lib/pdf/payslip";
import type { Breakdown } from "@/lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string; employeeId: string }> }) {
  const { runId, employeeId } = await params;
  const [run, line, emp] = await Promise.all([getPayrollRun(runId), getPayrollLine(runId, employeeId), getEmployeeById(employeeId)]);
  if (!run || !line) return NextResponse.json({ error: "Launaseðill fannst ekki" }, { status: 404 });
  const ytd = await getEmployeeYtd(employeeId, run.year, run.month);

  const pdf = await renderPayslipPdf({
    employee_name: line.employee_name, kennitala: line.kennitala,
    starfsheiti: emp?.starfsheiti ?? null, deild: emp?.deild ?? null,
    employment_ratio: emp?.employment_ratio != null ? Number(emp.employment_ratio) : null,
    bank_account: emp?.bank_account ?? null,
    period: `${run.year}-${String(run.month).padStart(2, "0")}`, pay_date: run.pay_date,
    breakdown: line.breakdown as Breakdown,
    net_pay: Number(line.net_pay) || 0,
    ytd: ytd ? {
      gross: ytd.gross, income_tax: ytd.income_tax, pension_employee: ytd.pension_employee + ytd.private_employee,
      pension_employer: ytd.pension_employer + ytd.private_employer, union_dues: ytd.union_dues, union_employer: ytd.union_employer,
      vacation_accrual: ytd.vacation_accrual, net_pay: ytd.net_pay,
    } : null,
  });
  return new NextResponse(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="launasedill-${line.kennitala || employeeId}-${run.year}${String(run.month).padStart(2, "0")}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
