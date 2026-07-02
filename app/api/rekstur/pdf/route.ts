import { NextRequest, NextResponse } from "next/server";
import { getIncomeStatementPeriod } from "@/lib/accounting-queries";
import { buildIncomeStatement } from "@/lib/income-statement";
import { renderIncomeStatementPdf } from "@/lib/pdf/income-statement-pdf";

// Rekstrarreikningur → PDF. Middleware-gated (stjornandi/bokari).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const from = searchParams.get("from") || `${now.getFullYear()}-01-01`;
  const to = searchParams.get("to") || now.toISOString().slice(0, 10);

  const is = buildIncomeStatement(await getIncomeStatementPeriod(from, to));
  const pdf = await renderIncomeStatementPdf(is, from, to);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="rekstrarreikningur-${from}_${to}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
