import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/** Returns the bag product (BURÐARPOKI) offered before payment. */
export async function GET() {
  const productNumber = process.env.KASSI_BAG_PRODUCT ?? "";
  if (!productNumber) return NextResponse.json({ error: "No bag product configured" }, { status: 404 });

  const rows = await query<{ product_number: string; name: string; price_gross: number; vat_rate: string }>(
    `select product_number, name, price_gross, vat_rate
       from shop.products where product_number = $1 and is_active`,
    [productNumber],
  );
  if (!rows.length) return NextResponse.json({ error: "Bag product not found" }, { status: 404 });

  const p = rows[0];
  return NextResponse.json({
    id: p.product_number,
    name: p.name,
    price: p.price_gross,
    vatPct: Number(p.vat_rate),
  });
}
