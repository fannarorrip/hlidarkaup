-- Verðbreytingatillögur: when móttaka confirms a receipt whose unit cost differs from the
-- product's previous cost, the system computes a suggested retail price (keep-margin, else a
-- matched acc.pricing_rules rule) and queues it here for HUMAN approval — prices never change
-- silently. Applying updates shop.products.price_gross (+ unit_price_net from vat_rate).
set search_path = acc, public;

create table if not exists acc.price_suggestions (
  id              uuid primary key default gen_random_uuid(),
  product_number  text not null references shop.products(product_number),
  product_name    text not null,
  supplier_name   text,
  receipt_id      uuid references acc.goods_receipts(id),
  old_cost        numeric,
  new_cost        numeric not null,
  current_price   integer not null,
  suggested_price integer not null,
  method          text not null,          -- 'sama álagning (×1,18)' | 'regla: Danól — franskar'
  multiplier      numeric,
  status          text not null default 'pending' check (status in ('pending','applied','dismissed')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
-- one live suggestion per product — a newer receipt replaces the pending one
create unique index if not exists price_suggestions_pending_uk
  on acc.price_suggestions(product_number) where status = 'pending';
create index if not exists price_suggestions_status_idx on acc.price_suggestions(status, created_at desc);
