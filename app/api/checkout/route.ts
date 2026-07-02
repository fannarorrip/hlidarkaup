import { NextRequest, NextResponse } from "next/server";
import { postSale } from "@/lib/sales";
import { query } from "@/lib/db";
import { saveOrder, StoredOrder } from "@/lib/order-store";

// Web-shop order: paid by card (Straumur terminal at pickup). Books to the ledger
// as a card sale (debit 7716, credit sales + VAT) and stores the order details.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { items, customerName, customerPhone, pickupTime, deliveryType, deliveryAddress, shippingCost, total } = body;
  if (!items?.length || !customerName || !customerPhone || !pickupTime) {
    return NextResponse.json({ error: "Vantar upplýsingar" }, { status: 400 });
  }

  const orderId = `HL-${Date.now()}`;
  const saleItems = (items as { product: { id: string }; quantity: number }[]).map((i) => ({ id: i.product.id, quantity: i.quantity }));
  const extraLines = deliveryType === "delivery" && Number(shippingCost) > 0
    ? [{ description: `Sending: ${deliveryAddress}`, gross: Number(shippingCost), vat_rate: 24 }]
    : [];

  let customerId: string | null = null;
  try { customerId = (await query<{ id: string }>(`select id from shop.customers where is_generic limit 1`))[0]?.id ?? null; } catch { /* ignore */ }

  const stored = (id: string, reglaError: boolean): StoredOrder => ({
    id, createdAt: new Date().toISOString(), customerName, customerPhone, pickupTime,
    deliveryType: deliveryType ?? "pickup", deliveryAddress: deliveryAddress ?? null,
    shippingCost: shippingCost ?? 0, total,
    items: (items as { product: { id: string; name: string; price: number }; quantity: number }[]).map((i) => ({
      id: i.product.id, name: i.product.name, price: i.product.price, quantity: i.quantity,
    })),
    status: "pending", reglaError,
  });

  try {
    const { invoiceNumber } = await postSale(saleItems, {
      mode: "card", customerId, voucherType: "web_sale", source: "web",
      description: `Netpöntun – ${customerName}`, reference: orderId, extraLines, decrementStock: true,
    });
    try { await saveOrder(stored(invoiceNumber, false)); } catch (e) { console.warn("[Store] order save failed:", e); }
    return NextResponse.json({ orderId: invoiceNumber });
  } catch (err) {
    // Resilience: if the product isn't in the local catalog yet, keep the order locally.
    console.warn("[Web checkout] ledger post failed, saving locally:", err instanceof Error ? err.message : err);
    try { await saveOrder(stored(orderId, true)); } catch (e) { console.warn("[Store] order save failed:", e); }
    return NextResponse.json({ orderId });
  }
}
