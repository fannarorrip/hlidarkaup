import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface ProductRow {
  product_number: string;
  name: string;
  price_gross: number;
  vat_rate: string;
  stock_quantity: string;
  is_stock_controlled: boolean;
  use_scale: boolean;
}

/** Look up a product by barcode (primary) or product number (fallback). */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "Vantar strikamerki" }, { status: 400 });

  // UPC-A goods are the same code as EAN-13 with a leading zero — scanners and imports
  // disagree on which form to use, so match both spellings.
  const variants = [code];
  if (/^\d{12}$/.test(code)) variants.push("0" + code);
  if (/^0\d{12}$/.test(code)) variants.push(code.slice(1));

  const rows = await query<ProductRow>(
    `select p.product_number, p.name, p.price_gross, p.vat_rate,
            p.stock_quantity, p.is_stock_controlled, p.use_scale
       from shop.products p
       left join shop.product_barcodes b on b.product_number = p.product_number
      where p.is_active and (b.barcode = any($1::text[]) or p.product_number = $2)
      order by (b.barcode = any($1::text[])) desc nulls last
      limit 1`,
    [variants, code],
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
    // vigtarvara: price is per kg — the till weighs it on the scanner scale
    useScale: p.use_scale || undefined,
  });
}
