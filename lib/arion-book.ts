// Book Arion card transactions to the ledger. Each transaction → a voucher:
//   DEBIT  <chosen expense account>   CREDIT  <card-liability account, default 9310 Visa skuld>
// Dedup by the bank's card_transaction_id (acc.card_transactions) so re-runs never double-post.
import { db } from "@/lib/db";

export interface CardTxInput { id: string; date: string; amount: number; merchant?: string; description?: string }

export async function bookArionCardTransactions(
  txns: CardTxInput[], debitAccount: string, liabilityAccount = "9310", maskedPan?: string,
): Promise<{ booked: number; skipped: number; errors: string[] }> {
  let booked = 0, skipped = 0;
  const errors: string[] = [];
  const client = await db.connect();
  try {
    for (const t of txns) {
      const amount = Math.round(Math.abs(Number(t.amount) || 0));
      if (!t.id || !amount) { skipped++; continue; }
      try {
        const dup = await client.query("select 1 from acc.card_transactions where card_transaction_id = $1", [t.id]);
        if (dup.rowCount) { skipped++; continue; } // already booked
        const date = (t.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
        const desc = (t.merchant || t.description || "Kortafærsla").slice(0, 140);
        const lines = [
          { account: debitAccount, debit: amount, credit: 0, vat_code: null, description: desc },
          { account: liabilityAccount, debit: 0, credit: amount, vat_code: null, description: "Kreditkort" },
        ];
        await client.query("begin");
        const v = await client.query(
          "select id from acc.post_voucher('JOURNAL',$1::date,'card_purchase',$2,$3,'bokhald',$4::jsonb)",
          [date, `Kreditkort: ${desc}`, t.id, JSON.stringify(lines)],
        );
        await client.query(
          "insert into acc.card_transactions (card_transaction_id, voucher_id, tx_date, amount, merchant, masked_pan) values ($1,$2,$3::date,$4,$5,$6)",
          [t.id, v.rows[0].id, date, amount, desc, maskedPan ?? null],
        );
        await client.query("commit");
        booked++;
      } catch (e) {
        try { await client.query("rollback"); } catch { /* */ }
        errors.push(`${(t.merchant || t.id).slice(0, 30)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally { client.release(); }
  return { booked, skipped, errors };
}
