import { NextRequest, NextResponse } from "next/server";
import { postSale, SaleError, type SaleItem, type PaymentInfo, type PayMode } from "@/lib/sales";

// Staffed till: card / cash / transfer / account ("á reikning") sale.
const MODES: PayMode[] = ["card", "account", "cash", "transfer"];
const DESC: Record<PayMode, string> = {
  card: "Kassasala – kort (afgreiðsla)",
  cash: "Kassasala – reiðufé (afgreiðsla)",
  transfer: "Kassasala – símgreiðsla (afgreiðsla)",
  account: "Reikningssala (afgreiðsla)",
};

export async function POST(req: NextRequest) {
  const b = await req.json();
  const items: SaleItem[] = b.items ?? [];
  const mode: PayMode = MODES.includes(b.mode) ? b.mode : "card";
  if (!items.length) return NextResponse.json({ error: "Karfan er tóm" }, { status: 400 });

  const payment: PaymentInfo = b.payment ?? { approved: true, processor: "STAFF" };
  if (mode === "card" && !payment.approved) return NextResponse.json({ error: "Greiðsla ekki staðfest" }, { status: 402 });
  const kind: "sale" | "return" = b.kind === "return" ? "return" : "sale";

  try {
    const { invoiceNumber, voucherId } = await postSale(items, {
      mode, kind,
      customerId: b.customerId ?? null,
      payment,
      source: "till",
      voucherType: kind === "return" ? "credit_note" : mode === "account" ? "account_sale" : "kassi_sale",
      description: kind === "return" ? `Skil – endurgreiðsla (${mode})` : DESC[mode],
    });
    return NextResponse.json({ invoiceNumber, voucherId });
  } catch (err) {
    if (err instanceof SaleError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Staff till] error:", err);
    return NextResponse.json({ error: "Villa við að skrá söluna" }, { status: 500 });
  }
}
