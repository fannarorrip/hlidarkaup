// Samstillingar: editable defaults for the bankatenging module. Single-row acc.bank_settings.
import { query } from "@/lib/db";

export interface BankSettings {
  card_liability_account: string;
  card_expense_account: string | null;
  default_bank_ledger: string | null;
  statement_contra_in: string | null;
  statement_contra_out: string | null;
  auto_sync: boolean;
}

const DEFAULTS: BankSettings = {
  card_liability_account: "9310", card_expense_account: null, default_bank_ledger: null,
  statement_contra_in: null, statement_contra_out: null, auto_sync: false,
};

export async function getBankSettings(): Promise<BankSettings> {
  const r = await query<BankSettings>(
    `select card_liability_account, card_expense_account, default_bank_ledger,
            statement_contra_in, statement_contra_out, auto_sync
     from acc.bank_settings where id = 1`);
  return r[0] ?? { ...DEFAULTS };
}

export class SettingsValidationError extends Error {}

export interface SaveSettingsInput {
  card_liability_account?: string; card_expense_account?: string; default_bank_ledger?: string;
  statement_contra_in?: string; statement_contra_out?: string; auto_sync?: boolean;
}

export async function saveBankSettings(s: SaveSettingsInput): Promise<void> {
  const clean = (v?: string) => (v && v.trim() ? v.trim() : null);
  // Liability is required (the UI dropdown blocks empty). A blank falls back to 9310 rather than erroring.
  const liability = clean(s.card_liability_account) || "9310";
  const accounts = [liability, clean(s.card_expense_account), clean(s.default_bank_ledger), clean(s.statement_contra_in), clean(s.statement_contra_out)].filter(Boolean) as string[];
  if (accounts.length) {
    const found = new Set((await query<{ account_number: string }>(
      `select account_number from acc.accounts where account_number = any($1) and is_postable`, [accounts])).map((r) => r.account_number));
    const missing = accounts.filter((a) => !found.has(a));
    if (missing.length) throw new SettingsValidationError(`Lyklar finnast ekki (eða ekki færanlegir): ${missing.join(", ")}`);
  }
  await query(
    `update acc.bank_settings set card_liability_account=$1, card_expense_account=$2, default_bank_ledger=$3,
            statement_contra_in=$4, statement_contra_out=$5, auto_sync=$6, updated_at=now() where id = 1`,
    [liability, clean(s.card_expense_account), clean(s.default_bank_ledger), clean(s.statement_contra_in), clean(s.statement_contra_out), !!s.auto_sync]);
}

/** All postable accounts for the settings dropdowns. */
export const getPostableAccounts = () =>
  query<{ account_number: string; name: string }>(
    `select account_number, name from acc.accounts where is_postable order by account_number`);
