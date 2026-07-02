-- Hlíðarkaup — parked/held till sales (Geymdir reikningar). Transient cart state, NOT ledger
-- entries — a held sale is recalled (loaded back into the till) or discarded. Server-side so any
-- till can recall. Apply after 230_month_end_billing.sql.
set search_path = shop, public;

create table if not exists shop.held_sales (
  id            uuid primary key default gen_random_uuid(),
  label         text,
  customer_id   uuid references shop.customers(id),
  customer_name text,
  cart          jsonb not null,            -- [{id,name,price,vatPct,quantity}]
  total         numeric not null default 0,
  created_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists idx_held_sales_created on shop.held_sales(created_at desc);
