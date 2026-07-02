-- Hlíðarkaup — purchase orders (innkaupapantanir) + safety-stock / reorder fields.
-- A PO is created (often from low-stock suggestions), sent to a birgir (PDF/email or inExchange),
-- then fulfilled through the existing Móttaka (goods receipt). Apply after 240_held_sales.sql.
set search_path = acc, public;

alter table shop.products
  add column if not exists reorder_point      numeric,                       -- öryggisbirgðir
  add column if not exists reorder_qty         numeric,                       -- tillaga að pöntunarmagni
  add column if not exists preferred_supplier_id uuid references acc.suppliers(id);

create sequence if not exists acc.po_number_seq;

create table if not exists acc.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  po_number     text not null,                 -- 'P-000001'
  supplier_id   uuid references acc.suppliers(id),
  supplier_name text,
  status        text not null default 'draft', -- draft | sent | received | cancelled
  note          text,
  total_est     numeric not null default 0,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  sent_via      text,                           -- 'email' | 'inexchange' | null
  created_by    text
);
create index if not exists idx_po_status on acc.purchase_orders(status, created_at desc);

create table if not exists acc.purchase_order_lines (
  id              uuid primary key default gen_random_uuid(),
  po_id           uuid not null references acc.purchase_orders(id) on delete cascade,
  line_no         int not null,
  product_number  text,
  name            text not null,
  qty             numeric not null,
  unit_cost_est   numeric not null default 0
);
create index if not exists idx_po_lines_po on acc.purchase_order_lines(po_id);
