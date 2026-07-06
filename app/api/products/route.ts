import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Public web-shop product list — served from the local Postgres catalog (no Regla).
// Search by name / product number / barcode, paginated, with a total count.
const CAT_NAMES: Record<string, string> = { "10": "Aðalvalmynd", "20": "Ávextir", "30": "Grænmeti", "40": "Kál", "50": "Bakarí" };

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const search = (sp.get("search") ?? "").trim();
  const page = Math.max(0, parseInt(sp.get("page") ?? "0", 10) || 0);
  const limit = Math.min(Math.max(1, parseInt(sp.get("limit") ?? "48", 10) || 48), 100);
  const offset = page * limit;

  const rows = await query<{
    product_number: string; name: string; description: string | null; price_gross: number;
    product_group: string | null; stock_quantity: string; is_stock_controlled: boolean; image_url: string | null; total: string;
  }>(`
    select p.product_number, p.name, p.description, p.price_gross, p.product_group, p.stock_quantity, p.is_stock_controlled, p.image_url,
           count(*) over() as total
    from shop.products p
    where p.is_active and p.price_gross > 0
      and ($1 = '' or unaccent(p.name) ilike unaccent('%'||$1||'%') or p.product_number ilike $1||'%'
           or exists (select 1 from shop.product_barcodes b where b.product_number = p.product_number and b.barcode like $1||'%'))
    order by p.name limit $2 offset $3`, [search, limit, offset]);

  const total = rows[0] ? Number(rows[0].total) : 0;
  const products = rows.map((r) => ({
    id: r.product_number,
    name: r.name,
    description: r.description ?? r.name,
    price: Number(r.price_gross),
    category: r.product_group ? (CAT_NAMES[r.product_group] ?? r.product_group) : "",
    stock: r.is_stock_controlled ? Math.max(0, Math.floor(Number(r.stock_quantity))) : undefined,
    image: r.image_url ?? undefined,
  }));

  return NextResponse.json({ products, total, page, limit });
}
