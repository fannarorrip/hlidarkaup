-- Innkaup heartbeat: the old store's operational knowledge, structured.
-- (a) order_schedule  — the weekday ordering rhythm ("Í dag pantast: Arna fyrir kl 9 …")
-- (b) order_templates — per-supplier order forms (vnr + name + default qty) incl. par levels
-- (c) pricing_rules   — per-category álagning rules (mjólk 1.15–1.33, tóbak ×1.525+…, o.s.frv.)
-- (d) suppliers.freight_rule — which suppliers we pay freight for, and how it's computed
-- Seeded from the old store's documents (see deploy/seed-store-data/) — sources tracked per row.
set search_path = acc, public;

create table if not exists acc.order_schedule (
  id            uuid primary key default gen_random_uuid(),
  weekday       int not null check (weekday between 1 and 7),   -- 1 = mánudagur
  supplier_name text not null,
  supplier_id   uuid references acc.suppliers(id),              -- linked when birgjar are registered
  deadline      time,                                           -- panta fyrir kl.
  note          text,                                           -- afhending, sérreglur
  source        text,                                           -- which old document this came from
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (weekday, supplier_name)
);

create table if not exists acc.order_templates (
  id            uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  supplier_id   uuid references acc.suppliers(id),
  name          text not null,                                  -- e.g. "Vikupöntun", "Helgarpöntun"
  note          text,
  source        text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (supplier_name, name)
);

create table if not exists acc.order_template_lines (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references acc.order_templates(id) on delete cascade,
  line_no        int not null,
  vnr            text,                                          -- supplier's item number
  ean            text,                                          -- barcode when known
  product_number text references shop.products(product_number), -- matched to our PLU when possible
  name           text not null,
  default_qty    numeric,
  unit           text,
  min_qty        numeric,                                       -- par-level lágmark
  max_qty        numeric,                                       -- par-level hámark
  daily_rate     numeric,                                       -- dagleg velta (MS run rates)
  note           text
);
create index if not exists order_template_lines_tmpl_idx on acc.order_template_lines(template_id, line_no);

create table if not exists acc.pricing_rules (
  id             uuid primary key default gen_random_uuid(),
  category       text not null unique,                          -- e.g. 'mjólk', 'gosdós', 'tóbak'
  rule           text not null,                                 -- human-readable description
  multiplier_min numeric,
  multiplier_max numeric,
  rounding       text,                                          -- e.g. 'upp í næsta tug +20kr'
  source         text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table acc.suppliers add column if not exists freight_rule text;  -- e.g. '17% af reikningi'
