// Ársreikningur: composes the income statement + balance sheet for a year with the prior year as a
// comparison column (standard for annual accounts). Pure — reuses the existing statement builders.
import type { IncomeStatement, ISRow } from "@/lib/income-statement";
import type { BalanceSheet, BSRow } from "@/lib/balance-sheet";

export interface CmpRow { account_number: string; name: string; amount: number; prev: number }
export interface Pair { cur: number; prev: number }

function merge(cur: { account_number: string; name: string; amount: number }[], prev: { account_number: string; name: string; amount: number }[]): CmpRow[] {
  const map = new Map<string, CmpRow>();
  for (const r of cur) map.set(r.account_number, { account_number: r.account_number, name: r.name, amount: r.amount, prev: 0 });
  for (const r of prev) {
    const e = map.get(r.account_number);
    if (e) e.prev = r.amount;
    else map.set(r.account_number, { account_number: r.account_number, name: r.name, amount: 0, prev: r.amount });
  }
  return [...map.values()].filter((r) => r.amount !== 0 || r.prev !== 0).sort((a, b) => a.account_number.localeCompare(b.account_number));
}
const pair = (cur: number, prev: number): Pair => ({ cur, prev });

export interface AnnualIncome {
  revenue: CmpRow[]; revTotal: Pair;
  expense: CmpRow[]; expTotal: Pair;
  operatingResult: Pair;
  financial: CmpRow[]; finNet: Pair;
  tax: CmpRow[]; taxTotal: Pair;
  result: Pair;
}
export interface AnnualBalance {
  assets: CmpRow[]; assetTotal: Pair;
  liab: CmpRow[]; liabTotal: Pair;
  equity: CmpRow[]; result: Pair; rightTotal: Pair;
  balanced: boolean; balancedPrev: boolean;
}
export interface AnnualReport { year: number; income: AnnualIncome; balance: AnnualBalance }

export function buildAnnualReport(
  year: number, is: IncomeStatement, isPrev: IncomeStatement, bs: BalanceSheet, bsPrev: BalanceSheet,
): AnnualReport {
  const asRow = (r: ISRow | BSRow): { account_number: string; name: string; amount: number } =>
    ({ account_number: r.account_number, name: r.name, amount: "amount" in r ? r.amount : (r as BSRow).val });

  const income: AnnualIncome = {
    revenue: merge(is.revenue.map(asRow), isPrev.revenue.map(asRow)), revTotal: pair(is.revTotal, isPrev.revTotal),
    expense: merge(is.expense.map(asRow), isPrev.expense.map(asRow)), expTotal: pair(is.expTotal, isPrev.expTotal),
    operatingResult: pair(is.operatingResult, isPrev.operatingResult),
    financial: merge(is.financial.map(asRow), isPrev.financial.map(asRow)), finNet: pair(is.finNet, isPrev.finNet),
    tax: merge(is.tax.map(asRow), isPrev.tax.map(asRow)), taxTotal: pair(is.taxTotal, isPrev.taxTotal),
    result: pair(is.result, isPrev.result),
  };
  const balance: AnnualBalance = {
    assets: merge(bs.assets.map(asRow), bsPrev.assets.map(asRow)), assetTotal: pair(bs.assetTotal, bsPrev.assetTotal),
    liab: merge(bs.liab.map(asRow), bsPrev.liab.map(asRow)), liabTotal: pair(bs.liabTotal, bsPrev.liabTotal),
    equity: merge(bs.equity.map(asRow), bsPrev.equity.map(asRow)), result: pair(bs.result, bsPrev.result),
    rightTotal: pair(bs.rightTotal, bsPrev.rightTotal), balanced: bs.balanced, balancedPrev: bsPrev.balanced,
  };
  return { year, income, balance };
}
