import { NextRequest, NextResponse } from "next/server";
import { getAllOrders, updateOrderStatus } from "@/lib/order-store";

export async function GET() {
  const orders = await getAllOrders();
  orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json(orders);
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  const updated = await updateOrderStatus(id, status);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}
