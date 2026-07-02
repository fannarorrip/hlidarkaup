-- Hlíðarkaup — supplier returns (skil til birgja). Reverses a purchase: credit vörukaup +
-- innskattur, debit Lánadrottnar 9300 (lowers what we owe), and decrement stock. A skilanóta
-- document can be sent to the birgir. Apply after 250_purchase_orders.sql.
set search_path = acc, public;

create sequence if not exists acc.sr_number_seq;

create table if not exists acc.supplier_returns (
  id            uuid primary key default gen_random_uuid(),
  return_number text not null,                 -- 'SK-000001'
  supplier_id   uuid references acc.suppliers(id),
  supplier_name text,
  voucher_id    uuid references acc.vouchers(id),
  total         numeric not null default 0,    -- gross
  note          text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  sent_via      text,
  created_by    text
);

create table if not exists acc.supplier_return_lines (
  id              uuid primary key default gen_random_uuid(),
  return_id       uuid not null references acc.supplier_returns(id) on delete cascade,
  line_no         int not null,
  product_number  text,
  name            text not null,
  qty             numeric not null,
  unit_cost       numeric not null default 0,  -- net unit cost
  vat_rate        numeric not null default 0
);
create index if not exists idx_supplier_return_lines on acc.supplier_return_lines(return_id);
