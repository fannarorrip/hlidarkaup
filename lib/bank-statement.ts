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
  matched_series: string | null; matched_number: string | null;  // parað fylgiskjal (þegar bókað annars staðar)
  // Pörunartillaga: fyrirliggjandi fylgiskjal á sama bankalykli með sömu upphæð ±5 daga —
  // t.d. innheimtukrafa sem greiddist (sync bókaði) eða millifærslusala af kassa.
  sug_voucher_id: string | null; sug_series: string | null; sug_number: string | null;
  sug_date: string | null; sug_desc: string | null; sug_candidates: number | null;
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

/** Persisted statement lines for an account (newest first), joined to any booked voucher,
 *  the learned/pattern contra suggestion AND a match suggestion: an EXISTING posted voucher
 *  on the same bank lykill with the exact amount within ±5 days that no statement line owns
 *  yet — the „þegar bókað annars staðar" case (claims sync, millifærslusala af kassa). */
export function listBankTransactions(accountId: string, from?: string, to?: string) {
  return query<StoredBankTx>(
    `select bt.id, bt.entry_reference, bt.booking_date::text as booking_date, bt.value_date::text as value_date,
            bt.amount::float8 as amount, bt.currency, bt.counterparty, bt.remittance, bt.reference,
            bt.status, bt.voucher_id, bt.ledger_account, bt.contra_account,
            v.series_code, v.voucher_number::text as voucher_number,
            mv.series_code as matched_series, mv.voucher_number::text as matched_number,
            coalesce(r.account_number,
              case
                -- Straumur/kortauppgjör INN: tæmir biðlykil korta (7716) — afgangurinn þar er þóknunin.
                when bt.amount >= 0 and (coalesce(bt.counterparty,'') || ' ' || coalesce(bt.remittance,'')) ~* 'straumur|adyen|rapyd|saltpay|valitor|teya' then '7716'
                -- Bankakostnaður ÚT: FIT, þjónustu- og færslugjöld.
                when bt.amount < 0 and (coalesce(bt.counterparty,'') || ' ' || coalesce(bt.remittance,'')) ~* 'fit.?kostn|tjónustugjald|þjónustugjald|færslugjald|faerslugjald|seðilgjald|sedilgjald|tilkynningagjald' then '6210'
              end) as suggested_contra,
            s.voucher_id as sug_voucher_id, s.series_code as sug_series, s.voucher_number as sug_number,
            s.voucher_date as sug_date, s.description as sug_desc, s.candidates as sug_candidates
     from acc.bank_transactions bt
     left join acc.vouchers v on v.id = bt.voucher_id
     left join acc.vouchers mv on mv.id = bt.matched_voucher_id
     left join acc.tx_account_rules r on r.match_key = lower(unaccent(trim(coalesce(bt.counterparty,''))))
     left join lateral (
       select t.voucher_id, t.series_code, t.voucher_number, t.voucher_date, t.description, t.candidates
       from (
         select vv.id as voucher_id, vv.series_code, vv.voucher_number::text as voucher_number,
                vv.voucher_date::text as voucher_date, vv.description,
                count(*) over ()::int as candidates,
                row_number() over (order by abs(vv.voucher_date - bt.booking_date), vv.voucher_number desc) as rn
         from acc.ledger_entries le
         join acc.vouchers vv on vv.id = le.voucher_id and vv.status = 'posted'
         where bt.status = 'unmatched' and bt.booking_date is not null and bt.ledger_account is not null
           and le.account_number = bt.ledger_account
           and ((bt.amount >= 0 and le.debit = bt.amount) or (bt.amount < 0 and le.credit = -bt.amount))
           and abs(vv.voucher_date - bt.booking_date) <= 5
           and not exists (select 1 from acc.bank_transactions bx
                           where bx.voucher_id = vv.id or bx.matched_voucher_id = vv.id)
       ) t where t.rn = 1
     ) s on true
     where bt.account_id = $1
       and ($2 = '' or bt.booking_date >= $2::date)
       and ($3 = '' or bt.booking_date <= $3::date)
     order by bt.booking_date desc nulls last, bt.created_at desc`,
    [accountId, from || "", to || ""],
  );
}

/** Para yfirlitslínu við FYRIRLIGGJANDI fylgiskjal (þegar bókað annars staðar) — engin ný bókun.
 *  Sannreynt server-megin: fylgiskjalið er bókað, ber nákvæmlega sömu upphæð á sama bankalykli
 *  í rétta átt, og hvorki línan né fylgiskjalið eru þegar tengd öðru. */
export async function matchBankTransaction(
  bankTxId: string, voucherId: string,
): Promise<{ ok: boolean; message?: string; voucher?: { series_code: string; voucher_number: string } }> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const q = await client.query(
      `select status, voucher_id, matched_voucher_id, amount::text as amount, ledger_account
       from acc.bank_transactions where id = $1 for update`, [bankTxId]);
    const bt = q.rows[0];
    if (!bt) { await client.query("rollback"); return { ok: false, message: "Færsla fannst ekki." }; }
    if (bt.status !== "unmatched" || bt.voucher_id || bt.matched_voucher_id) {
      await client.query("rollback"); return { ok: false, message: "Færslan er þegar bókuð eða pöruð." };
    }
    if (!bt.ledger_account) { await client.query("rollback"); return { ok: false, message: "Færslan hefur engan bankalykil." }; }
    const v = await client.query(
      `select vv.series_code, vv.voucher_number::text as voucher_number
       from acc.vouchers vv
       join acc.ledger_entries le on le.voucher_id = vv.id
       where vv.id = $1 and vv.status = 'posted'
         and le.account_number = $2
         and (($3::numeric >= 0 and le.debit = $3::numeric) or ($3::numeric < 0 and le.credit = -($3::numeric)))
         and not exists (select 1 from acc.bank_transactions bx
                         where (bx.voucher_id = $1 or bx.matched_voucher_id = $1) and bx.id <> $4)
       limit 1`, [voucherId, bt.ledger_account, bt.amount, bankTxId]);
    if (!v.rows[0]) { await client.query("rollback"); return { ok: false, message: "Fylgiskjalið stemmir ekki við færsluna (upphæð/lykill) eða er þegar parað." }; }
    const upd = await client.query(
      `update acc.bank_transactions set status='matched', matched_voucher_id=$1
       where id=$2 and voucher_id is null and matched_voucher_id is null`, [voucherId, bankTxId]);
    if (upd.rowCount === 0) { await client.query("rollback"); return { ok: false, message: "Færslan var þegar tengd." }; }
    await client.query("commit");
    return { ok: true, voucher: { series_code: v.rows[0].series_code, voucher_number: v.rows[0].voucher_number } };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* */ }
    console.error("matchBankTransaction failed:", e);
    return { ok: false, message: "Pörun mistókst." };
  } finally {
    client.release();
  }
}

/** Aftengja pörun (bara 'matched' línur — bókaðar línur eiga sitt fylgiskjal og haggast ekki). */
export async function unmatchBankTransaction(bankTxId: string): Promise<{ ok: boolean; message?: string }> {
  const res = await query<{ id: string }>(
    `update acc.bank_transactions set status='unmatched', matched_voucher_id=null
     where id = $1 and status = 'matched' returning id`, [bankTxId]);
  return res.length ? { ok: true } : { ok: false, message: "Færslan er ekki pöruð." };
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
