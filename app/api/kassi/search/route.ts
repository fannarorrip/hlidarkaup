import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface ProductRow {
  product_number: string;
  name: string;
  price_gross: number;
  vat_rate: string;
  stock_quantity: string;
  is_stock_controlled: boolean;
  image_url: string | null;
  use_scale: boolean;
  allow_discount: boolean;
}

/** Product search for the kiosk — honors KASSI_IGNORE_STOCK like the rest of /api/kassi. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  // Match by name (contains), or by product number / barcode (prefix) so an unscannable
  // barcode can be typed into "Leita að vöru" — staff reads the digits and finds the product.
  const rows = await query<ProductRow>(
    `select product_number, name, price_gross, vat_rate, stock_quantity, is_stock_controlled, image_url, use_scale, allow_discount
       from shop.products p
      where is_active and price_gross > 0
        and ( name ilike '%' || $1 || '%'
              or product_number ilike $1 || '%'
              or exists (select 1 from shop.product_barcodes b
                          where b.product_number = p.product_number and b.barcode ilike $1 || '%') )
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
    image: p.image_url ?? undefined,
    useScale: p.use_scale || undefined,
    allowDiscount: p.allow_discount,
    stock: !ignoreStock && p.is_stock_controlled
      ? Math.max(0, Math.floor(Number(p.stock_quantity)))
      : undefined,
  }));

  return NextResponse.json({ products });
}
