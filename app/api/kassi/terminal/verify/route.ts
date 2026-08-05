import { NextRequest, NextResponse } from "next/server";
import { queryTerminalTransaction, adyenEnabled } from "@/lib/adyen-terminal";
import { resolveRegister, registerTerminal } from "@/lib/registers";

// Afdrif greiðslu þegar sambandið rofnaði mitt í rukkun: spyrja skýið (nexo TransactionStatus)
// hvort serviceId-ið kláraðist á posanum í stað þess að giska — giskið "ekki rukkað" var
// tvírukkunar-/tvöfaldrar-heimildar-leiðin.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!adyenEnabled()) return NextResponse.json({ known: false, error: "Posa-tenging er ekki uppsett." }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const serviceId = String(b.serviceId ?? "").slice(0, 10);
  if (!serviceId) return NextResponse.json({ known: false, error: "serviceId vantar" }, { status: 400 });
  const term = registerTerminal(resolveRegister(b.reg, "sjalfsafgreidsla").id);
  const r = await queryTerminalTransaction(serviceId, { poiid: term.poiid, saleId: term.saleId });
  return NextResponse.json(r);
}
