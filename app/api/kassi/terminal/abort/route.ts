import { NextRequest, NextResponse } from "next/server";
import { abortTerminalPayment, adyenEnabled } from "@/lib/adyen-terminal";
import { resolveRegister, registerTerminal } from "@/lib/registers";

// Cancel an in-flight card payment ON the terminal (Nexo Abort) — cashier pressed "Hætta við".
// Body: { reg, serviceId } (serviceId = the one the till sent with /terminal/pay).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!adyenEnabled()) return NextResponse.json({ ok: false, error: "Posa-tenging er ekki uppsett." }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const serviceId = String(b.serviceId || "").slice(0, 10);
  if (!serviceId) return NextResponse.json({ ok: false, error: "Vantar auðkenni greiðslu" }, { status: 400 });
  const term = registerTerminal(resolveRegister(b.reg, "sjalfsafgreidsla").id);
  const r = await abortTerminalPayment({ poiid: term.poiid, saleId: term.saleId, serviceId });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
