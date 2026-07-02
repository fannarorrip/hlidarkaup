-- Stéttarfélög (unions) as multi-line fund registers, matching Regla's model:
-- a union has several gjaldliðir (félagsgjald, sjúkrasjóður, orlofsheimilasjóður,
-- starfsmenntasjóður) each with a % and a payer, plus fixed uppbætur
-- (desemberuppbót, orlofsuppbót) paid in a specific month.
set search_path = acc, public;

create table if not exists acc.unions (
  id                 uuid primary key default gen_random_uuid(),
  code               text,                 -- e.g. '2520'
  name               text not null,
  orlof_period_start date,
  orlof_period_end   date,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create table if not exists acc.union_funds (
  id           uuid primary key default gen_random_uuid(),
  union_id     uuid not null references acc.unions(id) on delete cascade,
  line_number  text,                       -- Regla liður nr (204/412/…)
  name         text not null,
  rate_pct     numeric(6,3),               -- % of gross (null for fixed uppbætur)
  fixed_amount numeric(18,2),              -- fixed kr/ár (uppbætur; null for %-funds)
  payer        text not null default 'employer' check (payer in ('employee','employer')),
  fund_type    text not null default 'other'
                 check (fund_type in ('felagsgjald','sjukrasjodur','orlofsheimila','starfsmennt','desemberuppbot','orlofsuppbot','other')),
  pay_month    int,                        -- uppbætur month (desember=12, orlofsuppbót≈orlof start)
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_union_funds_union on acc.union_funds(union_id);

-- Employee payroll-register additions.
alter table acc.employees add column if not exists union_id uuid references acc.unions(id);
alter table acc.employees add column if not exists starfsheiti text;
alter table acc.employees add column if not exists deild text;
alter table acc.employees add column if not exists employment_ratio numeric(6,3) not null default 100;

-- Seed Hlíðarkaup's union (from the Regla "Gjöld í stéttarfélag" screen).
do $$
declare v_union uuid;
begin
  select id into v_union from acc.unions where code = '2520';
  if v_union is null then
    insert into acc.unions (code, name, orlof_period_start, orlof_period_end)
      values ('2520', 'Verslunarmannafélag Skagafjarðar', date '2026-05-01', date '2027-04-30')
      returning id into v_union;
    insert into acc.union_funds (union_id, line_number, name, rate_pct, fixed_amount, payer, fund_type, pay_month, sort) values
      (v_union, '204', 'Félagsgjald',          1.00, null,   'employee', 'felagsgjald',    null, 1),
      (v_union, '412', 'Sjúkrasjóður',         1.00, null,   'employer', 'sjukrasjodur',   null, 2),
      (v_union, '414', 'Orlofsheimilasjóður',  0.25, null,   'employer', 'orlofsheimila',  null, 3),
      (v_union, '418', 'Starfsmenntasjóður',   0.30, null,   'employer', 'starfsmennt',    null, 4),
      (v_union, '130', 'Desemberuppbót',       null, 110000, 'employer', 'desemberuppbot', 12,   5),
      (v_union, '132', 'Orlofsuppbót',         null, 62000,  'employer', 'orlofsuppbot',   5,    6);
  end if;
end $$;
