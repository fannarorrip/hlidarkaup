import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.name?.trim()) return NextResponse.json({ error: "Vantar nafn" }, { status: 400 });
  try {
    const rows = await query<{ id: string }>(
      `insert into shop.customers
         (customer_number, kennitala, name, address, postal_code, city, phone, email, payment_terms_days, is_account, is_active, rafraen_vidskipti, billing_mode)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [b.customer_number || null, b.kennitala || null, b.name.trim(), b.address || null, b.postal_code || null,
       b.city || null, b.phone || null, b.email || null, Number(b.payment_terms_days) || 0,
       !!b.is_account, b.is_active !== false, !!b.rafraen_vidskipti, b.billing_mode === "per_trip" ? "per_trip" : "consolidated"],
    );
    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch {
    return NextResponse.json({ error: "Kennitala eða viðskiptamannanúmer er þegar til" }, { status: 409 });
  }
}
