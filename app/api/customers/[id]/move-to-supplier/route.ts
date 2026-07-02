import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Reclassify a viðskiptamaður (AR) as a lánadrottinn (AP): create/reuse the supplier record,
// then remove the customer (delete if it has no ledger history, else deactivate). Middleware-gated.
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Ógilt auðkenni" }, { status: 400 });
  const c = (await query<{
    id: string; name: string; kennitala: string | null; address: string | null;
    postal_code: string | null; city: string | null; phone: string | null; email: string | null;
    payment_terms_days: number; is_generic: boolean;
  }>(`select id, name, kennitala, address, postal_code, city, phone, email, payment_terms_days, is_generic
        from shop.customers where id = $1`, [id]))[0];
  if (!c) return NextResponse.json({ error: "Viðskiptamaður fannst ekki" }, { status: 404 });
  if (c.is_generic) return NextResponse.json({ error: "Ekki er hægt að færa safnlið." }, { status: 400 });

  // Find existing supplier by kennitala, else create one carrying the contact details.
  let supplierId: string | null = null;
  if (c.kennitala) {
    supplierId = (await query<{ id: string }>(`select id from acc.suppliers where kennitala = $1`, [c.kennitala]))[0]?.id ?? null;
    if (supplierId) await query(`update acc.suppliers set is_active = true where id = $1`, [supplierId]);
  }
  if (!supplierId) {
    try {
      supplierId = (await query<{ id: string }>(
        `insert into acc.suppliers (name, kennitala, address, postal_code, city, phone, email, payment_terms_days, ap_account, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'9300',true) returning id`,
        [c.name, c.kennitala, c.address, c.postal_code, c.city, c.phone, c.email, c.payment_terms_days]))[0].id;
    } catch (e) {
      return NextResponse.json({ error: "Tókst ekki að stofna lánadrottin: " + (e instanceof Error ? e.message : "") }, { status: 400 });
    }
  }

  // Remove from the customer register — delete when possible, deactivate if FK history exists.
  let removed = "deleted";
  try {
    await query(`delete from shop.customers where id = $1`, [id]);
  } catch {
    await query(`update shop.customers set is_active = false where id = $1`, [id]);
    removed = "deactivated";
  }

  return NextResponse.json({ ok: true, supplierId, removed });
}
