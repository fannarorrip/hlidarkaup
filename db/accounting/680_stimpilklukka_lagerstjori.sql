-- Stimpilklukka + persónulegir PIN-kóðar + lagerstjóra-hlutverkið.
--  • lagerstjori: nýtt hlutverk — allt sölukerfið/lagerinn + tímar starfsmanna.
--  • acc.employees.pin: persónulegur 4-stafa kóði starfsmanns — opnar kassann (2026 aflagt),
--    stimplar inn/út og merkir sölur viðkomandi. Úthlutast sjálfkrafa, má breyta.
--  • acc.time_entries: stimplanir (inn/út per starfsmann per kassa). Aðeins EIN opin stimplun
--    (clock_out is null) per starfsmann í einu.
--  • acc.voucher_employee: hver sala tengd afgreiðslumanni — afkastayfirlit per starfsmann.
set search_path = acc, public;

alter table shop.staff drop constraint if exists staff_role_check;
alter table shop.staff add constraint staff_role_check
  check (role in ('stjornandi','bokari','afgreidsla','eldhus','lagerstjori'));

alter table acc.employees add column if not exists pin text unique
  check (pin is null or pin ~ '^[0-9]{4}$');

create table if not exists acc.time_entries (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references acc.employees(id),
  register_id text,
  clock_in    timestamptz not null default now(),
  clock_out   timestamptz,
  edited_by   text,                        -- handvirk leiðrétting (hver + hvenær í updated_at)
  updated_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in)
);
create index if not exists idx_time_entries_emp on acc.time_entries(employee_id, clock_in desc);
create unique index if not exists time_entries_open_uk on acc.time_entries(employee_id) where clock_out is null;

create table if not exists acc.voucher_employee (
  voucher_id  uuid primary key references acc.vouchers(id),
  employee_id uuid not null references acc.employees(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_voucher_employee_emp on acc.voucher_employee(employee_id, created_at desc);
