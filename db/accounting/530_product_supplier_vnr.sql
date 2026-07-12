-- Vörunúmer birgja: the preferred supplier's own item number for a product, shown on the
-- product and carried onto order lines so a pöntun speaks the birgi's language. Populated
-- from the gold price lists / order templates (deploy/tie-products-to-suppliers.js) and kept
-- current by Móttaka + the product editor. preferred_supplier_id already exists (250_*).
set search_path = shop, public;

alter table shop.products add column if not exists supplier_item_no text;

comment on column shop.products.supplier_item_no is 'Vörunúmer hjá völdum birgi (preferred_supplier_id) — birgjans eigin vörunúmer.';

-- Speeds up "products without a birgi" filtering + supplier grouping in innkaup.
create index if not exists idx_products_preferred_supplier on shop.products (preferred_supplier_id) where preferred_supplier_id is not null;
