import { NextRequest, NextResponse } from "next/server";
import { getReglaToken, reglaPost } from "@/lib/regla";

// Payment method booked for kiosk card sales (76 = Óskilgreint kreditkort).
const KASSI_PAYMENT_METHOD_ID = parseInt(process.env.KASSI_PAYMENT_METHOD_ID ?? "76", 10);

/** Result of a card payment at the physical terminal.
 *  Mocked until the Teya/Verifone terminal is integrated — then these fields
 *  come from the terminal response and flow into Regla's PaymentPartition. */
interface TerminalPayment {
  approved: boolean;
  stan?: string;          // SystemTraceAuditNumber from terminal
  last4?: string;         // C4
  processor?: string;     // e.g. "Teya"
  verification?: string;  // CardholderVerificationMethod
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const items: { id: string; quantity: number }[] = body.items ?? [];
  const payment: TerminalPayment = body.payment ?? { approved: false };

  if (!items.length) return NextResponse.json({ error: "Karfan er tóm" }, { status: 400 });
  if (!payment.approved) return NextResponse.json({ error: "Greiðsla ekki staðfest" }, { status: 402 });

  try {
    const token = await getReglaToken();

    // Full product objects (required by CreateInvoice) + stock guard
    const products = await Promise.all(
      items.map(async ({ id, quantity }) => {
        const data = await reglaPost("GetProduct", { token, productNumber: id });
        if (!data?.Returned) throw new Error(`Vara ${id} fannst ekki`);
        return { product: data.Returned, quantity };
      }),
    );

    const short = products.filter(
      ({ product, quantity }) => product.IsInStockControl && (product.StockQuantity ?? 0) < quantity,
    );
    if (short.length > 0) {
      const names = short.map(({ product }) => product.Name).join(", ");
      return NextResponse.json({ error: `Ekki til á lager: ${names}` }, { status: 409 });
    }

    const orderId = `KASSI-${Date.now()}`;
    const data = await reglaPost("CreateInvoice", {
      token,
      invoice: {
        ApplicationName: "Hlíðarkaup Kassi",
        ApplicationVersion: "1.0",
        Customer: {
          CustomerNumber: process.env.REGLA_WEB_CUSTOMER_KENNITALA ?? "",
          Name: "Sjálfsafgreiðsla",
          PostalCode: { Value: "550", Name: "Sauðárkróki" },
          PaymentMethod: { ID: KASSI_PAYMENT_METHOD_ID, Name: "", NameEnglish: "", IssuerID: 0 },
        },
        Concerning: "Sjálfsafgreiðslukassi",
        Comment: [
          `Kassasala ${orderId}`,
          payment.processor ? `Posi: ${payment.processor}` : null,
          payment.stan ? `STAN: ${payment.stan}` : null,
          payment.last4 ? `Kort: **** ${payment.last4}` : null,
        ].filter(Boolean).join(" | "),
        InvoiceEntries: products.map(({ product, quantity }) => ({
          Product: product,
          Quantity: quantity,
          Text: product.Name,
        })),
        UniqueReference: orderId,
      },
    });

    if (!data?.Result?.Success) {
      console.error("[Kassi] CreateInvoice failed:", data?.Result?.Messages);
      return NextResponse.json({ error: "Ekki tókst að skrá söluna" }, { status: 500 });
    }

    const invoiceMsg = data.Result.Messages?.find((m: string) => m.includes("INFO_INVOICE_NUMBER"));
    const invoiceNumber = invoiceMsg ? invoiceMsg.split(";")[1] : orderId;
    return NextResponse.json({ invoiceNumber });
  } catch (err) {
    console.error("[Kassi] checkout error:", err);
    return NextResponse.json({ error: "Villa við að skrá söluna" }, { status: 500 });
  }
}
