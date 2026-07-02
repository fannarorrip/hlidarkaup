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

/** Look up a product by barcode (primary) or product number (fallback). */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "Vantar strikamerki" }, { status: 400 });

  const rows = await query<ProductRow>(
    `select p.product_number, p.name, p.price_gross, p.vat_rate,
            p.stock_quantity, p.is_stock_controlled
       from shop.products p
       left join shop.product_barcodes b on b.product_number = p.product_number
      where p.is_active and (b.barcode = $1 or p.product_number = $1)
      order by (b.barcode = $1) desc nulls last
      limit 1`,
    [code],
  );

  if (!rows.length) {
    return NextResponse.json({ error: `Vara fannst ekki (${code})` }, { status: 404 });
  }

  const p = rows[0];
  const ignoreStock = process.env.KASSI_IGNORE_STOCK === "true";
  const stock = !ignoreStock && p.is_stock_controlled
    ? Math.max(0, Math.floor(Number(p.stock_quantity)))
    : undefined;

  return NextResponse.json({
    id: p.product_number,
    name: p.name,
    price: p.price_gross,
    vatPct: Number(p.vat_rate),
    stock,
  });
}
