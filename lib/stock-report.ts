// Birgðaskýrsla / eftirlit — stock summary, attention list (low/out), and movement log.
import { query } from "@/lib/db";

export interface StockSummary { stock_value: string; active_count: number; controlled_count: number; low_count: number; out_count: number }
export const getStockSummary = async () => (await query<StockSummary>(`
  select
    coalesce(sum(stock_quantity * coalesce(cost_price,0)) filter (where is_stock_controlled), 0) as stock_value,
    count(*) filter (where is_active)::int as active_count,
    count(*) filter (where is_active and is_stock_controlled)::int as controlled_count,
    count(*) filter (where is_active and is_stock_controlled and reorder_point is not null and stock_quantity <= reorder_point)::int as low_count,
    count(*) filter (where is_active and is_stock_controlled and stock_quantity <= 0)::int as out_count
  from shop.products`))[0];

export interface StockAttentionRow {
  product_number: string; name: string; product_group: string | null;
  stock_quantity: string; reorder_point: string | null; cost_price: string | null;
  supplier_name: string | null;
}
// supplierId = sía á aðalbirgi vörunnar (preferred_supplier_id) — sama sía og í Excel-útflutningnum.
export const getStockAttention = (limit = 300, supplierId?: string) =>
  query<StockAttentionRow>(`
    select p.product_number, p.name, p.product_group, p.stock_quantity, p.reorder_point, p.cost_price, s.name as supplier_name
    from shop.products p left join acc.suppliers s on s.id = p.preferred_supplier_id
    where p.is_active and p.is_stock_controlled
      and (p.stock_quantity <= 0 or (p.reorder_point is not null and p.stock_quantity <= p.reorder_point))
      and ($2::uuid is null or p.preferred_supplier_id = $2::uuid)
    order by p.stock_quantity asc, p.name limit $1`, [limit, supplierId ?? null]);

// Birgjar sem eiga a.m.k. eina birgðastýrða vöru — fyrir birgja-síuna á skýrslunni.
export const getStockSuppliers = () =>
  query<{ id: string; name: string }>(`
    select distinct s.id, s.name
    from shop.products p join acc.suppliers s on s.id = p.preferred_supplier_id
    where p.is_active and p.is_stock_controlled
    order by s.name`);

export interface StockMoveRow { id: string; product_number: string; name: string | null; qty_delta: string; type: string; ref_type: string | null; created_at: string }
export const getRecentStockMovements = (limit = 60) =>
  query<StockMoveRow>(`
    select m.id::text as id, m.product_number, p.name, m.qty_delta, m.type, m.ref_type, m.created_at::text as created_at
    from shop.stock_movements m left join shop.products p on p.product_number = m.product_number
    order by m.created_at desc, m.id desc limit $1`, [limit]);

export interface StockFullRow { product_number: string; name: string; product_group: string | null; stock_quantity: string; reorder_point: string | null; cost_price: string | null; price_gross: string; supplier_name: string | null }
export const getStockFull = (supplierId?: string) =>
  query<StockFullRow>(`
    select p.product_number, p.name, p.product_group, p.stock_quantity, p.reorder_point, p.cost_price, p.price_gross, s.name as supplier_name
    from shop.products p left join acc.suppliers s on s.id = p.preferred_supplier_id
    where p.is_active and p.is_stock_controlled
      and ($1::uuid is null or p.preferred_supplier_id = $1::uuid)
    order by p.product_group nulls last, p.name`, [supplierId ?? null]);
