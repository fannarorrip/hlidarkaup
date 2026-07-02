import { NextRequest, NextResponse } from "next/server";
import { updateOrderStatus } from "@/lib/order-store";

const ALLOWED = new Set(["pending", "confirmed", "ready", "delivered", "cancelled"]);

// Update a web-shop order's status. Gated stjornandi/bokari via middleware (/api/pantanir).
export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json().catch(() => ({}));
  if (!id || !ALLOWED.has(status)) return NextResponse.json({ error: "Vantar id eða ógild staða" }, { status: 400 });
  const updated = await updateOrderStatus(id, status);
  if (!updated) return NextResponse.json({ error: "Pöntun fannst ekki" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
