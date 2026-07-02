// Pure grouping/sign logic for the Rekstrarreikningur (income statement). No pg — shared by the
// server page, the PDF route and the Excel route.
import type { StatementRow } from "@/lib/accounting-queries";

export interface ISRow { account_number: string; name: string; amount: number }
export interface IncomeStatement {
  revenue: ISRow[]; revTotal: number;
  expense: ISRow[]; expTotal: number;
  operatingResult: number;
  financial: ISRow[]; finNet: number;      // amounts already signed (income +, expense −)
  tax: ISRow[]; taxTotal: number;
  profitBeforeTax: number;
  result: number;
}

// Account-number bands for income-statement structure.
const band = (n: string) => Number(n);
const isOperating = (n: string) => band(n) < 6000;
const isFinancial = (n: string) => band(n) >= 6000 && band(n) < 6600; // fjármunatekjur/-gjöld
const isTax = (n: string) => band(n) >= 6600 && band(n) < 6700;       // tekjuskattur / opinber gjöld

const toRow = (r: StatementRow): ISRow => ({ account_number: r.account_number, name: r.name, amount: Number(r.amount) });
const sum = (a: ISRow[]) => a.reduce((s, r) => s + r.amount, 0);

export function buildIncomeStatement(rows: StatementRow[]): IncomeStatement {
  const nz = rows.filter((r) => Number(r.amount) !== 0);
  const revenue = nz.filter((r) => r.account_type === "tekjur" && isOperating(r.account_number)).map(toRow);
  const expense = nz.filter((r) => r.account_type === "gjold" && isOperating(r.account_number)).map(toRow);
  const financial = nz.filter((r) => isFinancial(r.account_number))
    .map((r) => ({ account_number: r.account_number, name: r.name, amount: (r.account_type === "tekjur" ? 1 : -1) * Number(r.amount) }));
  const tax = nz.filter((r) => isTax(r.account_number)).map(toRow);

  const revTotal = sum(revenue);
  const expTotal = sum(expense);
  const operatingResult = revTotal - expTotal;
  const finNet = sum(financial);
  const taxTotal = sum(tax);
  return {
    revenue, revTotal, expense, expTotal, operatingResult,
    financial, finNet, tax, taxTotal,
    profitBeforeTax: operatingResult + finNet,
    result: operatingResult + finNet - taxTotal,
  };
}
