-- Hlíðarkaup — CUSTOMERS (viðskiptamenn). One shared register for sölukerfi + bókhald.
-- Apply after 020_products.sql.

create schema if not exists shop;
create extension if not exists pg_trgm;
set search_path = shop, public;

create table if not exists shop.customers (
  id                 uuid primary key default gen_random_uuid(),
  customer_number    text unique,                 -- optional human-friendly number
  kennitala          text,                        -- 10-digit (nullable for anonymous/web)
  name               text not null,
  address            text,
  postal_code        text,
  city               text,
  phone              text,
  email              text,
  payment_terms_days int not null default 0,      -- 0 = staðgreitt
  is_account         boolean not null default false, -- may buy "á reikning"
  is_active          boolean not null default true,
  ar_account         text references acc.accounts(account_number) default '7600', -- viðskiptakröfur
  is_generic         boolean not null default false, -- the anonymous web/kassi customer
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_customers_name_trgm on shop.customers using gin (name gin_trgm_ops);
create unique index if not exists uq_customers_kennitala on shop.customers(kennitala) where kennitala is not null;

create or replace function shop.touch_customer_updated() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_customers_touch on shop.customers;
create trigger trg_customers_touch before update on shop.customers
  for each row execute function shop.touch_customer_updated();

-- Link vouchers to a customer (for account sales / receivables). Nullable = anonymous.
alter table acc.vouchers add column if not exists customer_id uuid references shop.customers(id);
create index if not exists idx_vouchers_customer on acc.vouchers(customer_id);

-- The generic anonymous customer used for web/kassi card sales.
insert into shop.customers (name, is_generic, kennitala)
select 'Almenn sala (vefur/kassi)', true, '4944803579'
where not exists (select 1 from shop.customers where is_generic);
