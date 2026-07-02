-- Launakerfi (payroll). Computes Icelandic wages/deductions/employer costs and
-- posts each run to the acc ledger (like Innkaup). Statutory rates live in an
-- editable per-year table so yearly changes are a one-row insert, not a code change.
set search_path = acc, public;

-- Per-year statutory rates (staðgreiðsla þrep, persónuafsláttur, tryggingagjald + defaults).
create table if not exists acc.payroll_tax_config (
  year                         int primary key,
  personal_credit_monthly      numeric(18,2) not null,   -- persónuafsláttur á mánuði
  bracket1_limit               numeric(18,2) not null,   -- efri mörk 1. þreps (mánaðarlega)
  bracket1_rate                numeric(6,3)  not null,   -- % (tekjuskattur + útsvar)
  bracket2_limit               numeric(18,2) not null,   -- efri mörk 2. þreps
  bracket2_rate                numeric(6,3)  not null,
  bracket3_rate                numeric(6,3)  not null,
  tryggingagjald_rate          numeric(6,3)  not null,   -- % (launagreiðandi)
  default_pension_employee_pct numeric(6,3)  not null default 4,
  default_pension_employer_pct numeric(6,3)  not null default 11.5,
  default_vacation_pct         numeric(6,3)  not null default 10.17,
  updated_at                   timestamptz   not null default now()
);

-- 2026 rates (confirmed from skatturinn.is, 2025-12-22 announcement).
insert into acc.payroll_tax_config
  (year, personal_credit_monthly, bracket1_limit, bracket1_rate, bracket2_limit, bracket2_rate, bracket3_rate, tryggingagjald_rate)
values (2026, 72492, 498122, 31.49, 1398450, 37.99, 46.29, 6.35)
on conflict (year) do nothing;

-- Payroll register (launþegar) — distinct from shop.staff (login accounts).
create table if not exists acc.employees (
  id                           uuid primary key default gen_random_uuid(),
  kennitala                    text unique not null,
  name                         text not null,
  email                        text,
  phone                        text,
  address                      text,
  bank_account                 text,                       -- til útgreiðslu nettólauna
  employment_type              text not null default 'salary' check (employment_type in ('salary','hourly')),
  monthly_salary               numeric(18,2) not null default 0,
  hourly_rate                  numeric(18,2) not null default 0,
  personal_credit_pct          numeric(6,3)  not null default 100,   -- nýting persónuafsláttar hér (0–100)
  pension_fund                 text,
  pension_employee_pct         numeric(6,3)  not null default 4,
  pension_employer_pct         numeric(6,3)  not null default 11.5,
  private_pension_employee_pct numeric(6,3)  not null default 0,     -- séreignarsparnaður
  private_pension_employer_pct numeric(6,3)  not null default 0,     -- mótframlag séreignar (oft 2%)
  union_name                   text,                         -- stéttarfélag
  union_dues_pct               numeric(6,3)  not null default 0,     -- félagsgjald (launþegi)
  union_employer_pct           numeric(6,3)  not null default 0,     -- launagreiðandi í sjóði (sjúkra/orlofs/starfsmennt)
  vacation_pct                 numeric(6,3)  not null default 10.17, -- orlof
  orlof_method                 text not null default 'accrue' check (orlof_method in ('accrue','payout')),
  staff_email                  text references shop.staff(email),
  is_active                    boolean not null default true,
  start_date                   date,
  end_date                     date,
  created_at                   timestamptz   not null default now(),
  updated_at                   timestamptz   not null default now()
);
create index if not exists idx_employees_active on acc.employees(is_active);

-- One payroll run per period (month).
create table if not exists acc.payroll_runs (
  id                   uuid primary key default gen_random_uuid(),
  year                 int not null,
  month                int not null check (month between 1 and 12),
  pay_date             date not null,
  status               text not null default 'draft' check (status in ('draft','posted')),
  voucher_id           uuid references acc.vouchers(id),
  total_gross          numeric(18,2) not null default 0,
  total_tax            numeric(18,2) not null default 0,
  total_pension        numeric(18,2) not null default 0,
  total_net            numeric(18,2) not null default 0,
  total_tryggingagjald numeric(18,2) not null default 0,
  note                 text,
  created_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_payroll_runs_period on acc.payroll_runs(year, month);

-- One line per employee per run (full computed breakdown + snapshot).
create table if not exists acc.payroll_lines (
  id                   uuid primary key default gen_random_uuid(),
  run_id               uuid not null references acc.payroll_runs(id) on delete cascade,
  employee_id          uuid references acc.employees(id),
  employee_name        text not null,
  kennitala            text,
  hours                numeric(10,2),
  gross                numeric(18,2) not null default 0,
  taxable              numeric(18,2) not null default 0,
  income_tax           numeric(18,2) not null default 0,
  personal_credit_used numeric(18,2) not null default 0,
  pension_employee     numeric(18,2) not null default 0,
  pension_employer     numeric(18,2) not null default 0,
  private_employee     numeric(18,2) not null default 0,
  private_employer     numeric(18,2) not null default 0,
  union_dues           numeric(18,2) not null default 0,
  union_employer       numeric(18,2) not null default 0,
  tryggingagjald       numeric(18,2) not null default 0,
  vacation_accrual     numeric(18,2) not null default 0,
  net_pay              numeric(18,2) not null default 0,
  breakdown            jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists idx_payroll_lines_run on acc.payroll_lines(run_id);

create or replace function acc.touch_payroll_updated() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_employees_touch on acc.employees;
create trigger trg_employees_touch before update on acc.employees
  for each row execute function acc.touch_payroll_updated();
drop trigger if exists trg_payroll_runs_touch on acc.payroll_runs;
create trigger trg_payroll_runs_touch before update on acc.payroll_runs
  for each row execute function acc.touch_payroll_updated();

-- Gap-free voucher series for payroll runs (prefix L).
insert into acc.voucher_series(series_code, description, prefix, next_number)
values ('PAYROLL', 'Launakeyrsla', 'L', 1)
on conflict (series_code) do nothing;
