// Purchase orders (innkaupapantanir). Created (often from low-stock suggestions), sent to a
// birgir, then fulfilled via the existing Móttaka. No ledger posting here — that happens on
// goods receipt. Stock/reorder helpers live here too.
import { db, query } from "@/lib/db";

export interface POLineInput { product_number?: string | null; name: string; qty: number; unit_cost_est?: number }
export interface POInput { supplierId?: string | null; supplierName?: string; note?: string; lines: POLineInput[] }

export async function createPurchaseOrder(input: POInput): Promise<{ id: string; po_number: string }> {
  const lines = (input.lines ?? []).filter((l) => l.name && Number(l.qty) > 0);
  if (!lines.length) throw new Error("Engar gildar línur");
  const client = await db.connect();
  try {
    await client.query("begin");
    const seq = (await client.query<{ n: string }>(`select nextval('acc.po_number_seq') as n`)).rows[0].n;
    const poNumber = `P-${String(seq).padStart(6, "0")}`;
    const total = lines.reduce((s, l) => s + (Number(l.unit_cost_est) || 0) * Number(l.qty), 0);
    const po = (await client.query<{ id: string }>(
      `insert into acc.purchase_orders (po_number, supplier_id, supplier_name, note, total_est, created_by)
       values ($1,$2,$3,$4,$5,'bokhald') returning id`,
      [poNumber, input.supplierId ?? null, input.supplierName ?? null, input.note ?? null, Math.round(total)])).rows[0];
    let ln = 0;
    for (const l of lines) {
      ln++;
      await client.query(
        `insert into acc.purchase_order_lines (po_id, line_no, product_number, name, qty, unit_cost_est) values ($1,$2,$3,$4,$5,$6)`,
        [po.id, ln, l.product_number ?? null, l.name, Number(l.qty), Math.round(Number(l.unit_cost_est) || 0)]);
    }
    await client.query("commit");
    return { id: po.id, po_number: poNumber };
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}

export interface PORow {
  id: string; po_number: string; supplier_id: string | null; supplier_name: string | null;
  status: string; total_est: string; created_at: string; sent_at: string | null; sent_via: string | null; line_count: number;
}
export const listPurchaseOrders = (limit = 100) =>
  query<PORow>(`
    select po.id, po.po_number, po.supplier_id, po.supplier_name, po.status, po.total_est,
           po.created_at::text as created_at, po.sent_at::text as sent_at, po.sent_via,
           (select count(*)::int from acc.purchase_order_lines l where l.po_id = po.id) as line_count
    from acc.purchase_orders po order by po.created_at desc limit $1`, [limit]);

export interface POLine { line_no: number; product_number: string | null; name: string; qty: string; unit_cost_est: string }
export interface POFull extends Omit<PORow, "line_count"> { note: string | null; supplier_kennitala: string | null; supplier_email: string | null; lines: POLine[] }
export async function getPurchaseOrder(id: string): Promise<POFull | null> {
  const po = (await query<POFull>(`
    select po.id, po.po_number, po.supplier_id, po.supplier_name, po.status, po.note, po.total_est,
           po.created_at::text as created_at, po.sent_at::text as sent_at, po.sent_via,
           s.kennitala as supplier_kennitala, s.email as supplier_email
    from acc.purchase_orders po left join acc.suppliers s on s.id = po.supplier_id where po.id = $1`, [id]))[0];
  if (!po) return null;
  po.lines = await query<POLine>(`select line_no, product_number, name, qty, unit_cost_est from acc.purchase_order_lines where po_id = $1 order by line_no`, [id]);
  return po;
}

export async function markPurchaseOrderSent(id: string, via: string): Promise<void> {
  await query(`update acc.purchase_orders set status = case when status='draft' then 'sent' else status end, sent_at = now(), sent_via = $2 where id = $1`, [id, via]);
}
export async function setPurchaseOrderStatus(id: string, status: string): Promise<void> {
  await query(`update acc.purchase_orders set status = $2 where id = $1`, [id, status]);
}

// ── Sales-driven reorder suggestion ──────────────────────────────────────────
// "Tillaga að pöntunarmagni" is estimated from how much actually sells, so an order
// covers ~one month of demand plus tops the shelf back above öryggisbirgðir.
const COVERAGE_DAYS = 30; // how many days of sales each order should cover (one shopping cycle)

// Sale voucher types that count as customer demand. Returns (credit_note) already carry a
// NEGATIVE quantity in shop.sale_lines (see lib/sales.ts), so a plain sum nets returns out.
const SALE_TYPES = "'kassi_sale','account_sale','web_sale','eldhus_sale','credit_note'";
const soldExpr = (days: number) => `
  coalesce((select sum(sl.quantity) from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id
    where sl.product_number = p.product_number and v.status = 'posted'
      and v.voucher_type in (${SALE_TYPES}) and v.voucher_date >= current_date - interval '${days} days'), 0)::float8`;

/** Pure: estimate monthly demand + a suggested order quantity from sales history. */
export function suggestReorderQty(i: { stock: number; reorderPoint: number; reorderQty: number | null; sold90: number; sold30: number }):
  { monthlyDemand: number; suggested: number; basis: "sales" | "manual" } {
  const sold90 = Math.max(0, i.sold90), sold30 = Math.max(0, i.sold30);
  // Monthly demand = the higher of the last 30 days vs the 90-day average. The 90-day average
  // smooths weekly spikes for established products; the 30-day figure keeps up with rising
  // demand and avoids under-ordering when the store only has a month or two of history.
  const monthly = Math.max(sold30, sold90 / 3);
  const cycle = Math.ceil(monthly * (COVERAGE_DAYS / 30));
  const refill = Math.max(0, i.reorderPoint - i.stock); // top back up above the safety level
  let suggested = cycle + refill;
  let basis: "sales" | "manual" = "sales";
  if (suggested <= 0) { suggested = Math.round(i.reorderQty || i.reorderPoint || 1); basis = "manual"; } // no sales → manual fallback
  return { monthlyDemand: Math.round(monthly), suggested: Math.max(1, suggested), basis };
}

/** Net units sold for one product over the last 30 / 90 days (for the product editor hint). */
export async function getProductVelocity(productNumber: string): Promise<{ sold30: number; sold90: number }> {
  const r = (await query<{ sold30: string; sold90: string }>(`
    select coalesce(sum(sl.quantity) filter (where v.voucher_date >= current_date - interval '30 days'), 0)::float8 as sold30,
           coalesce(sum(sl.quantity), 0)::float8 as sold90
    from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id
    where sl.product_number = $1 and v.status = 'posted'
      and v.voucher_type in (${SALE_TYPES}) and v.voucher_date >= current_date - interval '90 days'`, [productNumber]))[0];
  return { sold30: Math.max(0, Number(r?.sold30) || 0), sold90: Math.max(0, Number(r?.sold90) || 0) };
}

// Products at or below their reorder point (öryggisbirgðir), with the preferred supplier
// and a sales-driven order suggestion.
export interface LowStockRow {
  product_number: string; name: string; stock_quantity: string; reorder_point: string; reorder_qty: string | null;
  cost_price: string | null; vat_rate: string; preferred_supplier_id: string | null; supplier_name: string | null;
  sold_30d: string; sold_90d: string; monthly_demand: number; suggested_qty: number;
}
export async function lowStockProducts(): Promise<LowStockRow[]> {
  const rows = await query<Omit<LowStockRow, "monthly_demand" | "suggested_qty">>(`
    select p.product_number, p.name, p.stock_quantity, p.reorder_point, p.reorder_qty, p.cost_price, p.vat_rate,
           p.preferred_supplier_id, s.name as supplier_name,
           ${soldExpr(30)} as sold_30d, ${soldExpr(90)} as sold_90d
    from shop.products p left join acc.suppliers s on s.id = p.preferred_supplier_id
    where p.is_active and p.reorder_point is not null and p.stock_quantity <= p.reorder_point
    order by s.name nulls last, p.name`);
  return rows.map((r) => {
    const est = suggestReorderQty({
      stock: Number(r.stock_quantity) || 0, reorderPoint: Number(r.reorder_point) || 0,
      reorderQty: r.reorder_qty != null ? Number(r.reorder_qty) : null,
      sold30: Number(r.sold_30d) || 0, sold90: Number(r.sold_90d) || 0,
    });
    return { ...r, monthly_demand: est.monthlyDemand, suggested_qty: est.suggested };
  });
}
