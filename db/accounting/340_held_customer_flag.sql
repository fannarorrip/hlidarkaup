-- Held till sales: remember whether the parked sale's customer is an ACCOUNT customer, so a
-- recalled sale can't enable "Á reikning" for a non-account customer (the till previously
-- assumed is_account=true for any held customer). Old rows: null → treated as false on recall.
set search_path = shop, public;

alter table shop.held_sales add column if not exists customer_is_account boolean;
