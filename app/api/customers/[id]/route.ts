import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  try {
    const rows = await query<{ id: string }>(
      `update shop.customers set
         customer_number = $2, kennitala = $3, name = coalesce($4, name), address = $5,
         postal_code = $6, city = $7, phone = $8, email = $9,
         payment_terms_days = coalesce($10, payment_terms_days),
         is_account = coalesce($11, is_account), is_active = coalesce($12, is_active),
         rafraen_vidskipti = coalesce($13, rafraen_vidskipti),
         billing_mode = coalesce($14, billing_mode)
       where id = $1 returning id`,
      [id, b.customer_number || null, b.kennitala || null, b.name ?? null, b.address || null,
       b.postal_code || null, b.city || null, b.phone || null, b.email || null,
       b.payment_terms_days != null ? Number(b.payment_terms_days) : null,
       typeof b.is_account === "boolean" ? b.is_account : null,
       typeof b.is_active === "boolean" ? b.is_active : null,
       typeof b.rafraen_vidskipti === "boolean" ? b.rafraen_vidskipti : null,
       ["per_trip", "per_trip_invoice", "consolidated"].includes(b.billing_mode) ? b.billing_mode : null],
    );
    if (!rows.length) return NextResponse.json({ error: "Viðskiptamaður fannst ekki" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Kennitala eða númer er þegar til" }, { status: 409 });
  }
}
