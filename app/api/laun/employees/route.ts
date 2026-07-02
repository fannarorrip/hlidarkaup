import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listEmployees } from "@/lib/accounting-queries";

// Payroll employee register (launþegar). Gated by middleware (/api/laun → stjornandi/bokari).
export const runtime = "nodejs";

const FIELDS = [
  "kennitala", "name", "email", "phone", "address", "bank_account", "employment_type",
  "monthly_salary", "hourly_rate", "personal_credit_pct", "pension_fund",
  "pension_employee_pct", "pension_employer_pct", "private_pension_employee_pct", "private_pension_employer_pct",
  "union_name", "union_dues_pct", "union_employer_pct", "vacation_pct", "orlof_method",
  "staff_email", "is_active", "start_date", "end_date",
  "union_id", "starfsheiti", "deild", "employment_ratio",
];

export async function GET() {
  return NextResponse.json({ employees: await listEmployees(false) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.kennitala || !body.name) return NextResponse.json({ error: "Vantar kennitölu og nafn" }, { status: 400 });
  const cols = FIELDS.filter((f) => body[f] !== undefined && body[f] !== "");
  const vals = cols.map((f) => body[f]);
  const ph = cols.map((_, i) => `$${i + 1}`);
  try {
    const r = await db.query<{ id: string }>(
      `insert into acc.employees (${cols.join(",")}) values (${ph.join(",")}) returning id`, vals);
    return NextResponse.json({ ok: true, id: r.rows[0].id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: msg.includes("unique") || msg.includes("kennitala") ? "Kennitala er þegar skráð" : "Villa við skráningu launþega" }, { status: 400 });
  }
}
