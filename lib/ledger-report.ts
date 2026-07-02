// Pure builder for the Aðalbók/Hreyfingar per-account report. Groups period entries by
// account, carries an opening balance (before `from`), and computes a running balance.
// No pg — shared by the server page and the PDF route.
import type { LedgerEntryRow, LedgerOpeningRow } from "@/lib/accounting-queries";

const NATURAL_DEBIT = new Set(["eign", "gjold"]); // debit-natural; rest credit-natural

export interface LedgerLine {
  voucher_id: string; series_code: string; voucher_number: string; voucher_date: string;
  debit: number; credit: number; description: string | null; running: number;
}
export interface LedgerAccount {
  account_number: string; name: string; account_type: string;
  opening: number; total_debit: number; total_credit: number; closing: number;
  lines: LedgerLine[];
}

export function buildLedger(opening: LedgerOpeningRow[], entries: LedgerEntryRow[]): LedgerAccount[] {
  const openMap = new Map<string, number>();
  for (const o of opening) {
    const deb = NATURAL_DEBIT.has(o.account_type);
    const od = Number(o.opening_debit), oc = Number(o.opening_credit);
    openMap.set(o.account_number, deb ? od - oc : oc - od);
  }

  const accs = new Map<string, LedgerAccount>();
  for (const e of entries) {
    let acc = accs.get(e.account_number);
    if (!acc) {
      const opening0 = openMap.get(e.account_number) ?? 0;
      acc = {
        account_number: e.account_number, name: e.name, account_type: e.account_type,
        opening: opening0, total_debit: 0, total_credit: 0, closing: opening0, lines: [],
      };
      accs.set(e.account_number, acc);
    }
    const deb = NATURAL_DEBIT.has(e.account_type);
    const d = Number(e.debit), c = Number(e.credit);
    acc.closing += deb ? d - c : c - d;
    acc.total_debit += d; acc.total_credit += c;
    acc.lines.push({
      voucher_id: e.voucher_id, series_code: e.series_code, voucher_number: e.voucher_number,
      voucher_date: e.voucher_date, debit: d, credit: c, description: e.description, running: acc.closing,
    });
  }
  return [...accs.values()]; // already ordered by account_number (query order)
}
