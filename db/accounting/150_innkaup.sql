-- Innkaupakerfi: goods receipt (móttaka) + invoice quantity matching + stock movements.
-- A supplier invoice (PEPPOL XML or AI-read PDF) becomes a goods_receipt with product
-- lines; the receiver matches each line to a catalog product and enters received qty;
-- confirming raises stock (logged in stock_movements) and books the invoice.
set search_path = acc, public;

-- Cost field on products (innkaupsverð) — captured from receipts; enables valuation/margins.
alter table shop.products add column if not exists cost_price numeric(18,4);

-- Append-only stock-movement log (birgðahreyfing). Receiving + (later) sales/counts route through it.
create table if not exists shop.stock_movements (
  id             bigint generated always as identity primary key,
  product_number text not null references shop.products(product_number),
  qty_delta      numeric(18,3) not null,
  type           text not null check (type in ('sale','receipt','count','waste','adjust')),
  cost_basis     numeric(18,4),
  ref_type       text,                 -- 'receipt' | 'voucher' | 'recon'
  ref_id         text,
  note           text,
  created_by     text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_stock_movements_product on shop.stock_movements(product_number, created_at);

-- Goods receipt (móttaka) header — one per incoming supplier invoice/delivery.
create table if not exists acc.goods_receipts (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid references acc.suppliers(id),
  supplier_name  text,
  invoice_number text,
  invoice_date   date,
  due_date       date,
  source         text not null default 'manual' check (source in ('peppol','pdf','manual')),
  currency       text not null default 'ISK',
  status         text not null default 'draft' check (status in ('draft','received','booked')),
  voucher_id     uuid references acc.vouchers(id),
  total_net      numeric(18,2),
  total_vat      numeric(18,2),
  total_gross    numeric(18,2),
  note           text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_goods_receipts_status on acc.goods_receipts(status, created_at desc);
-- Source document (UBL XML or PDF) kept on the receipt → becomes the fylgiskjal on booking.
alter table acc.goods_receipts add column if not exists doc_bytes bytea;
alter table acc.goods_receipts add column if not exists doc_name text;
alter table acc.goods_receipts add column if not exists doc_mime text;

create table if not exists acc.goods_receipt_lines (
  id                     uuid primary key default gen_random_uuid(),
  receipt_id             uuid not null references acc.goods_receipts(id) on delete cascade,
  line_no                int not null,
  supplier_item_id       text,
  gtin                   text,
  description            text,
  invoiced_qty           numeric(18,3) not null default 0,
  unit_code              text,
  unit_price             numeric(18,4),
  line_net               numeric(18,2),
  vat_rate               numeric(5,2),
  matched_product_number text references shop.products(product_number),
  received_qty           numeric(18,3),
  created_at             timestamptz not null default now()
);
create index if not exists idx_grl_receipt on acc.goods_receipt_lines(receipt_id);

-- Learned supplier-item → product map (so the next delivery auto-matches).
create table if not exists acc.supplier_items (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid not null references acc.suppliers(id) on delete cascade,
  match_key      text not null,            -- normalized gtin or supplier item id
  product_number text not null references shop.products(product_number),
  created_at     timestamptz not null default now(),
  unique (supplier_id, match_key)
);

create or replace function acc.touch_goods_receipt() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_goods_receipts_touch on acc.goods_receipts;
create trigger trg_goods_receipts_touch before update on acc.goods_receipts
  for each row execute function acc.touch_goods_receipt();
