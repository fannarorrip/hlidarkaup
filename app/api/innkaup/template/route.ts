import { NextRequest, NextResponse } from "next/server";
import { ensureTemplate } from "@/lib/heartbeat";

// Find-or-create an order template for a supplier (every schedule card must open an editor).
// Body: { supplierName }. Gated via middleware (/api/innkaup).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const supplierName = String(body.supplierName || "").trim();
  if (!supplierName) return NextResponse.json({ ok: false, message: "Vantar nafn birgja." }, { status: 400 });
  const res = await ensureTemplate(supplierName);
  return NextResponse.json({ ok: true, ...res });
}
