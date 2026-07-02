import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Products for the till grid: by category (group) and/or accent-insensitive name search.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const group = sp.get("group") ?? "";
  const q = (sp.get("q") ?? "").trim();
  const limit = Math.min(Number(sp.get("limit")) || 60, 120);

  const rows = await query<{ product_number: string; name: string; price_gross: number; vat_rate: string }>(`
    select product_number, name, price_gross, vat_rate
    from shop.products
    where is_active
      and ($1 = '' or coalesce(nullif(product_group,''),'(óflokkað)') = $1)
      and ($2 = '' or unaccent(name) ilike unaccent('%'||$2||'%') or product_number ilike $2||'%')
    order by name limit $3`, [group, q, limit]);

  return NextResponse.json({ products: rows.map((r) => ({ id: r.product_number, name: r.name, price: r.price_gross, vatPct: Number(r.vat_rate) })) });
}
