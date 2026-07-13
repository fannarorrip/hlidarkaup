import { NextResponse } from "next/server";
import { getVoucher } from "@/lib/accounting-queries";
import { renderVoucherPdf } from "@/lib/pdf/voucher";

// A4 PDF of any fylgiskjal (voucher) — the double-entry lines, register, supplier, etc.
// Works for every voucher type. Gated stjornandi/bokari via middleware (/api/fylgiskjol).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getVoucher(id);
  if (!data) return NextResponse.json({ error: "Fylgiskjal fannst ekki" }, { status: 404 });

  const v = data.voucher;
  const number = `${v.series_code}-${String(v.voucher_number).padStart(6, "0")}`;
  const pdf = await renderVoucherPdf({ voucher: v, lines: data.lines });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="fylgiskjal-${number}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
