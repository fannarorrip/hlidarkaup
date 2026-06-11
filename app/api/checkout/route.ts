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

async function reglaPost(endpoint: string, body: object) {
  const res = await fetch(`${REGLA_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Regla ${endpoint} HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
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

      // Fetch full product objects from Regla so all required fields are present
      const productObjects = await Promise.all(
        items.map(async (item: { product: { id: string }; quantity: number }) => {
          const data = await reglaPost("GetProduct", { token, productNumber: item.product.id });
          if (!data?.Returned) throw new Error(`Product ${item.product.id} not found in Regla`);
          return { product: data.Returned, quantity: item.quantity };
        })
      );

      // Block overselling: Regla lets stock go negative, so enforce it here.
      const shortItems = productObjects.filter(
        ({ product, quantity }) => product.IsInStockControl && (product.StockQuantity ?? 0) < quantity,
      );
      if (shortItems.length > 0) {
        const names = shortItems
          .map(({ product }) => `${product.Name} (${Math.max(0, Math.floor(product.StockQuantity ?? 0))} eftir)`)
          .join(", ");
        return NextResponse.json(
          { error: `Því miður er ekki nóg til á lager af: ${names}. Minnkaðu magnið eða fjarlægðu vöruna úr körfunni.` },
          { status: 409 },
        );
      }

      const invoiceEntries = productObjects.map(({ product, quantity }) => ({
        Product: product,
        Quantity: quantity,
        Text: product.Name,
      }));

      if (deliveryType === "delivery" && shippingCost > 0) {
        // Shipping as a plain text entry — no product lookup needed
        const shippingProduct = await reglaPost("GetProduct", { token, productNumber: "SENDING" }).catch(() => null);
        if (shippingProduct?.Returned) {
          invoiceEntries.push({ Product: { ...shippingProduct.Returned, UnitPrice: shippingCost }, Quantity: 1, Text: `Sending: ${deliveryAddress}` });
        }
      }

      // Regla requires: valid kennitala as CustomerNumber, full PaymentMethod
      // object and PostalCode — omitting any of these crashes their API (HTTP 500).
      const data = await reglaPost("CreateInvoice", {
        token,
        invoice: {
          Customer: {
            CustomerNumber: process.env.REGLA_WEB_CUSTOMER_KENNITALA ?? "",
            Name: customerName,
            Phone1: customerPhone,
            PostalCode: { Value: "550", Name: "Sauðárkróki" },
            PaymentMethod: { ID: 2848, Name: "Vefverslun", NameEnglish: "Webshop", IssuerID: 0 },
          },
          Concerning: `Netpöntun – ${customerName}`,
          Comment: comment,
          InvoiceEntries: invoiceEntries,
          UniqueReference: orderId,
        },
      });

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

  // ── Fallback: save locally ────────────────────────────────────────────────
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
  try {
    await saveOrder(order);
  } catch (err) {
    console.warn("[Store] Could not save order:", err);
  }

  return NextResponse.json({ orderId });
}
