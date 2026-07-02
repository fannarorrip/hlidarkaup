// Supplier returns (skil til birgja). Reverses a purchase: credit vörukaup (by VAT rate) +
// innskattur, debit Lánadrottnar 9300 (lowers what we owe), decrement stock. Unit cost = NET.
import { db, query } from "@/lib/db";

const VORUKAUP: Record<number, string> = { 24: "2100", 11: "2101", 0: "2103" };
const INNSKATTUR: Record<number, string> = { 24: "9510", 11: "9512" };

export interface ReturnLineInput { product_number?: string | null; name: string; qty: number; unitCost: number; vatRate: number }
export interface ReturnInput { supplierId?: string | null; supplierName?: string; note?: string; lines: ReturnLineInput[] }

export async function postSupplierReturn(input: ReturnInput): Promise<{ id: string; return_number: string; voucherNumber: string }> {
  const lines = (input.lines ?? []).filter((l) => l.name && Number(l.qty) > 0);
  if (!lines.length) throw new Error("Engar gildar línur");

  const client = await db.connect();
  try {
    await client.query("begin");

    const netByRate = new Map<number, number>();
    for (const l of lines) {
      const net = Math.round(Number(l.unitCost) * Number(l.qty));
      netByRate.set(Number(l.vatRate) || 0, (netByRate.get(Number(l.vatRate) || 0) ?? 0) + net);
    }
    const vlines: { account: string; debit: number; credit: number; vat_code: string | null; description: string }[] = [];
    let gross = 0;
    for (const [rate, net] of netByRate) {
      if (net === 0) continue;
      vlines.push({ account: VORUKAUP[rate] ?? "2103", debit: 0, credit: net, vat_code: rate === 24 ? "I24" : rate === 11 ? "I11" : "S00", description: `Skil – vörukaup ${rate}%` });
      const vat = rate > 0 ? Math.round((net * rate) / 100) : 0;
      if (vat > 0) vlines.push({ account: INNSKATTUR[rate], debit: 0, credit: vat, vat_code: rate === 24 ? "I24" : "I11", description: `Skil – innskattur ${rate}%` });
      gross += net + vat;
    }
    if (gross <= 0) throw new Error("Engin upphæð til að bóka");
    vlines.push({ account: "9300", debit: gross, credit: 0, vat_code: null, description: `Skil til birgja – ${input.supplierName ?? ""}` });

    const seq = (await client.query<{ n: string }>(`select nextval('acc.sr_number_seq') as n`)).rows[0].n;
    const returnNumber = `SK-${String(seq).padStart(6, "0")}`;
    const today = new Date().toISOString().slice(0, 10);
    const v = (await client.query<{ id: string; voucher_number: string }>(
      `select id, voucher_number from acc.post_voucher('PURCHASE',$1::date,'purchase_return',$2,$3,'bokhald',$4::jsonb, p_supplier_id => $5::uuid)`,
      [today, `Skil til birgja – ${input.supplierName ?? ""}`, returnNumber, JSON.stringify(vlines), input.supplierId ?? null])).rows[0];

    const ret = (await client.query<{ id: string }>(
      `insert into acc.supplier_returns (return_number, supplier_id, supplier_name, voucher_id, total, note, created_by)
       values ($1,$2,$3,$4,$5,$6,'bokhald') returning id`,
      [returnNumber, input.supplierId ?? null, input.supplierName ?? null, v.id, gross, input.note ?? null])).rows[0];

    let ln = 0;
    for (const l of lines) {
      ln++;
      await client.query(`insert into acc.supplier_return_lines (return_id, line_no, product_number, name, qty, unit_cost, vat_rate) values ($1,$2,$3,$4,$5,$6,$7)`,
        [ret.id, ln, l.product_number ?? null, l.name, Number(l.qty), Math.round(Number(l.unitCost) || 0), Number(l.vatRate) || 0]);
      if (l.product_number) {
        await client.query(`update shop.products set stock_quantity = stock_quantity - $1 where product_number = $2 and is_stock_controlled`, [Number(l.qty), l.product_number]);
        await client.query(`insert into shop.stock_movements (product_number, qty_delta, type, ref_type, ref_id, created_by) select $1, $2, 'adjust', 'voucher', $3, 'bokhald' where exists (select 1 from shop.products where product_number = $1 and is_stock_controlled)`, [l.product_number, -Number(l.qty), v.id]);
      }
    }

    await client.query("commit");
    return { id: ret.id, return_number: returnNumber, voucherNumber: String(v.voucher_number) };
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}

export interface SupplierReturnRow { id: string; return_number: string; supplier_name: string | null; total: string; note: string | null; created_at: string; sent_at: string | null; voucher_id: string | null; line_count: number }
export const listSupplierReturns = (limit = 100) =>
  query<SupplierReturnRow>(`
    select r.id, r.return_number, r.supplier_name, r.total, r.note, r.created_at::text as created_at, r.sent_at::text as sent_at, r.voucher_id,
           (select count(*)::int from acc.supplier_return_lines l where l.return_id = r.id) as line_count
    from acc.supplier_returns r order by r.created_at desc limit $1`, [limit]);

export interface SupplierReturnLine { line_no: number; product_number: string | null; name: string; qty: string; unit_cost: string; vat_rate: string }
export interface SupplierReturnFull extends Omit<SupplierReturnRow, "line_count"> { supplier_kennitala: string | null; supplier_email: string | null; sent_via: string | null; lines: SupplierReturnLine[] }
export async function getSupplierReturn(id: string): Promise<SupplierReturnFull | null> {
  const r = (await query<SupplierReturnFull>(`
    select r.id, r.return_number, r.supplier_name, r.total, r.note, r.created_at::text as created_at, r.sent_at::text as sent_at, r.sent_via, r.voucher_id,
           s.kennitala as supplier_kennitala, s.email as supplier_email
    from acc.supplier_returns r left join acc.suppliers s on s.id = r.supplier_id where r.id = $1`, [id]))[0];
  if (!r) return null;
  r.lines = await query<SupplierReturnLine>(`select line_no, product_number, name, qty, unit_cost, vat_rate from acc.supplier_return_lines where return_id = $1 order by line_no`, [id]);
  return r;
}
export async function markSupplierReturnSent(id: string, via: string) {
  await query(`update acc.supplier_returns set sent_at = now(), sent_via = $2 where id = $1`, [id, via]);
}
