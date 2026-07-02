// Pure grouping/sign logic for the trial balance (Prófjöfnuður). No pg — usable
// from both the server page and the PDF route.
import type { TBRawRow } from "@/lib/accounting-queries";

export interface TBAccount {
  account_number: string; name: string; rsk_code: string | null; vatLabel: string | null;
  opening: number; period_debit: number; period_credit: number; movement: number; closing: number;
}
export interface TBGroup {
  type: string; label: string; accounts: TBAccount[]; count: number;
  opening: number; period_debit: number; period_credit: number; movement: number; closing: number;
}
export interface TBSummary { debet: number; kredit: number; diff: number; }
export interface TrialBalance {
  groups: TBGroup[]; count: number;
  opening: TBSummary; period: TBSummary; closing: TBSummary;
}

const NATURAL_DEBIT = new Set(["eign", "gjold"]); // debit-natural; rest are credit-natural
export const TYPE_LABEL: Record<string, string> = { eign: "Eignir", skuld: "Skuldir", eigid_fe: "Eigið fé", tekjur: "Tekjur", gjold: "Gjöld" };
// Display order: tekjur first, then gjöld, then the balance-sheet groups (user preference).
// Accounts within each group are sorted ascending by account number ("first number on top").
const TYPE_ORDER = ["tekjur", "gjold", "eign", "skuld", "eigid_fe"];

function vatLabel(name: string): string | null {
  if (/innskatt/i.test(name)) return "Innskattur";
  if (/[úu]tskatt/i.test(name)) return "Útskattur";
  return null;
}
const sumBy = (arr: TBAccount[], k: keyof TBAccount) => arr.reduce((s, a) => s + Number(a[k] || 0), 0);

export function buildTrialBalance(rows: TBRawRow[]): TrialBalance {
  const byType = new Map<string, TBAccount[]>();
  let oDeb = 0, oCred = 0, pDeb = 0, pCred = 0;
  for (const r of rows) {
    const od = Number(r.opening_debit), oc = Number(r.opening_credit), pd = Number(r.period_debit), pc = Number(r.period_credit);
    const deb = NATURAL_DEBIT.has(r.account_type);
    const opening = deb ? od - oc : oc - od;
    const movement = deb ? pd - pc : pc - pd;
    const acc: TBAccount = {
      account_number: r.account_number, name: r.name, rsk_code: r.rsk_code, vatLabel: vatLabel(r.name),
      opening, period_debit: pd, period_credit: pc, movement, closing: opening + movement,
    };
    if (!byType.has(r.account_type)) byType.set(r.account_type, []);
    byType.get(r.account_type)!.push(acc);
    oDeb += od; oCred += oc; pDeb += pd; pCred += pc;
  }
  const groups: TBGroup[] = [];
  for (const type of TYPE_ORDER) {
    const accs = byType.get(type);
    if (!accs || !accs.length) continue;
    groups.push({
      type, label: TYPE_LABEL[type] ?? type, accounts: accs, count: accs.length,
      opening: sumBy(accs, "opening"), period_debit: sumBy(accs, "period_debit"),
      period_credit: sumBy(accs, "period_credit"), movement: sumBy(accs, "movement"), closing: sumBy(accs, "closing"),
    });
  }
  const mk = (d: number, c: number): TBSummary => ({ debet: d, kredit: c, diff: d - c });
  return { groups, count: rows.length, opening: mk(oDeb, oCred), period: mk(pDeb, pCred), closing: mk(oDeb + pDeb, oCred + pCred) };
}
