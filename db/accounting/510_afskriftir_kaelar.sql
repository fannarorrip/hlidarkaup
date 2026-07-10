-- (G) Afskriftaskráning: scan → reason → stock decremented (movement type 'waste') + a
--     per-supplier credit list (Mata/Myllan/Ísfugl/Gæðabakstur credit write-offs back).
--     No ledger entry — purchases are expensed at receipt (periodic inventory); rýrnun
--     shows up via inventory counts, and supplier credits arrive as normal credit invoices.
-- (H) Kælaaflestur: daily HACCP temperature log per cooling unit (heilbrigðiseftirlit).
--     Units seeded from the old store's aflesturkæla sheet (17 real units).
set search_path = acc, public;

create table if not exists acc.write_offs (
  id             uuid primary key default gen_random_uuid(),
  product_number text references shop.products(product_number),
  product_name   text not null,
  qty            numeric not null check (qty > 0),
  unit_cost      numeric,                            -- cost snapshot for the credit claim
  reason         text not null check (reason in ('útrunnið','skemmt','rýrnun','annað')),
  supplier_name  text,
  note           text,
  status         text not null default 'recorded' check (status in ('recorded','credited')),
  created_by     text,
  created_at     timestamptz not null default now(),
  credited_at    timestamptz
);
create index if not exists write_offs_status_idx on acc.write_offs(status, created_at desc);
create index if not exists write_offs_supplier_idx on acc.write_offs(supplier_name) where status = 'recorded';

create table if not exists acc.fridge_units (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  kind      text not null check (kind in ('kælir','frystir')),
  min_temp  numeric not null,
  max_temp  numeric not null,
  sort      int not null default 100,
  is_active boolean not null default true
);

create table if not exists acc.temp_readings (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references acc.fridge_units(id) on delete cascade,
  reading_date date not null default current_date,
  reading      numeric not null,
  ok           boolean not null,
  note         text,
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists temp_readings_date_idx on acc.temp_readings(reading_date desc, unit_id);

-- Seed the 17 units from the old store's aflesturkæla.xlsx (kælar 0–4°C, frystar −25…−18°C).
insert into acc.fridge_units (name, kind, min_temp, max_temp, sort) values
  ('Kjötborð',          'kælir',   0,  4, 10),
  ('Ostakælir',         'kælir',   0,  4, 20),
  ('Samlokukælir',      'kælir',   0,  4, 30),
  ('Grænmetisborð',     'kælir',   0,  8, 40),
  ('Brauð frystir',     'frystir', -25, -18, 50),
  ('Mjólkurkælir',      'kælir',   0,  4, 60),
  ('Djúpf. Vest.',      'frystir', -25, -18, 70),
  ('Djúpf. Stóru',      'frystir', -25, -18, 80),
  ('Kæliklefi (Osta)',  'kælir',   0,  4, 90),
  ('Völlu frystir',     'frystir', -25, -18, 100),
  ('Grænmeti',          'kælir',   0,  8, 110),
  ('Emmessís Suður',    'frystir', -25, -18, 120),
  ('Emmessís Norður',   'frystir', -25, -18, 130),
  ('Kjörís Suður',      'frystir', -25, -18, 140),
  ('Kjörís Norður',     'frystir', -25, -18, 150),
  ('Emmessís Sjoppa',   'frystir', -25, -18, 160),
  ('Kjörís Sjoppa',     'frystir', -25, -18, 170)
on conflict (name) do nothing;
