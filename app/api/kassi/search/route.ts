import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface ProductRow {
  product_number: string;
  name: string;
  price_gross: number;
  vat_rate: string;
  stock_quantity: string;
  is_stock_controlled: boolean;
}

/** Product search for the kiosk — honors KASSI_IGNORE_STOCK like the rest of /api/kassi. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  const rows = await query<ProductRow>(
    `select product_number, name, price_gross, vat_rate, stock_quantity, is_stock_controlled
       from shop.products
      where is_active and price_gross > 0 and name ilike '%' || $1 || '%'
      order by name
      limit 24`,
    [q],
  );

  const ignoreStock = process.env.KASSI_IGNORE_STOCK === "true";
  const products = rows.map((p) => ({
    id: p.product_number,
    name: p.name,
    price: p.price_gross,
    vatPct: Number(p.vat_rate),
    stock: !ignoreStock && p.is_stock_controlled
      ? Math.max(0, Math.floor(Number(p.stock_quantity)))
      : undefined,
  }));

  return NextResponse.json({ products });
}
