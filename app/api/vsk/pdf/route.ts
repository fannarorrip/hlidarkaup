import { NextRequest, NextResponse } from "next/server";
import { getVatVeltaByRate, getVatAccountsPeriod } from "@/lib/accounting-queries";
import { buildVatReport } from "@/lib/vat-report";
import { renderVatReportPdf } from "@/lib/pdf/vat-report-pdf";
import { vatPeriods, currentVatPeriod } from "@/lib/vat-periods";

// Virðisaukaskattsskýrsla → PDF. Middleware-gated (stjornandi/bokari).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const year = Number(searchParams.get("year")) || now.getFullYear();
  const period = Number(searchParams.get("period")) || currentVatPeriod(year, now.getMonth() + 1);
  const periods = vatPeriods(year);
  const p = periods.find((x) => x.key === period) ?? periods[0];

  const [velta, accts] = await Promise.all([getVatVeltaByRate(p.from, p.to), getVatAccountsPeriod(p.from, p.to)]);
  const rep = buildVatReport(velta, accts);
  const pdf = await renderVatReportPdf(rep, { label: p.label, from: p.from, to: p.to, due: p.due });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="vsk-${year}-${period}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
