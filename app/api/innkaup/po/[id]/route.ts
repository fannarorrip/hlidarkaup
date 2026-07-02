import { NextRequest, NextResponse } from "next/server";
import { getPurchaseOrder, setPurchaseOrderStatus } from "@/lib/purchase-orders";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) return NextResponse.json({ error: "Pöntun fannst ekki" }, { status: 404 });
  return NextResponse.json(po);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (b.status && ["draft", "sent", "received", "cancelled"].includes(b.status)) await setPurchaseOrderStatus(id, b.status);
  return NextResponse.json({ ok: true });
}
