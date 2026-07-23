import { NextRequest, NextResponse } from "next/server";
import { sendStaffPasswordEmail } from "@/lib/staff-recover";

// Self-service "forgot password" — public (on the login page). Always returns ok so it
// never reveals which emails are staff; only real active staff actually get an email.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (email) await sendStaffPasswordEmail(String(email), { requireStaff: true }).catch(() => {});
  return NextResponse.json({ ok: true });
}
