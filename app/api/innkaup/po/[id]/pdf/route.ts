import { NextRequest, NextResponse } from "next/server";
import { getPurchaseOrder } from "@/lib/purchase-orders";
import { renderPurchaseOrderPdf } from "@/lib/pdf/purchase-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) return NextResponse.json({ error: "Pöntun fannst ekki" }, { status: 404 });
  const pdf = await renderPurchaseOrderPdf(po);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${po.po_number}.pdf"`, "cache-control": "no-store" },
  });
}
