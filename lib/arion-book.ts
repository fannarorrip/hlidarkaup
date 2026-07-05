// Book Arion card transactions to the ledger. Direction-aware:
//   Purchase (amount > 0):  DEBIT expense account / CREDIT card liability (default 9310 Visa skuld)
//   Refund   (amount < 0):  DEBIT card liability  / CREDIT expense account  ← sign is KEPT, never abs()'d
// Dedup by the bank's card_transaction_id: the claim-INSERT runs first, inside the same transaction
// as the voucher, so a re-run (or a concurrent double-click) skips cleanly instead of double-posting.
import { db } from "@/lib/db";
import { learnAccount } from "@/lib/tx-rules";

// debitAccount on a transaction overrides the shared default — per-tx categorization.
export interface CardTxInput { id: string; date: string; amount: number; merchant?: string; description?: string; debitAccount?: string }

export async function bookArionCardTransactions(
  txns: CardTxInput[], debitAccount: string, liabilityAccount = "9310", maskedPan?: string,
): Promise<{ booked: number; skipped: number; errors: string[] }> {
  let booked = 0, skipped = 0;
  const errors: string[] = [];
  const client = await db.connect();
  try {
    for (const t of txns) {
      const raw = Number(t.amount) || 0;
      const amount = Math.round(Math.abs(raw));
      if (!t.id || !amount) { skipped++; continue; }
      const acct = (t.debitAccount || debitAccount || "").trim();
      if (!acct) { errors.push(`${(t.merchant || t.id).slice(0, 30)}: vantar gjaldalykil`); continue; }
      const isRefund = raw < 0;
      try {
        await client.query("begin");
        // Claim the transaction id first (unique) — 0 rows = already booked (by us or a parallel run).
        const claim = await client.query(
          "insert into acc.card_transactions (card_transaction_id, tx_date, amount, merchant, masked_pan) values ($1,$2::date,$3,$4,$5) on conflict (card_transaction_id) do nothing returning id",
          [t.id, (t.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10), Math.round(raw),
           (t.merchant || t.description || "Kortafærsla").slice(0, 140), maskedPan ?? null],
        );
        if (claim.rowCount === 0) { await client.query("rollback"); skipped++; continue; }

        const date = (t.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
        const desc = (t.merchant || t.description || "Kortafærsla").slice(0, 140);
        const lines = isRefund
          ? [{ account: liabilityAccount, debit: amount, credit: 0, vat_code: null, description: "Kreditkort endurgreiðsla" },
             { account: acct, debit: 0, credit: amount, vat_code: null, description: desc }]
          : [{ account: acct, debit: amount, credit: 0, vat_code: null, description: desc },
             { account: liabilityAccount, debit: 0, credit: amount, vat_code: null, description: "Kreditkort" }];
        const v = await client.query(
          "select id from acc.post_voucher('JOURNAL',$1::date,'card_purchase',$2,$3,'bokhald',$4::jsonb)",
          [date, `${isRefund ? "Endurgreiðsla" : "Kreditkort"}: ${desc}`, t.id, JSON.stringify(lines)],
        );
        await client.query("update acc.card_transactions set voucher_id = $1 where card_transaction_id = $2", [v.rows[0].id, t.id]);
        await client.query("commit");
        booked++;
        await learnAccount(t.merchant || t.description, acct); // kerfið lærir hvað hvert fer
      } catch (e) {
        try { await client.query("rollback"); } catch { /* */ }
        errors.push(`${(t.merchant || t.id).slice(0, 30)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally { client.release(); }
  return { booked, skipped, errors };
}
