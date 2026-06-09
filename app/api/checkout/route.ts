import { NextRequest, NextResponse } from "next/server";
import { saveOrder, StoredOrder } from "@/lib/order-store";

const REGLA_BASE = process.env.REGLA_BASE_URL ?? "https://www.regla.is/fibs/RestAPI2019";
const REGLA_USER = process.env.REGLA_USERNAME ?? "";
const REGLA_PASS = process.env.REGLA_PASSWORD ?? "";

// ── Regla token cache ─────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getReglaToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${REGLA_BASE}/Login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: REGLA_USER, password: REGLA_PASS }),
  });
  const data = await res.json();
  if (!data?.Result?.Success) throw new Error("Regla login failed");
  const token = data.Result.Messages?.[0];
  if (!token || token.startsWith("INFO_")) throw new Error("No token");
  cachedToken = token;
  tokenExpiry = Date.now() + 20 * 60 * 1000;
  return token;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { items, customerName, customerPhone, pickupTime, deliveryType, deliveryAddress, shippingCost, total } = body;

  if (!items?.length || !customerName || !customerPhone || !pickupTime) {
    return NextResponse.json({ error: "Vantar upplýsingar" }, { status: 400 });
  }

  const orderId = `HL-${Date.now()}`;
  const deliveryInfo = deliveryType === "delivery"
    ? `Heimsending á: ${deliveryAddress} | Sendingarkostnaður: ${shippingCost} kr.`
    : `Sækir í verslun (Akurhlíð 1, Sauðárkrókur)`;
  const comment = [`Netpöntun #${orderId}`, `Nafn: ${customerName}`, `Sími: ${customerPhone}`, `Tími: ${pickupTime}`, deliveryInfo].join(" | ");

  // ── Try Regla ───────────────────────────────────────────────────────────────
  if (REGLA_USER && REGLA_PASS) {
    try {
      const token = await getReglaToken();
      const invoiceEntries = items.map((item: { product: { id: string; name: string; price: number }; quantity: number }) => ({
        Product: { ProductNumber: item.product.id, Name: item.product.name, UnitPrice: item.product.price, AllowPriceOverwrite: true, VatDefinition: { Key: "U2" } },
        Quantity: item.quantity,
        UnitPrice: item.product.price,
        Text: item.product.name,
        Amount: 0, VATPercentage: 0, VATAmount: 0, Discount: 0, IsDiscountPercentage: false, ID: 0,
      }));

      if (deliveryType === "delivery" && shippingCost > 0) {
        invoiceEntries.push({ Product: { ProductNumber: "SENDING", Name: "Sendingarkostnaður", UnitPrice: shippingCost, AllowPriceOverwrite: true, VatDefinition: { Key: "U2" } }, Quantity: 1, UnitPrice: shippingCost, Text: `Sending: ${deliveryAddress}`, Amount: 0, VATPercentage: 0, VATAmount: 0, Discount: 0, IsDiscountPercentage: false, ID: 0 });
      }

      const res = await fetch(`${REGLA_BASE}/CreateInvoice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          invoice: {
            Customer: { CustomerNumber: customerPhone.replace(/[^0-9]/g, "").padEnd(10, "0").slice(0, 10), Name: customerName, Phone1: customerPhone, PaymentMethod: { ID: 2848 } },
            Concerning: `Netpöntun – ${customerName}`,
            Comment: comment,
            InvoiceEntries: invoiceEntries,
            Amount: 0, DiscountAmount: 0, VatAmount: 0,
            Date: new Date().toISOString(),
            Type: 25, IsElectronicInvoice: false, IsPrinted: false, UniqueReference: orderId,
          },
        }),
      });

      const data = await res.json();
      if (data?.Result?.Success) {
        const invoiceMsg = data.Result.Messages?.find((m: string) => m.includes("INFO_INVOICE_NUMBER"));
        const invoiceNumber = invoiceMsg ? invoiceMsg.split(";")[1] : orderId;
        console.log("[Regla] Invoice created:", invoiceNumber);
        return NextResponse.json({ orderId: invoiceNumber });
      }
      console.warn("[Regla] CreateInvoice failed:", data?.Result?.Messages ?? data?.Message);
    } catch (err) {
      console.warn("[Regla] Error, saving locally:", err);
    }
  }

  // ── Fallback: save order locally / to Netlify Blobs ────────────────────────
  const order: StoredOrder = {
    id: orderId,
    createdAt: new Date().toISOString(),
    customerName,
    customerPhone,
    pickupTime,
    deliveryType: deliveryType ?? "pickup",
    deliveryAddress: deliveryAddress ?? null,
    shippingCost: shippingCost ?? 0,
    total,
    items: items.map((i: { product: { id: string; name: string; price: number }; quantity: number }) => ({
      id: i.product.id, name: i.product.name, price: i.product.price, quantity: i.quantity,
    })),
    status: "pending",
    reglaError: true,
  };
  await saveOrder(order);
  console.log(`[Store] Order saved: ${orderId}`);

  return NextResponse.json({ orderId });
}
