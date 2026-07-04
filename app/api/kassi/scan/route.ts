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

  // In-store embedded barcodes from the scale printer: 13 digits, [7 item ref][5 value][CD].
  //   prefix 22 = PRICE embedded  (verðmerki):  2200409|01719|9 → item 2200409 at 1.719 kr
  //   prefix 23 = WEIGHT embedded (magnmerki):  2314801|00346|6 → item 2314801, 346 g = 0,346 kg
  // The 7-digit ref is what's registered in product_barcodes. Falls through to normal lookup
  // if the ref isn't registered ('2…' EAN-13s do exist in the wild).
  if (/^2[23]\d{11}$/.test(code)) {
    const isWeight = code.startsWith("23");
    const ref = code.slice(0, 7);
    const value = parseInt(code.slice(7, 12), 10);
    if (value > 0) {
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
        const base = { id: p.product_number, name: p.name, price: p.price_gross, vatPct: Number(p.vat_rate) };
        if (isWeight) {
          // grams on the label → kg; the till charges kg × catalog price-per-kg
          return NextResponse.json({ ...base, embeddedWeightKg: value / 1000 });
        }
        // price on the label wins exactly; derived weight is display/statistics only
        const kg = p.price_gross > 0 ? Math.round((value / p.price_gross) * 1000) / 1000 : null;
        return NextResponse.json({ ...base, embeddedPrice: value, embeddedKg: kg });
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
