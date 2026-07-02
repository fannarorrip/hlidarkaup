import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Reclassify a lánadrottinn (AP) as a viðskiptamaður (AR): create/reuse the customer record
// (billable, ar 7600), then remove the supplier (delete if no ledger history, else deactivate).
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Ógilt auðkenni" }, { status: 400 });
  const s = (await query<{
    id: string; name: string; kennitala: string | null; address: string | null;
    postal_code: string | null; city: string | null; phone: string | null; email: string | null;
    payment_terms_days: number; is_generic: boolean;
  }>(`select id, name, kennitala, address, postal_code, city, phone, email, payment_terms_days, is_generic
        from acc.suppliers where id = $1`, [id]))[0];
  if (!s) return NextResponse.json({ error: "Lánadrottinn fannst ekki" }, { status: 404 });
  if (s.is_generic) return NextResponse.json({ error: "Ekki er hægt að færa safnlið." }, { status: 400 });

  let customerId: string | null = null;
  if (s.kennitala) {
    customerId = (await query<{ id: string }>(`select id from shop.customers where kennitala = $1`, [s.kennitala]))[0]?.id ?? null;
    if (customerId) await query(`update shop.customers set is_active = true where id = $1`, [customerId]);
  }
  if (!customerId) {
    try {
      customerId = (await query<{ id: string }>(
        `insert into shop.customers (name, kennitala, address, postal_code, city, phone, email, payment_terms_days, is_account, ar_account, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true,'7600',true) returning id`,
        [s.name, s.kennitala, s.address, s.postal_code, s.city, s.phone, s.email, s.payment_terms_days]))[0].id;
    } catch (e) {
      return NextResponse.json({ error: "Tókst ekki að stofna viðskiptamann: " + (e instanceof Error ? e.message : "") }, { status: 400 });
    }
  }

  let removed = "deleted";
  try {
    await query(`delete from acc.suppliers where id = $1`, [id]);
  } catch {
    await query(`update acc.suppliers set is_active = false where id = $1`, [id]);
    removed = "deactivated";
  }

  return NextResponse.json({ ok: true, customerId, removed });
}
