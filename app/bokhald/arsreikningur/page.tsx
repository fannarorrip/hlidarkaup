import { getIncomeStatementPeriod, getBalanceSheetAsOf, getRetainedThroughAsOf } from "@/lib/accounting-queries";
import { buildIncomeStatement } from "@/lib/income-statement";
import { buildBalanceSheet } from "@/lib/balance-sheet";
import { buildAnnualReport } from "@/lib/annual-report";
import ArsreikningurView from "./ArsreikningurView";

export const dynamic = "force-dynamic";

export default async function ArsreikningurPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
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

  return <ArsreikningurView report={report} />;
}
