import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Hillumiðar: vöruleit (q=) eða vörur með nýbreytt verð (recent=1 — applied verðbreytingar
// síðustu 48 klst, prentlistinn eftir móttöku). Gated /api/products (stjornandi/bokari/lagerstjori).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface LabelProduct {
  product_number: string; name: string; price_gross: number; use_scale: boolean;
  unit_code: string | null; barcode: string | null;
}

const SELECT = `
  select p.product_number, p.name, p.price_gross, p.use_scale, p.unit_code,
         (select b.barcode from shop.product_barcodes b
           where b.product_number = p.product_number
           order by length(b.barcode) = 13 desc, b.barcode limit 1) as barcode
  from shop.products p`;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("recent") === "1") {
    const rows = await query<LabelProduct>(`${SELECT}
      where p.product_number in (
        select s.product_number from acc.price_suggestions s
        where s.status = 'applied' and s.decided_at > now() - interval '48 hours')
      order by p.name limit 200`);
    return NextResponse.json({ products: rows });
  }
  const q = (sp.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ products: [] });
  const rows = await query<LabelProduct>(`${SELECT}
    where p.is_active and (unaccent(p.name) ilike unaccent('%'||$1||'%') or p.product_number ilike $1||'%'
      or exists (select 1 from shop.product_barcodes b2 where b2.product_number = p.product_number and b2.barcode ilike $1||'%'))
    order by p.name limit 30`, [q]);
  return NextResponse.json({ products: rows });
}
