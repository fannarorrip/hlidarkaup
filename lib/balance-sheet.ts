// Pure structure/sign logic for the Efnahagsreikningur (balance sheet). No pg — shared by the
// server page, the PDF route and the Excel route. Assets = debit-natural; liabilities + equity are
// credit-natural (shown positive). Net profit through the as-of date flows into equity.
import type { StatementRow } from "@/lib/accounting-queries";

export interface BSRow { account_number: string; name: string; val: number }
export interface BalanceSheet {
  assets: BSRow[]; assetTotal: number;
  liab: BSRow[]; liabTotal: number;
  equity: BSRow[]; equityBase: number;
  result: number;        // afkoma (retained earnings through as-of)
  equityTotal: number;   // equityBase + result
  rightTotal: number;    // liabTotal + equityTotal
  balanced: boolean;
}

type BSInput = StatementRow & { balance: string };

export function buildBalanceSheet(bs: BSInput[], is: StatementRow[]): BalanceSheet {
  const assets = bs.filter((r) => r.account_type === "eign").map((r) => ({ account_number: r.account_number, name: r.name, val: Number(r.balance) })).filter((r) => r.val !== 0);
  const liab = bs.filter((r) => r.account_type === "skuld").map((r) => ({ account_number: r.account_number, name: r.name, val: -Number(r.balance) })).filter((r) => r.val !== 0);
  const equity = bs.filter((r) => r.account_type === "eigid_fe").map((r) => ({ account_number: r.account_number, name: r.name, val: -Number(r.balance) })).filter((r) => r.val !== 0);

  const revTotal = is.filter((r) => r.account_type === "tekjur").reduce((s, r) => s + Number(r.amount), 0);
  const expTotal = is.filter((r) => r.account_type === "gjold").reduce((s, r) => s + Number(r.amount), 0);
  const result = revTotal - expTotal;

  const assetTotal = assets.reduce((s, r) => s + r.val, 0);
  const liabTotal = liab.reduce((s, r) => s + r.val, 0);
  const equityBase = equity.reduce((s, r) => s + r.val, 0);
  const equityTotal = equityBase + result;
  const rightTotal = liabTotal + equityTotal;
  return { assets, assetTotal, liab, liabTotal, equity, equityBase, result, equityTotal, rightTotal, balanced: Math.round(assetTotal) === Math.round(rightTotal) };
}
