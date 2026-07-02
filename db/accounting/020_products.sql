-- Hlíðarkaup — PRODUCTS / CATALOG (replaces Regla as the product master)
-- Schema `shop`. Apply after the accounting foundation. Target PostgreSQL 14+.

create schema if not exists shop;
create extension if not exists pg_trgm;
set search_path = shop, public;

create table if not exists shop.products (
  product_number       text primary key,            -- Regla ProductNumber
  regla_id             bigint,                       -- Regla internal ID (provenance)
  name                 text not null,
  description          text,
  unit_price_net       numeric(18,4) not null default 0,   -- net price (Regla UnitPrice)
  vat_key              text,                         -- Regla VatDefinition.Key (e.g. 'U2')
  vat_rate             numeric(5,2) not null default 24,
  price_gross          integer generated always as (round(unit_price_net * (1 + vat_rate / 100))::integer) stored,
  stock_quantity       numeric(18,3) not null default 0,
  is_stock_controlled  boolean not null default false,
  product_group        text,
  unit_code            text,                         -- e.g. 'C62' (each), scale units
  use_scale            boolean not null default false,
  allow_discount       boolean not null default false,
  is_active            boolean not null default true,
  source               text not null default 'regla',
  synced_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_products_group on shop.products(product_group);
create index if not exists idx_products_name_trgm on shop.products using gin (name gin_trgm_ops);

-- One product can have several barcodes (strikamerki). Regla's product object does
-- NOT expose barcodes, so these come from the curated product list / barcode export.
create table if not exists shop.product_barcodes (
  barcode         text primary key,
  product_number  text not null references shop.products(product_number) on delete cascade,
  created_at      timestamptz not null default now()
);
create index if not exists idx_barcodes_product on shop.product_barcodes(product_number);

create or replace function shop.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_products_touch on shop.products;
create trigger trg_products_touch before update on shop.products
  for each row execute function shop.touch_updated_at();
