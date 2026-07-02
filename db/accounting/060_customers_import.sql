-- Relax unique kennitala (real register has department sub-accounts sharing a kt)
-- and tag imported rows so the import is re-runnable.
set search_path = shop, public;
drop index if exists shop.uq_customers_kennitala;
alter table shop.customers add column if not exists imported_from text;
