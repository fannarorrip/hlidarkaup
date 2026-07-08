import { NextRequest, NextResponse } from "next/server";
import { sendPaymentToTerminal, adyenEnabled } from "@/lib/adyen-terminal";
import { resolveRegister, registerTerminal } from "@/lib/registers";

// Run a card payment on the Adyen/Straumur terminal. Blocks until the customer completes.
// `reg` selects which register's terminal (posi) to charge.
export const runtime = "nodejs";
export const maxDuration = 190; // holds the sync connection while the shopper taps (~150s Adyen window)

export async function POST(req: NextRequest) {
  if (!adyenEnabled()) return NextResponse.json({ approved: false, error: "Posa-tenging er ekki uppsett." }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const amount = Math.round(Number(b.amount) || 0);
  if (amount <= 0) return NextResponse.json({ approved: false, error: "Ógild upphæð" }, { status: 400 });
  const ref = String(b.ref || `till-${Date.now()}`).slice(0, 40);
  const term = registerTerminal(resolveRegister(b.reg, "sjalfsafgreidsla").id);
  const r = await sendPaymentToTerminal(amount, ref, { poiid: term.poiid, saleId: term.saleId });
  return NextResponse.json(r, { status: r.approved ? 200 : 402 });
}
