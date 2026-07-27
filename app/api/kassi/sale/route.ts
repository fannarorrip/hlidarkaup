import { NextRequest, NextResponse } from "next/server";
import { postSale, SaleError, type SaleItem, type PaymentInfo, type PayMode } from "@/lib/sales";
import { knownRegisterId } from "@/lib/registers";

// Staffed till: card / cash / transfer / account ("á reikning") sale.
const MODES: PayMode[] = ["card", "account", "cash", "transfer"];
const DESC: Record<PayMode, string> = {
  card: "Kassasala – kort (afgreiðsla)",
  cash: "Kassasala – reiðufé (afgreiðsla)",
  transfer: "Kassasala – símgreiðsla / MOTO (afgreiðsla)",
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
  // Split payment: multiple money-in tenders (cash + card + …). Ledger posts one debit line each.
  const tenders: { mode: PayMode; amount: number }[] | undefined = Array.isArray(b.tenders) && b.tenders.length
    ? b.tenders.filter((t: { mode: PayMode; amount: number }) => MODES.includes(t.mode) && Number(t.amount) > 0)
        .map((t: { mode: PayMode; amount: number }) => ({ mode: t.mode, amount: Math.round(Number(t.amount)) }))
    : undefined;

  try {
    const { invoiceNumber, voucherId } = await postSale(items, {
      mode: tenders && tenders.length ? "cash" : mode, kind, // mode ignored when tenders drive the debit lines
      customerId: b.customerId ?? null,
      payment,
      source: "till",
      registerId: knownRegisterId(b.reg),
      voucherType: kind === "return" ? "credit_note" : mode === "account" ? "account_sale" : "kassi_sale",
      // Skýring frá kassanum ("vegna vinnu við X") verður lýsing reikningssölunnar — sést í
      // bókhaldi, á fylgiskjali og á reikningi viðskiptamannsins.
      description: kind === "return" ? `Skil – endurgreiðsla (${mode})`
        : (mode === "account" && b.note ? `Reikningssala – ${String(b.note).slice(0, 120)}`
        : tenders ? "Kassasala – skipt greiðsla (afgreiðsla)" : DESC[mode]),
      tenders,
    });
    return NextResponse.json({ invoiceNumber, voucherId });
  } catch (err) {
    if (err instanceof SaleError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Staff till] error:", err);
    return NextResponse.json({ error: "Villa við að skrá söluna" }, { status: 500 });
  }
}
