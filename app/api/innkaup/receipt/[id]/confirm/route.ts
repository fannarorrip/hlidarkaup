import { NextRequest, NextResponse } from "next/server";
import { confirmReceipt, ReceiptError } from "@/lib/goods-receipt";

// Confirm a goods receipt → raise stock (+ movement) and book the invoice.
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await confirmReceipt(id);
    return NextResponse.json({ ok: true, ...res, invoiceNumber: `P-${String(res.voucherNumber).padStart(6, "0")}` });
  } catch (e) {
    const status = e instanceof ReceiptError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Villa" }, { status });
  }
}
