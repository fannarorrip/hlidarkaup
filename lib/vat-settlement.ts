// VSK-uppgjör: post the settlement voucher that clears a period's útskattur (Dr 9530/9532) and
// innskattur (Cr 9510/9512/9520) into 9535 (Uppgjörsreikningur VSK), leaving the net as skuld/
// inneign. Deduped by period (unique period_key) so a period can't be booked twice.
import { db, query } from "@/lib/db";
import { vatPeriods } from "@/lib/vat-periods";

const SETTLEMENT_ACCOUNT = "9535";
const OUT_ACCTS = ["9530", "9532"];

export interface VatSettlementRow {
  period_key: string; year: number; period: number; output_vat: string; input_vat: string; net: string;
  voucher_id: string | null; settled_at: string; series_code: string | null; voucher_number: string | null;
}

export async function getVatSettlement(year: number, period: number): Promise<VatSettlementRow | null> {
  const r = await query<VatSettlementRow>(
    `select s.period_key, s.year, s.period, s.output_vat::text, s.input_vat::text, s.net::text,
            s.voucher_id, s.settled_at::text, v.series_code, v.voucher_number::text as voucher_number
     from acc.vat_settlements s left join acc.vouchers v on v.id = s.voucher_id
     where s.period_key = $1`, [`${year}-${period}`]);
  return r[0] ?? null;
}

export interface SettleVatResult { ok: boolean; message?: string; voucher?: { series_code: string; voucher_number: string } }

export async function settleVatPeriod(year: number, period: number): Promise<SettleVatResult> {
  const p = vatPeriods(year).find((x) => x.key === period);
  if (!p) return { ok: false, message: "Óþekkt tímabil." };
  const key = `${year}-${period}`;

  const client = await db.connect();
  try {
    await client.query("begin");
    // Claim the period — a concurrent settle for the same period fails the unique constraint here.
    const claim = await client.query(
      `insert into acc.vat_settlements (period_key, year, period, period_from, period_to)
       values ($1,$2,$3,$4::date,$5::date) on conflict (period_key) do nothing returning id`,
      [key, year, period, p.from, p.to]);
    if (claim.rowCount === 0) { await client.query("rollback"); return { ok: false, message: "Tímabilið er þegar gert upp." }; }

    // Period VAT balances (exclude any prior settlement voucher).
    const accts = (await client.query<{ account_number: string; debit: number; credit: number }>(
      `select le.account_number, coalesce(sum(le.debit),0)::float8 as debit, coalesce(sum(le.credit),0)::float8 as credit
       from acc.ledger_entries le
       join acc.vouchers v on v.id = le.voucher_id and v.status = 'posted' and v.voucher_type <> 'vat_settlement' and v.voucher_date between $1::date and $2::date
       where le.account_number in ('9510','9512','9520','9530','9532')
       group by le.account_number`, [p.from, p.to])).rows;

    const lines: { account: string; debit: number; credit: number; vat_code: null; description: string }[] = [];
    let output = 0, input = 0;
    for (const a of accts) {
      if (OUT_ACCTS.includes(a.account_number)) {
        const amt = Math.round(a.credit - a.debit);      // útskattur: credit-natural → debit to clear
        if (amt > 0) { lines.push({ account: a.account_number, debit: amt, credit: 0, vat_code: null, description: "Útskattur uppgjör" }); output += amt; }
      } else {
        const amt = Math.round(a.debit - a.credit);      // innskattur: debit-natural → credit to clear
        if (amt > 0) { lines.push({ account: a.account_number, debit: 0, credit: amt, vat_code: null, description: "Innskattur uppgjör" }); input += amt; }
      }
    }
    if (output === 0 && input === 0) { await client.query("rollback"); return { ok: false, message: "Enginn VSK á tímabilinu til að gera upp." }; }

    const net = output - input;
    if (net > 0) lines.push({ account: SETTLEMENT_ACCOUNT, debit: 0, credit: net, vat_code: null, description: "Skuld við ríkissjóð (VSK)" });
    else if (net < 0) lines.push({ account: SETTLEMENT_ACCOUNT, debit: -net, credit: 0, vat_code: null, description: "Inneign VSK" });

    const v = await client.query<{ id: string; series_code: string; voucher_number: string }>(
      "select id, series_code, voucher_number::text as voucher_number from acc.post_voucher('JOURNAL',$1::date,'vat_settlement',$2,$3,'bokhald',$4::jsonb)",
      [p.to, `VSK-uppgjör ${p.label}`, key, JSON.stringify(lines)]);

    await client.query(
      "update acc.vat_settlements set output_vat=$2, input_vat=$3, net=$4, voucher_id=$5 where period_key=$1",
      [key, output, input, net, v.rows[0].id]);
    await client.query("commit");
    return { ok: true, voucher: { series_code: v.rows[0].series_code, voucher_number: v.rows[0].voucher_number } };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* */ }
    console.error("settleVatPeriod failed:", e);
    return { ok: false, message: "Uppgjör mistókst. Reyndu aftur." };
  } finally {
    client.release();
  }
}
