import { NextRequest, NextResponse } from "next/server";
import { getBills, upsertBankBills, listOpenBankBills, b2bStatus } from "@/lib/arion-b2b";

// Incoming bank bills (ógreiddar kröfur á okkur) from Arion/RB B2B via the Bridge.
// Gated stjórnandi via middleware (/api/bankatenging). GET = list; POST {action:'fetch'} = pull from bank.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, status: b2bStatus(), bills: await listOpenBankBills().catch(() => []) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "fetch");
  if (action !== "fetch") return NextResponse.json({ ok: false, message: "Óþekkt aðgerð." });

  const st = b2bStatus();
  if (!st.configured) {
    return NextResponse.json({ ok: false, configured: false, message: "B2B Bridge er ekki tengd (sjá deploy/ARION_B2B_BRIDGE.md)." });
  }
  const res = await getBills();
  if (!res.ok) return NextResponse.json({ ok: false, configured: true, message: res.error || "Sókn mistókst." });
  const summary = await upsertBankBills(res.bills);
  return NextResponse.json({ ok: true, configured: true, ...summary, bills: await listOpenBankBills().catch(() => []) });
}
