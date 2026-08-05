// Sölutölfræði dagsins — vöru-greining ofan á shop.sale_lines (karfa = fylgiskjal).
// Sölutegundir án kreditnóta; mínuslínur (skilagjald) og línur án vörunúmers síaðar frá.
import { query } from "@/lib/db";

const SALE_TYPES = "('kassi_sale','account_sale','web_sale','eldhus_sale')";
const LINES = `
  from shop.sale_lines l
  join acc.vouchers v on v.id = l.voucher_id
  where v.status = 'posted' and v.voucher_type in ${SALE_TYPES}
    and v.voucher_date = $1::date and l.product_number is not null and l.line_total > 0`;

export interface DayOverview { baskets: number; gross: string; avg_basket: string; avg_items: string; products: number }
export const getDayOverview = async (d: string) => (await query<DayOverview>(`
  select count(distinct v.id)::int as baskets,
         coalesce(sum(l.line_total), 0) as gross,
         coalesce(sum(l.line_total) / nullif(count(distinct v.id), 0), 0) as avg_basket,
         coalesce(sum(l.quantity) / nullif(count(distinct v.id), 0), 0) as avg_items,
         count(distinct l.product_number)::int as products
  ${LINES}`, [d]))[0];

export interface TopProductRow { product_number: string; name: string; qty: string; revenue: string; baskets: number; basket_pct: string }
const TOP_SELECT = `
  select l.product_number, max(l.name) as name,
         sum(l.quantity) as qty, sum(l.line_total) as revenue,
         count(distinct l.voucher_id)::int as baskets,
         round(100.0 * count(distinct l.voucher_id) / greatest((select count(distinct v2.id) from acc.vouchers v2
            join shop.sale_lines l2 on l2.voucher_id = v2.id
            where v2.status = 'posted' and v2.voucher_type in ${SALE_TYPES} and v2.voucher_date = $1::date), 1), 1) as basket_pct
  ${LINES}
  group by l.product_number`;

export const getTopByRevenue = (d: string, limit = 10) =>
  query<TopProductRow>(`${TOP_SELECT} order by revenue desc limit $2`, [d, limit]);
export const getTopByQty = (d: string, limit = 10) =>
  query<TopProductRow>(`${TOP_SELECT} order by qty desc limit $2`, [d, limit]);
// „Heitasta varan" — í flestum KÖRFUM (óháð magni og verði).
export const getBasketHits = (d: string, limit = 10) =>
  query<TopProductRow>(`${TOP_SELECT} order by baskets desc, revenue desc limit $2`, [d, limit]);

// Saman í körfu: algengustu vörupör dagsins (bæði í sömu körfunni).
export interface PairRow { name_a: string; name_b: string; baskets: number }
export const getTopPairs = (d: string, limit = 10) =>
  query<PairRow>(`
    with day_lines as (
      select distinct l.voucher_id, l.product_number, l.name
      ${LINES}
    )
    select a.name as name_a, b.name as name_b, count(*)::int as baskets
    from day_lines a
    join day_lines b on b.voucher_id = a.voucher_id and a.product_number < b.product_number
    group by a.product_number, a.name, b.product_number, b.name
    having count(*) >= 2
    order by baskets desc limit $2`, [d, limit]);

// Selst hratt + birgðir að klárast: sala síðustu 7 daga umfram núverandi birgðastöðu.
export interface FastLowRow { product_number: string; name: string; sold7: string; stock_quantity: string }
export const getFastLowStock = (limit = 10) =>
  query<FastLowRow>(`
    select p.product_number, p.name, s.sold7, p.stock_quantity
    from (
      select l.product_number, sum(l.quantity) as sold7
      from shop.sale_lines l join acc.vouchers v on v.id = l.voucher_id
      where v.status = 'posted' and v.voucher_type in ${SALE_TYPES}
        and v.voucher_date >= current_date - 6 and l.product_number is not null and l.line_total > 0
      group by l.product_number
    ) s
    join shop.products p on p.product_number = s.product_number
    where p.is_active and p.is_stock_controlled and p.stock_quantity < s.sold7
    order by s.sold7 - p.stock_quantity desc limit $1`, [limit]);

// Skil dagsins: kreditnótulínur.
export interface ReturnRow { product_number: string | null; name: string; qty: string; amount: string }
export const getDayReturns = (d: string, limit = 10) =>
  query<ReturnRow>(`
    select l.product_number, max(l.name) as name, sum(l.quantity) as qty, sum(l.line_total) as amount
    from shop.sale_lines l join acc.vouchers v on v.id = l.voucher_id
    where v.status = 'posted' and v.voucher_type = 'credit_note' and v.voucher_date = $1::date
    group by l.product_number order by sum(l.quantity) desc limit $2`, [d, limit]);

// Hreyfingarlausar birgðavörur: ekkert selst í 14+ daga — raðað eftir bundnu birgðavirði.
export interface DeadStockRow { product_number: string; name: string; stock_quantity: string; value: string; last_sold: string | null }
export const getDeadStock = (days = 14, limit = 10) =>
  query<DeadStockRow>(`
    select p.product_number, p.name, p.stock_quantity,
           round(p.stock_quantity * coalesce(p.cost_price, 0)) as value,
           (select max(v.voucher_date)::text from shop.sale_lines l join acc.vouchers v on v.id = l.voucher_id
             where l.product_number = p.product_number and v.status = 'posted' and v.voucher_type in ${SALE_TYPES}) as last_sold
    from shop.products p
    where p.is_active and p.is_stock_controlled and p.stock_quantity > 0
      and not exists (
        select 1 from shop.sale_lines l join acc.vouchers v on v.id = l.voucher_id
        where l.product_number = p.product_number and v.status = 'posted'
          and v.voucher_type in ${SALE_TYPES} and v.voucher_date >= current_date - ($1::int - 1)
      )
    order by p.stock_quantity * coalesce(p.cost_price, 0) desc limit $2`, [days, limit]);

// Sala eftir klukkustund dagsins (fjöldi karfa + velta) — hvenær er örtröðin.
export interface HourRow { hour: number; baskets: number; gross: string }
export const getSalesByHour = (d: string) =>
  query<HourRow>(`
    select extract(hour from v.created_at at time zone 'Atlantic/Reykjavik')::int as hour,
           count(distinct v.id)::int as baskets, coalesce(sum(l.line_total), 0) as gross
    from acc.vouchers v join shop.sale_lines l on l.voucher_id = v.id
    where v.status = 'posted' and v.voucher_type in ${SALE_TYPES} and v.voucher_date = $1::date
      and l.line_total > 0
    group by 1 order by 1`, [d]);
