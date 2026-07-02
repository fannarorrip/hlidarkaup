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
}
export const getStockAttention = (limit = 300) =>
  query<StockAttentionRow>(`
    select product_number, name, product_group, stock_quantity, reorder_point, cost_price
    from shop.products
    where is_active and is_stock_controlled
      and (stock_quantity <= 0 or (reorder_point is not null and stock_quantity <= reorder_point))
    order by stock_quantity asc, name limit $1`, [limit]);

export interface StockMoveRow { id: string; product_number: string; name: string | null; qty_delta: string; type: string; ref_type: string | null; created_at: string }
export const getRecentStockMovements = (limit = 60) =>
  query<StockMoveRow>(`
    select m.id::text as id, m.product_number, p.name, m.qty_delta, m.type, m.ref_type, m.created_at::text as created_at
    from shop.stock_movements m left join shop.products p on p.product_number = m.product_number
    order by m.created_at desc, m.id desc limit $1`, [limit]);

export interface StockFullRow { product_number: string; name: string; product_group: string | null; stock_quantity: string; reorder_point: string | null; cost_price: string | null; price_gross: string }
export const getStockFull = () =>
  query<StockFullRow>(`
    select product_number, name, product_group, stock_quantity, reorder_point, cost_price, price_gross
    from shop.products where is_active and is_stock_controlled order by product_group nulls last, name`);
