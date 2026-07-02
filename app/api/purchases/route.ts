import { NextRequest, NextResponse } from "next/server";
import { postPurchase, PurchaseError } from "@/lib/purchases";

export async function POST(req: NextRequest) {
  const b = await req.json();
  try {
    const r = await postPurchase({
      supplierName: b.supplierName,
      supplierId: b.supplierId,
      supplierInvoiceNo: b.supplierInvoiceNo,
      date: b.date,
      lines: b.lines ?? [],
      payment: b.payment === "paid" ? "paid" : "credit",
      payAccount: b.payAccount,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof PurchaseError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Purchase] error:", err);
    return NextResponse.json({ error: "Villa við að skrá innkaup" }, { status: 500 });
  }
}
