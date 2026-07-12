import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Assign a birgi (preferred_supplier_id) to many products at once — from the "Án birgja"
// bulk tool on the Vörur list. Gated by middleware (/api/products → stjórnandi/bókari).
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const pns = Array.isArray(b.product_numbers) ? b.product_numbers.map(String).filter(Boolean) : [];
  const supplierId = b.supplier_id ? String(b.supplier_id) : null;
  if (!pns.length || !supplierId) return NextResponse.json({ error: "Vantar vörur eða birgi" }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(supplierId)) return NextResponse.json({ error: "Ógilt auðkenni birgja" }, { status: 400 });

  const rows = await query<{ product_number: string }>(
    `update shop.products set preferred_supplier_id = $1, updated_at = now()
       where product_number = any($2::text[]) returning product_number`,
    [supplierId, pns],
  );
  return NextResponse.json({ ok: true, updated: rows.length });
}
