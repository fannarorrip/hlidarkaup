import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Product search for purchasing (returns innkaupsverð = cost_price + VSK rate). Middleware-gated.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ products: [] });
  const rows = await query<{ product_number: string; name: string; cost_price: number | null; vat_rate: string }>(`
    select product_number, name, cost_price, vat_rate from shop.products
    where is_active and (unaccent(name) ilike unaccent('%'||$1||'%') or product_number ilike $1||'%')
    order by name limit 24`, [q]);
  return NextResponse.json({ products: rows.map((r) => ({ id: r.product_number, name: r.name, cost: Math.round(Number(r.cost_price) || 0), vatPct: Number(r.vat_rate) })) });
}
