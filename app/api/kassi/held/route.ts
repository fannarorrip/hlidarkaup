import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Held/parked till sales (Geymdir reikningar). GET = list, POST = park the current cart.
export const runtime = "nodejs";

interface HeldRow { id: string; label: string | null; customer_id: string | null; customer_name: string | null; customer_is_account: boolean | null; total: string; cart: unknown; created_at: string }

export async function GET() {
  const held = await query<HeldRow>(
    `select id, label, customer_id, customer_name, customer_is_account, total, cart, created_at::text as created_at
       from shop.held_sales order by created_at desc limit 50`);
  return NextResponse.json({ held });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const cart = Array.isArray(b.cart) ? b.cart : [];
  if (!cart.length) return NextResponse.json({ error: "Karfan er tóm" }, { status: 400 });
  const row = (await query<{ id: string }>(
    `insert into shop.held_sales (label, customer_id, customer_name, customer_is_account, cart, total, created_by)
     values ($1,$2,$3,$4,$5::jsonb,$6,'kassi') returning id`,
    [b.label ?? null, b.customerId ?? null, b.customerName ?? null, typeof b.customerIsAccount === "boolean" ? b.customerIsAccount : null, JSON.stringify(cart), Math.round(Number(b.total) || 0)]))[0];
  return NextResponse.json({ id: row.id });
}
