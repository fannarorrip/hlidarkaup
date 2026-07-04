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

  // In-store price-embedded barcode (verðmerki from the scale printer): 13 digits starting
  // with '2' — [7 item ref][5 price in kr][1 check digit], e.g. 2200409|01719|9 = item
  // 2200409 at 1,719 kr. The 7-digit ref is what's registered in product_barcodes.
  // Falls through to normal lookup if the ref isn't registered ('2…' EAN-13s do exist).
  if (/^2\d{12}$/.test(code)) {
    const ref = code.slice(0, 7);
    const priceKr = parseInt(code.slice(7, 12), 10);
    if (priceKr > 0) {
      const emb = await query<ProductRow>(
        `select p.product_number, p.name, p.price_gross, p.vat_rate,
                p.stock_quantity, p.is_stock_controlled, p.use_scale
           from shop.products p
           join shop.product_barcodes b on b.product_number = p.product_number
          where p.is_active and b.barcode = $1
          limit 1`,
        [ref],
      );
      if (emb.length) {
        const p = emb[0];
        // derive the pack weight from price ÷ price-per-kg (display/statistics only)
        const kg = p.price_gross > 0 ? Math.round((priceKr / p.price_gross) * 1000) / 1000 : null;
        return NextResponse.json({
          id: p.product_number,
          name: p.name,
          price: p.price_gross,
          vatPct: Number(p.vat_rate),
          embeddedPrice: priceKr,
          embeddedKg: kg,
        });
      }
    }
  }

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
