import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.name?.trim()) return NextResponse.json({ error: "Vantar nafn" }, { status: 400 });
  // KS-samstæðan (kt 550698-2349 + deildartala): samningskjör sjálfkrafa á hverja nýja deild —
  // 7% afsláttur, rafrænir reikningar (inExchange), reikningur í hvert sinn ÁN bankakröfu.
  // Sömu kjör og migration 620 setti á þær sem fyrir voru.
  const ktDigits = String(b.kennitala || "").replace(/\D/g, "");
  const isKS = ktDigits.startsWith("5506982349");
  const billingMode = isKS ? "per_trip_invoice"
    : ["per_trip", "per_trip_invoice", "staff"].includes(b.billing_mode) ? b.billing_mode : "consolidated";
  const discountPct = isKS ? Math.max(7, Number(b.discount_pct) || 0)
    : Math.min(100, Math.max(0, Number(b.discount_pct) || 0));
  try {
    const rows = await query<{ id: string }>(
      `insert into shop.customers
         (customer_number, kennitala, name, address, postal_code, city, phone, email, payment_terms_days, is_account, is_active, rafraen_vidskipti, billing_mode, discount_pct)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [b.customer_number || null, b.kennitala || null, b.name.trim(), b.address || null, b.postal_code || null,
       b.city || null, b.phone || null, b.email || null, Number(b.payment_terms_days) || 0,
       !!b.is_account, b.is_active !== false, isKS || !!b.rafraen_vidskipti, billingMode,
       Math.min(100, discountPct)],
    );
    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch {
    return NextResponse.json({ error: "Kennitala eða viðskiptamannanúmer er þegar til" }, { status: 409 });
  }
}
