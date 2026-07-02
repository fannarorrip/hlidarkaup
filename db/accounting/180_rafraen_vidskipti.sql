-- Hlíðarkaup — RAFRÆN VIÐSKIPTI flag on customers.
-- Customers flagged here get their sölureikningar sent as electronic invoices (inExchange).
-- Sending requires a kennitala (rafræn beining er á kennitölu). Apply after 170_inexchange_uuid.sql.
set search_path = shop, public;

alter table shop.customers
  add column if not exists rafraen_vidskipti boolean not null default false;

comment on column shop.customers.rafraen_vidskipti is
  'Viðskiptamaður fær rafræna reikninga (inExchange). Krefst kennitölu fyrir sendingu.';
