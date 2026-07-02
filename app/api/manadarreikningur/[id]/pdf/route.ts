import { NextRequest, NextResponse } from "next/server";
import { getBillingInvoice } from "@/lib/month-end";
import { renderStatementInvoicePdf, type StatementTrip } from "@/lib/pdf/statement-invoice";

// Consolidated month-end invoice (yfirlitsreikningur) PDF. Middleware-gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await getBillingInvoice(id);
  if (!inv) return NextResponse.json({ error: "Reikningur fannst ekki" }, { status: 404 });
  const trips = (Array.isArray(inv.detail) ? inv.detail : []) as StatementTrip[];
  const pdf = await renderStatementInvoicePdf({
    invoice_number: inv.invoice_number, customer_name: inv.customer_name, kennitala: inv.kennitala,
    period: inv.period, total: Math.round(Number(inv.total)), trips,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${inv.invoice_number}.pdf"`, "cache-control": "no-store" },
  });
}
