// Afskriftaskráning: scan/pick a product → reason → stock decremented (movement 'waste')
// + the write-off queued on the per-supplier credit list. No ledger entry — purchases are
// expensed at receipt (periodic inventory); supplier credits arrive as normal credit invoices.
import { db, query } from "@/lib/db";

export interface LookupHit { product_number: string; name: string; price_gross: number | null; cost_price: string | null; supplier_name: string | null }

/** Resolve a scanned barcode (exact, with EAN/UPC variants) or search by name/PLU. */
export async function lookupProduct(q: string): Promise<LookupHit[]> {
  const digits = q.replace(/\D/g, "");
  const base = `
    select p.product_number, p.name, p.price_gross, p.cost_price::text as cost_price,
           s.name as supplier_name
      from shop.products p
      left join acc.suppliers s on s.id = p.preferred_supplier_id`;
  if (digits.length >= 8 && digits === q.trim()) {
    const variants = [digits];
    if (/^\d{12}$/.test(digits)) variants.push("0" + digits);
    if (/^0\d{12}$/.test(digits)) variants.push(digits.slice(1));
    const hit = await query<LookupHit>(
      `${base} join shop.product_barcodes b on b.product_number = p.product_number
        where b.barcode = any($1) limit 3`, [variants]);
    if (hit.length) return hit;
  }
  return query<LookupHit>(
    `${base} where p.is_active and (p.name ilike $1 or p.product_number = $2)
      order by p.name limit 8`, ["%" + q.trim() + "%", q.trim()]);
}

export interface WriteOffInput { productNumber: string; qty: number; reason: string; note?: string; createdBy?: string }

/** Record a write-off: snapshot name/cost/supplier, decrement stock, log 'waste' movement. */
export async function addWriteOff(w: WriteOffInput): Promise<{ ok: boolean; id?: string; message?: string }> {
  if (!(w.qty > 0)) return { ok: false, message: "Magn verður að vera stærra en 0." };
  if (!["útrunnið", "skemmt", "rýrnun", "annað"].includes(w.reason)) return { ok: false, message: "Ógild ástæða." };
  const client = await db.connect();
  try {
    await client.query("begin");
    const p = (await client.query<{ name: string; cost_price: string | null; supplier_name: string | null }>(
      `select p.name, p.cost_price::text, s.name as supplier_name
         from shop.products p left join acc.suppliers s on s.id = p.preferred_supplier_id
        where p.product_number = $1 for update of p`, [w.productNumber])).rows[0];
    if (!p) { await client.query("rollback"); return { ok: false, message: "Vara fannst ekki." }; }
    const cost = p.cost_price != null ? Number(p.cost_price) : null;
    const r = (await client.query<{ id: string }>(
      `insert into acc.write_offs (product_number, product_name, qty, unit_cost, reason, supplier_name, note, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [w.productNumber, p.name, w.qty, cost, w.reason, p.supplier_name, w.note || null, w.createdBy || "bokhald"])).rows[0];
    await client.query(
      `update shop.products set stock_quantity = stock_quantity - $1 where product_number = $2`,
      [w.qty, w.productNumber]);
    await client.query(
      `insert into shop.stock_movements (product_number, qty_delta, type, cost_basis, ref_type, ref_id, created_by)
         values ($1, $2, 'waste', $3, 'writeoff', $4, $5)`,
      [w.productNumber, -w.qty, cost, r.id, w.createdBy || "bokhald"]);
    await client.query("commit");
    return { ok: true, id: r.id };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* */ }
    console.error("addWriteOff failed:", e);
    return { ok: false, message: "Skráning mistókst." };
  } finally {
    client.release();
  }
}

/** Undo a write-off (restores stock with a reversing movement). */
export async function deleteWriteOff(id: string): Promise<{ ok: boolean; message?: string }> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const w = (await client.query<{ product_number: string | null; qty: string; unit_cost: string | null; status: string }>(
      `select product_number, qty::text, unit_cost::text, status from acc.write_offs where id = $1 for update`, [id])).rows[0];
    if (!w) { await client.query("rollback"); return { ok: false, message: "Færsla fannst ekki." }; }
    if (w.status !== "recorded") { await client.query("rollback"); return { ok: false, message: "Þegar kreditað — ekki hægt að eyða." }; }
    if (w.product_number) {
      await client.query(`update shop.products set stock_quantity = stock_quantity + $1 where product_number = $2`,
        [Number(w.qty), w.product_number]);
      await client.query(
        `insert into shop.stock_movements (product_number, qty_delta, type, cost_basis, ref_type, ref_id, created_by)
           values ($1, $2, 'adjust', $3, 'writeoff-undo', $4, 'bokhald')`,
        [w.product_number, Number(w.qty), w.unit_cost != null ? Number(w.unit_cost) : null, id]);
    }
    await client.query(`delete from acc.write_offs where id = $1`, [id]);
    await client.query("commit");
    return { ok: true };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* */ }
    console.error("deleteWriteOff failed:", e);
    return { ok: false, message: "Eyðing mistókst." };
  } finally {
    client.release();
  }
}

export interface WriteOffRow {
  id: string; product_number: string | null; product_name: string; qty: string; unit_cost: string | null;
  reason: string; supplier_name: string | null; note: string | null; status: string; created_at: string;
}

export function listWriteOffs(days = 30) {
  return query<WriteOffRow>(
    `select id, product_number, product_name, qty::text, unit_cost::text, reason, supplier_name, note, status, created_at::text
       from acc.write_offs
      where created_at > now() - ($1 || ' days')::interval
      order by created_at desc limit 300`, [String(days)]);
}

export interface SupplierCreditRow { supplier_name: string; items: number; total_qty: string; total_cost: string }

/** Uncredited write-offs grouped by supplier — the credit-claim list. */
export function supplierCreditSummary() {
  return query<SupplierCreditRow>(
    `select coalesce(supplier_name, 'Óþekktur birgir') as supplier_name,
            count(*)::int as items, sum(qty)::text as total_qty,
            coalesce(sum(qty * coalesce(unit_cost, 0)), 0)::text as total_cost
       from acc.write_offs where status = 'recorded'
      group by 1 order by 4 desc`);
}

/** Mark a supplier's outstanding write-offs credited (their kreditreikningur arrived). */
export async function markSupplierCredited(supplierName: string): Promise<number> {
  const r = await query<{ id: string }>(
    `update acc.write_offs set status = 'credited', credited_at = now()
      where status = 'recorded' and coalesce(supplier_name, 'Óþekktur birgir') = $1
      returning id`, [supplierName]);
  return r.length;
}
