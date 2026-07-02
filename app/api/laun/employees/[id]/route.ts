import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const FIELDS = [
  "kennitala", "name", "email", "phone", "address", "bank_account", "employment_type",
  "monthly_salary", "hourly_rate", "personal_credit_pct", "pension_fund",
  "pension_employee_pct", "pension_employer_pct", "private_pension_employee_pct", "private_pension_employer_pct",
  "union_name", "union_dues_pct", "union_employer_pct", "vacation_pct", "orlof_method",
  "staff_email", "is_active", "start_date", "end_date",
  "union_id", "starfsheiti", "deild", "employment_ratio",
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const cols = FIELDS.filter((f) => body[f] !== undefined);
  if (!cols.length) return NextResponse.json({ error: "Ekkert til að uppfæra" }, { status: 400 });
  const set = cols.map((f, i) => `${f} = $${i + 2}`).join(", ");
  const vals = cols.map((f) => (body[f] === "" ? null : body[f]));
  try {
    const r = await db.query<{ id: string }>(`update acc.employees set ${set} where id = $1 returning id`, [id, ...vals]);
    if (!r.rows[0]) return NextResponse.json({ error: "Launþegi fannst ekki" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: msg.includes("unique") ? "Kennitala er þegar skráð" : "Villa við uppfærslu" }, { status: 400 });
  }
}
