import { NextRequest, NextResponse } from "next/server";
import { getIncomeStatementPeriod, getBalanceSheetAsOf, getRetainedThroughAsOf } from "@/lib/accounting-queries";
import { buildIncomeStatement } from "@/lib/income-statement";
import { buildBalanceSheet } from "@/lib/balance-sheet";
import { buildAnnualReport } from "@/lib/annual-report";
import { renderAnnualReportPdf } from "@/lib/pdf/annual-report-pdf";

// Ársreikningur → PDF (forsíða + rekstrar- og efnahagsreikningur, samanburður við fyrra ár).
// Middleware-gated (stjornandi/bokari).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const prev = year - 1;

  const [isC, isP, bsC, retC, bsP, retP] = await Promise.all([
    getIncomeStatementPeriod(`${year}-01-01`, `${year}-12-31`),
    getIncomeStatementPeriod(`${prev}-01-01`, `${prev}-12-31`),
    getBalanceSheetAsOf(`${year}-12-31`),
    getRetainedThroughAsOf(`${year}-12-31`),
    getBalanceSheetAsOf(`${prev}-12-31`),
    getRetainedThroughAsOf(`${prev}-12-31`),
  ]);

  const report = buildAnnualReport(
    year,
    buildIncomeStatement(isC), buildIncomeStatement(isP),
    buildBalanceSheet(bsC, retC), buildBalanceSheet(bsP, retP),
  );
  const pdf = await renderAnnualReportPdf(report);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="arsreikningur-${year}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
