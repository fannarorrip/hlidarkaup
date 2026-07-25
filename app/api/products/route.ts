import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Create a new product ("Búa til nýja vöru"). price_gross is a generated column, so we store
// unit_price_net + vat_rate/vat_key. Optionally attaches one barcode. Gated stjornandi/bokari.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const productNumber = String(b.product_number || "").trim();
  const name = String(b.name || "").trim();
  if (!productNumber || !name) return NextResponse.json({ error: "Vörunúmer og heiti eru skylda." }, { status: 400 });
  const vat = [24, 11, 0].includes(Number(b.vat_rate)) ? Number(b.vat_rate) : 24;
  const gross = Math.max(0, Number(b.price_gross) || 0);
  const net = gross / (1 + vat / 100);
  const vatKey = vat === 24 ? "U2" : vat === 11 ? "U1" : "U3";
  try {
    await query(
      `insert into shop.products
         (product_number, name, product_group, unit_code, vat_rate, vat_key, unit_price_net,
          is_stock_controlled, stock_quantity, use_scale, allow_discount, is_active, description, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'handvirk')`,
      [productNumber, name, b.product_group ? String(b.product_group) : null, b.unit_code ? String(b.unit_code) : null,
       vat, vatKey, net, b.is_stock_controlled !== false, Math.round(Number(b.stock_quantity) || 0),
       !!b.use_scale, b.allow_discount !== false, b.is_active !== false, b.description ? String(b.description) : null],
    );
    const bc = String(b.barcode || "").trim();
    if (bc) await query(`insert into shop.product_barcodes (barcode, product_number) values ($1,$2) on conflict do nothing`, [bc, productNumber]).catch(() => {});
    return NextResponse.json({ ok: true, product_number: productNumber });
  } catch {
    return NextResponse.json({ error: "Vörunúmer er þegar til (eða ógild gögn)." }, { status: 409 });
  }
}

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
      -- Vefverslun sýnir aðeins FULLGERÐAR vörur: mynd + innihaldslýsing. Matvæli í
      -- fjarsölu VERÐA að sýna skylduupplýsingar fyrir kaup (ESB 1169/2011 gr. 14) —
      -- og hálftómt vöruspjald selur ekki. Kassinn/verðskanninn sjá áfram allt.
      and p.image_url is not null and p.innihald is not null
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
