import { NextRequest, NextResponse } from "next/server";
import { postKassiSale, SaleError, type SaleItem, type PaymentInfo } from "@/lib/sales";
import { knownRegisterId } from "@/lib/registers";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const items: SaleItem[] = body.items ?? [];
  const payment: PaymentInfo = body.payment ?? { approved: false };

  if (!items.length) return NextResponse.json({ error: "Karfan er tóm" }, { status: 400 });
  if (!payment.approved) return NextResponse.json({ error: "Greiðsla ekki staðfest" }, { status: 402 });

  try {
    const { invoiceNumber } = await postKassiSale(items, payment, { registerId: knownRegisterId(body.reg) });
    return NextResponse.json({ invoiceNumber });
  } catch (err) {
    if (err instanceof SaleError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[Kassi] checkout error:", err);
    return NextResponse.json({ error: "Villa við að skrá söluna" }, { status: 500 });
  }
}
