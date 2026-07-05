// Bank-statement lines (Arion PSD2) → storage + booking to the ledger.
// Fetch stores lines deduped in acc.bank_transactions; booking posts one voucher per line
// with the correct double-entry by direction (mirrors lib/arion-book.ts for cards):
//   money IN  (amount >= 0): DEBIT bank account   / CREDIT contra
//   money OUT (amount <  0): DEBIT contra          / CREDIT bank account
import { db, query } from "@/lib/db";
import type { ArionAccountTx } from "@/lib/arion";
import { learnAccount } from "@/lib/tx-rules";

export interface StoredBankTx {
  id: string; entry_reference: string; booking_date: string | null; value_date: string | null;
  amount: number; currency: string | null; counterparty: string | null; remittance: string | null;
  reference: string | null; status: string; voucher_id: string | null;
  ledger_account: string | null; contra_account: string | null;
  series_code: string | null; voucher_number: string | null;
  suggested_contra: string | null;   // learned counterparty→lykill rule (acc.tx_account_rules)
}

/** Upsert fetched statement lines, deduped on (account_id, entry_reference). Existing rows keep
 *  their status/voucher; only a missing ledger_account is filled in. Returns insert/skip counts. */
export async function storeBankTransactions(
  txns: ArionAccountTx[], accountId: string, iban?: string, ledgerAccount?: string,
): Promise<{ stored: number; skipped: number }> {
  let stored = 0, skipped = 0;
  for (const t of txns) {
    if (!t.id) { skipped++; continue; }
    const res = await query<{ inserted: boolean }>(
      `insert into acc.bank_transactions
         (account_id, iban, entry_reference, booking_date, value_date, amount, currency, counterparty, remittance, reference, ledger_account)
       values ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10,$11)
       on conflict (account_id, entry_reference) do update
         set ledger_account = coalesce(acc.bank_transactions.ledger_account, excluded.ledger_account),
             iban = coalesce(acc.bank_transactions.iban, excluded.iban)
       returning (xmax = 0) as inserted`,
      [accountId, iban ?? null, t.id, t.bookingDate || null, t.valueDate || null, t.amount,
       t.currency ?? null, t.counterparty ?? null, t.remittance ?? null, t.reference ?? null, ledgerAccount ?? null],
    );
    if (res[0]?.inserted) stored++; else skipped++;
  }
  return { stored, skipped };
}

/** Persisted statement lines for an account (newest first), joined to any booked voucher. */
export function listBankTransactions(accountId: string, from?: string, to?: string) {
  return query<StoredBankTx>(
    `select bt.id, bt.entry_reference, bt.booking_date::text as booking_date, bt.value_date::text as value_date,
            bt.amount::float8 as amount, bt.currency, bt.counterparty, bt.remittance, bt.reference,
            bt.status, bt.voucher_id, bt.ledger_account, bt.contra_account,
            v.series_code, v.voucher_number::text as voucher_number,
            r.account_number as suggested_contra
     from acc.bank_transactions bt
     left join acc.vouchers v on v.id = bt.voucher_id
     left join acc.tx_account_rules r on r.match_key = lower(unaccent(trim(coalesce(bt.counterparty,''))))
     where bt.account_id = $1
       and ($2 = '' or bt.booking_date >= $2::date)
       and ($3 = '' or bt.booking_date <= $3::date)
     order by bt.booking_date desc nulls last, bt.created_at desc`,
    [accountId, from || "", to || ""],
  );
}

/** Book one stored statement line to the ledger. bankAccount = the bank lykill (e.g. 7830),
 *  contraAccount = the other side (e.g. 7600 customer payment, 9300 supplier payment).
 *  Concurrency-safe: the whole guard→post→mark runs in one transaction with the row locked
 *  (SELECT … FOR UPDATE) + a conditional UPDATE, so the same line can never be double-posted. */
export async function bookBankTransaction(
  bankTxId: string, bankAccount: string, contraAccount: string,
): Promise<{ ok: boolean; message?: string; voucher?: { series_code: string; voucher_number: string } }> {
  if (bankAccount === contraAccount) return { ok: false, message: "Bankalykill og mótlykill mega ekki vera sami." };
  const client = await db.connect();
  try {
    await client.query("begin");
    // Lock the row so two concurrent posts (double-click / retry) can't both pass the guard.
    const q = await client.query(
      `select entry_reference, booking_date::text as booking_date, amount::float8 as amount,
              counterparty, remittance, status, voucher_id
       from acc.bank_transactions where id = $1 for update`, [bankTxId]);
    const bt = q.rows[0];
    if (!bt) { await client.query("rollback"); return { ok: false, message: "Færsla fannst ekki." }; }
    if (bt.status === "booked" || bt.voucher_id) { await client.query("rollback"); return { ok: false, message: "Færsla er þegar bókuð." }; }
    const amount = Math.round(Math.abs(Number(bt.amount) || 0) * 100) / 100;
    if (!amount) { await client.query("rollback"); return { ok: false, message: "Upphæð er 0." }; }

    // Both ledger accounts must exist + be postable — clean error instead of a raw FK violation.
    const acct = await client.query(
      "select account_number from acc.accounts where account_number = any($1) and is_postable",
      [[bankAccount, contraAccount]]);
    const found = new Set(acct.rows.map((r: { account_number: string }) => r.account_number));
    if (!found.has(bankAccount) || !found.has(contraAccount)) {
      await client.query("rollback");
      return { ok: false, message: "Bankalykill eða mótlykill finnst ekki (eða er ekki færanlegur)." };
    }

    const moneyIn = Number(bt.amount) >= 0;
    const date = bt.booking_date || new Date().toISOString().slice(0, 10);
    const desc = (bt.counterparty || bt.remittance || "Bankafærsla").toString().slice(0, 140);
    const lines = moneyIn
      ? [{ account: bankAccount, debit: amount, credit: 0, vat_code: null, description: desc },
         { account: contraAccount, debit: 0, credit: amount, vat_code: null, description: desc }]
      : [{ account: contraAccount, debit: amount, credit: 0, vat_code: null, description: desc },
         { account: bankAccount, debit: 0, credit: amount, vat_code: null, description: desc }];
    const vType = moneyIn ? "receipt" : "payment";

    const v = await client.query(
      "select id, series_code, voucher_number::text as voucher_number from acc.post_voucher('JOURNAL',$1::date,$2,$3,$4,'bokhald',$5::jsonb)",
      [date, vType, `Banki: ${desc}`, bt.entry_reference, JSON.stringify(lines)],
    );
    // Conditional mark — second backstop against a race (only flips a still-unbooked row).
    const upd = await client.query(
      "update acc.bank_transactions set status='booked', voucher_id=$1, ledger_account=$2, contra_account=$3 where id=$4 and voucher_id is null",
      [v.rows[0].id, bankAccount, contraAccount, bankTxId]);
    if (upd.rowCount === 0) { await client.query("rollback"); return { ok: false, message: "Færsla var þegar bókuð." }; }
    await client.query("commit");
    await learnAccount(bt.counterparty, contraAccount); // kerfið lærir hvað hver mótaðili fer á
    return { ok: true, voucher: { series_code: v.rows[0].series_code, voucher_number: v.rows[0].voucher_number } };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* */ }
    console.error("bookBankTransaction failed:", e);
    return { ok: false, message: "Bókun mistókst. Athugaðu lykla og reyndu aftur." };
  } finally {
    client.release();
  }
}
