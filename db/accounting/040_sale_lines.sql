-- Sale line items (for receipts/kvittun). The ledger only keeps VAT-rate totals,
-- so the per-product lines of each sale are recorded here, linked to the voucher.
create schema if not exists shop;
set search_path = shop, public;

create table if not exists shop.sale_lines (
  id               bigint generated always as identity primary key,
  voucher_id       uuid not null references acc.vouchers(id),
  line_no          int not null,
  product_number   text,
  name             text not null,
  quantity         numeric(18,3) not null default 1,
  unit_price_gross numeric(18,2) not null default 0,
  line_total       numeric(18,2) not null default 0,
  vat_rate         numeric(5,2)  not null default 24,
  unique (voucher_id, line_no)
);
create index if not exists idx_sale_lines_voucher on shop.sale_lines(voucher_id);
