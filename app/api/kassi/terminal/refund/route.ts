import { NextRequest, NextResponse } from "next/server";
import { sendRefundToTerminal, adyenEnabled } from "@/lib/adyen-terminal";
import { resolveRegister, registerTerminal } from "@/lib/registers";

// Run a card REFUND on the Adyen/Straumur terminal (skil/endurgreiðsla). Standalone refund:
// the shopper presents a card and the amount is credited back. Blocks until they complete.
// `reg` selects which register's terminal (posi) to use.
export const runtime = "nodejs";
export const maxDuration = 190; // holds the sync connection while the shopper taps (~150s Adyen window)

export async function POST(req: NextRequest) {
  if (!adyenEnabled()) return NextResponse.json({ approved: false, error: "Posa-tenging er ekki uppsett." }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const amount = Math.round(Number(b.amount) || 0);
  if (amount <= 0) return NextResponse.json({ approved: false, error: "Ógild upphæð" }, { status: 400 });
  const ref = String(b.ref || `skil-${Date.now()}`).slice(0, 40);
  const serviceId = b.serviceId ? String(b.serviceId).slice(0, 10) : undefined; // lets the till Abort this exact refund
  const term = registerTerminal(resolveRegister(b.reg, "sjalfsafgreidsla").id);
  const r = await sendRefundToTerminal(amount, ref, { poiid: term.poiid, saleId: term.saleId, serviceId });
  return NextResponse.json(r, { status: r.approved ? 200 : 402 });
}
