import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Vefflokkatréð fyrir vefverslunina (opinbert, ekkert auðkenni): 18 yfirflokkar + undirflokkar
// með fjölda FULLGERÐRA vara (sömu skilyrði og vörulistinn: virk, verð, mynd, innihald) —
// framendinn sýnir bara flokka sem eiga vörur. Yfirflokkstalan telur undirflokkana með.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await query<{ slug: string; name: string; parent_slug: string | null; sort: number; products: number }>(`
    select c.slug, c.name, c.parent_slug, c.sort,
           count(p.product_number) filter (
             where p.is_active and p.price_gross > 0 and p.image_url is not null and p.innihald is not null
           )::int as products
    from shop.web_categories c
    left join shop.products p on p.web_category = c.slug
    group by c.slug, c.name, c.parent_slug, c.sort
    order by c.parent_slug nulls first, c.sort, c.name`);
  // Rúlla undirflokkatölum upp í yfirflokkinn.
  const byParent = new Map<string, number>();
  for (const r of rows) if (r.parent_slug) byParent.set(r.parent_slug, (byParent.get(r.parent_slug) ?? 0) + r.products);
  const flokkar = rows.map((r) => ({
    slug: r.slug, name: r.name, parent: r.parent_slug,
    products: r.parent_slug ? r.products : r.products + (byParent.get(r.slug) ?? 0),
  }));
  return NextResponse.json({ flokkar });
}
