import { NextRequest, NextResponse } from "next/server";
import { getBalanceSheetAsOf, getRetainedThroughAsOf } from "@/lib/accounting-queries";
import { buildBalanceSheet } from "@/lib/balance-sheet";
import { renderBalanceSheetPdf } from "@/lib/pdf/balance-sheet-pdf";

// Efnahagsreikningur → PDF. Middleware-gated (stjornandi/bokari).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asOf = searchParams.get("asOf") || new Date().toISOString().slice(0, 10);

  const [bs, is] = await Promise.all([getBalanceSheetAsOf(asOf), getRetainedThroughAsOf(asOf)]);
  const sheet = buildBalanceSheet(bs, is);
  const pdf = await renderBalanceSheetPdf(sheet, asOf);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="efnahagsreikningur-${asOf}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
