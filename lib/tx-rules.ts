// Learned counterparty→lykill rules for transaction categorization (acc.tx_account_rules).
// Key normalization happens in SQL (lower + unaccent + trim) so suggestions and learning
// always agree, whatever the JS runtime's idea of Icelandic case folding is.
import { query } from "@/lib/db";

/** Batch lookup: raw merchant/counterparty names → learned account numbers.
 *  Returns a map keyed by the TRIMMED original name. */
export async function suggestAccounts(names: (string | null | undefined)[]): Promise<Record<string, string>> {
  const uniq = [...new Set(names.map((s) => (s || "").trim()).filter(Boolean))];
  if (!uniq.length) return {};
  try {
    const rows = await query<{ name: string; account_number: string }>(
      `select n.name, r.account_number
         from unnest($1::text[]) as n(name)
         join acc.tx_account_rules r on r.match_key = lower(unaccent(trim(n.name)))`,
      [uniq],
    );
    const map: Record<string, string> = {};
    for (const r of rows) map[r.name] = r.account_number;
    return map;
  } catch {
    return {}; // suggestions are a convenience — never break the listing
  }
}

/** Remember (or update) a counterparty→account mapping. Best-effort — never throws. */
export async function learnAccount(name: string | null | undefined, account: string): Promise<void> {
  const n = (name || "").trim();
  const a = (account || "").trim();
  if (!n || !a) return;
  try {
    await query(
      `insert into acc.tx_account_rules (match_key, account_number)
       values (lower(unaccent(trim($1))), $2)
       on conflict (match_key) do update
         set account_number = excluded.account_number,
             hits = acc.tx_account_rules.hits + 1,
             updated_at = now()`,
      [n, a],
    );
  } catch { /* learning must never break a booking */ }
}
