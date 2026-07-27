// Collect the backlog of "old" símgreiðslur — kassi_sale vouchers that the pre-MOTO button posted with
// money-in on 7830 (bank/millifærsla) but where no card was ever charged. We charge the card now (MOTO,
// on the till/posi) and post a receipt journal Dr 7716 / Cr 7830: it brings in the real card money and
// clears the phantom transfer, WITHOUT creating a second sale (revenue/VAT stay counted once).
import { db, query } from "@/lib/db";
import { SERIES_PREFIX } from "@/lib/format";

const CARD_ACCOUNT = process.env.KASSI_CARD_ACCOUNT ?? "7716";          // Straumur/kort — settles with card sales
const OLD_TRANSFER_ACCOUNT = process.env.KASSI_TRANSFER_ACCOUNT ?? "7830"; // where the old símgreiðsla button parked it

const hk = (n: number | string) => `${SERIES_PREFIX.KASSI}-${String(n).padStart(6, "0")}`;
const db_ = (n: number | string) => `${SERIES_PREFIX.JOURNAL}-${String(n).padStart(6, "0")}`;

export class CollectError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export interface UnpaidSimgreidsla { id: string; invoiceNumber: string; date: string; description: string | null; total: number }

/** Old símgreiðslur still sitting on 7830 (posted kassi_sale, money-in 7830, not yet collected). */
export async function listUnpaidSimgreidslur(): Promise<UnpaidSimgreidsla[]> {
  const rows = await query<{ id: string; voucher_number: string; voucher_date: string; description: string | null; total: string }>(`
    select v.id, v.voucher_number, v.voucher_date::text as voucher_date, v.description,
           coalesce(sum(le.debit) filter (where le.account_number = $1), 0) as total
    from acc.vouchers v
    join acc.ledger_entries le on le.voucher_id = v.id
    where v.status = 'posted' and v.voucher_type = 'kassi_sale' and v.series_code = 'KASSI'
      and not exists (select 1 from acc.simgreidsla_collected c where c.voucher_id = v.id)
    group by v.id
    having coalesce(sum(le.debit) filter (where le.account_number = $1), 0) > 0
    order by v.voucher_date desc, v.voucher_number desc`, [OLD_TRANSFER_ACCOUNT]);
  return rows.map((r) => ({
    id: r.id, invoiceNumber: hk(r.voucher_number), date: r.voucher_date,
    description: r.description, total: Math.round(Number(r.total)),
  }));
}

export interface CollectResult { journalNumber: string; total: number; count: number; receipts: string[] }

/** Charge already done on the posi (MOTO). Post Dr 7716 / Cr 7830 for the selected originals' 7830
 *  totals and mark them collected. Atomic + guarded against double-collection (row lock + unique PK). */
export async function collectSimgreidslur(
  voucherIds: string[],
  opts: { poiTx?: string | null; user?: string; registerId?: string | null },
): Promise<CollectResult> {
  const ids = [...new Set(voucherIds)].filter(Boolean);
  if (!ids.length) throw new CollectError("Engin kvittun valin", 400);

  const client = await db.connect();
  try {
    await client.query("begin");
    // Lock the target sale rows FIRST — a plain row lock, because Postgres forbids FOR UPDATE together
    // with GROUP BY (that combination is what silently broke every collect: card charged, booking rolled back).
    const locked = (await client.query<{ id: string }>(
      `select id from acc.vouchers
        where id = any($1::uuid[]) and status = 'posted' and voucher_type = 'kassi_sale'
        for update`, [ids])).rows;
    if (locked.length !== ids.length) throw new CollectError("Kvittun fannst ekki (eða er ekki kassasala)", 404);

    // Now aggregate each one's 7830 money-in + flag any already collected (no FOR UPDATE here).
    const rows = (await client.query<{ id: string; voucher_number: string; total: string; collected: boolean }>(`
      select v.id, v.voucher_number,
             coalesce(sum(le.debit) filter (where le.account_number = $2), 0) as total,
             exists (select 1 from acc.simgreidsla_collected c where c.voucher_id = v.id) as collected
      from acc.vouchers v
      join acc.ledger_entries le on le.voucher_id = v.id
      where v.id = any($1::uuid[]) and v.status = 'posted' and v.voucher_type = 'kassi_sale'
      group by v.id`, [ids, OLD_TRANSFER_ACCOUNT])).rows;

    if (rows.length !== ids.length) throw new CollectError("Kvittun fannst ekki (eða er ekki kassasala)", 404);
    for (const r of rows) {
      if (r.collected) throw new CollectError(`${hk(r.voucher_number)} er þegar innheimt`, 409);
      if (Math.round(Number(r.total)) <= 0) throw new CollectError(`${hk(r.voucher_number)} er ekki ógreidd símgreiðsla (engin 7830-færsla)`, 400);
    }

    const total = rows.reduce((s, r) => s + Math.round(Number(r.total)), 0);
    const receipts = rows.map((r) => hk(r.voucher_number));
    const nums = receipts.join(", ");
    const today = new Date().toISOString().slice(0, 10);
    // Balanced 2-line receipt journal: real card money in (7716), phantom transfer cleared (7830).
    const lines = [
      { account: CARD_ACCOUNT, debit: total, credit: 0, vat_code: null, description: `Símgreiðsla innheimt – ${nums}` },
      { account: OLD_TRANSFER_ACCOUNT, debit: 0, credit: total, vat_code: null, description: `Leiðrétting ${OLD_TRANSFER_ACCOUNT}→${CARD_ACCOUNT} – ${nums}` },
    ];
    const j = (await client.query<{ id: string; voucher_number: string }>(
      `select id, voucher_number from acc.post_voucher($1,$2::date,$3,$4,$5,$6,$7::jsonb)`,
      ["JOURNAL", today, "receipt", `Símgreiðsla innheimt – ${nums}`, nums, opts.user ?? "kassi", JSON.stringify(lines)])).rows[0];

    for (const r of rows) {
      await client.query(
        `insert into acc.simgreidsla_collected (voucher_id, journal_voucher_id, amount, poi_tx, collected_by)
         values ($1,$2,$3,$4,$5)`,
        [r.id, j.id, Math.round(Number(r.total)), opts.poiTx ?? null, opts.user ?? "kassi"]);
    }

    await client.query("commit");
    return { journalNumber: db_(j.voucher_number), total, count: rows.length, receipts };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
