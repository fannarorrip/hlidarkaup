import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hasAnthropicKey } from "@/lib/invoice-extract";
import { categorizeBatch, getCategoryOptions } from "@/lib/ai-categorize";

// AI-vöruflokkun í lotum: hvert POST flokkar næstu ~120 óflokkuðu vörurnar og skilar
// framvindu — vafrinn kallar aftur þar til remaining = 0. Handvirk flokkun (web_category
// þegar sett) er ALDREI snert. Gated af /api/products-reglunni í middleware.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 120;

export async function POST() {
  if (!hasAnthropicKey()) return NextResponse.json({ error: "ANTHROPIC_API_KEY vantar" }, { status: 501 });
  const options = await getCategoryOptions();
  if (!options.length) return NextResponse.json({ error: "Engir vefflokkar til — keyrðu migration fyrst" }, { status: 409 });

  const products = await query<{ product_number: string; name: string }>(`
    select product_number, name from shop.products
    where is_active and web_category is null
    order by product_number limit $1`, [BATCH]);
  if (!products.length) return NextResponse.json({ ok: true, classified: 0, skipped: 0, remaining: 0 });

  const map = await categorizeBatch(products, options);
  let classified = 0;
  for (const [pn, slug] of Object.entries(map)) {
    await query(`update shop.products set web_category = $1 where product_number = $2 and web_category is null`, [slug, pn]);
    classified++;
  }
  // Vörur sem gervigreindin treysti sér ekki í haldast óflokkaðar (vafrinn hættir að kalla
  // þegar lota skilar engri framvindu — þær eru þá handflokkaðar á vöruspjaldinu).
  const unsure = products.length - classified;
  const remaining = Number((await query<{ n: string }>(`select count(*) as n from shop.products where is_active and web_category is null`))[0].n) || 0;
  return NextResponse.json({ ok: true, classified, skipped: unsure, remaining });
}
