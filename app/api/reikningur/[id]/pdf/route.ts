import { NextRequest, NextResponse } from "next/server";
import { getSaleReceipt } from "@/lib/accounting-queries";
import { renderInvoicePdf } from "@/lib/pdf/invoice";

// A4 invoice/fylgiskjal PDF for any sale (kassi, sjálfsafgreiðsla, vefverslun, eldhús).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getSaleReceipt(id);
  if (!data) return NextResponse.json({ error: "Reikningur fannst ekki" }, { status: 404 });

  const number = `${data.voucher.series_code}-${String(data.voucher.voucher_number).padStart(6, "0")}`;
  try {
    const pdf = await renderInvoicePdf(data);
    return new NextResponse(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="reikningur-${number}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[reikningur pdf] render failed:", err);
    return NextResponse.json({ error: "Villa við gerð PDF" }, { status: 500 });
  }
}
