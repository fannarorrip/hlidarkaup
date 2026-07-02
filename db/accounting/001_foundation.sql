-- Hlíðarkaup accounting system — FOUNDATION SCHEMA
-- Target: PostgreSQL 14+
-- Compliance basis: Lög 145/1994, Rgl. 50/1993, Rgl. 505/2013
--
-- Principles: double-entry · gap-free sequential numbering · immutable posted
-- records (corrections via reversal) · full audit trail · ISK · Icelandic.

create schema if not exists acc;
set search_path = acc, public;

-- Account nature (eðli reiknings):
--   eign=asset, skuld=liability, eigid_fe=equity, tekjur=revenue, gjold=expense
do $$ begin
  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type acc.account_type as enum ('eign','skuld','eigid_fe','tekjur','gjold');
  end if;
end $$;

-- VAT codes (VSK-lyklar)
create table if not exists acc.vat_codes (
  code         text primary key,                 -- 'S24','S11','S00','I24','I11'
  description  text not null,
  rate         numeric(5,2) not null,            -- 24.00, 11.00, 0.00
  direction    text not null check (direction in ('utskattur','innskattur','enginn')),
  created_at   timestamptz not null default now()
);

-- Chart of accounts (bókhaldslyklar)
create table if not exists acc.accounts (
  account_number  text primary key,              -- the lykill, e.g. '3110'
  name            text not null,
  account_type    acc.account_type not null,     -- eign/skuld/eigid_fe/tekjur/gjold
  statement       text check (statement in ('rekstur','efnahagur')),  -- P&L vs balance sheet
  parent_number   text references acc.accounts(account_number),
  vat_code        text references acc.vat_codes(code),
  vat_rate        numeric(5,2),                  -- 24.00/11.00/0.00 (from chart)
  rsk_code        text,                          -- RSK skattlykill (tax-return mapping)
  rsk_desc        text,                          -- skattlykill lýsing
  posting_text    text,                          -- default færslutexti
  child_range     text,                          -- 'Lyklar yfirlykils' for header accounts
  is_postable     boolean not null default true,  -- false = header/group account
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_accounts_parent on acc.accounts(parent_number);
create index if not exists idx_accounts_type   on acc.accounts(account_type);

-- Document/numbering series — a counter table (NOT a Postgres sequence) because
-- sequences can leave gaps on rollback; accounting requires no gaps (50/1993 gr. 4).
create table if not exists acc.voucher_series (
  series_code  text primary key,                 -- 'JOURNAL','SALES','CREDIT','KASSI','PURCHASE'
  description  text not null,
  prefix       text not null default '',
  next_number  bigint not null default 1
);

-- Accounting periods (uppgjörstímabil) — Icelandic VSK is bi-monthly
create table if not exists acc.periods (
  id          int generated always as identity primary key,
  year        int not null,
  period_no   int not null,                      -- 1..6 (bi-monthly) or 1..12
  starts_on   date not null,
  ends_on     date not null,
  is_closed   boolean not null default false,
  closed_at   timestamptz,
  closed_by   text,
  unique (year, period_no)
);

-- Vouchers (fylgiskjöl) — one per accounting event
create table if not exists acc.vouchers (
  id                     uuid primary key default gen_random_uuid(),
  series_code            text not null references acc.voucher_series(series_code),
  voucher_number         bigint,                 -- assigned at posting (gap-free)
  voucher_date           date not null,
  voucher_type           text not null,          -- journal/sales_invoice/credit_note/cash_sale/purchase/payment/receipt/reversal
  description            text,
  external_reference     text,                   -- UniqueReference / order id
  status                 text not null default 'draft'
                           check (status in ('draft','posted','reversed')),
  reverses_voucher_id    uuid references acc.vouchers(id),  -- this is a reversal OF ...
  reversed_by_voucher_id uuid references acc.vouchers(id),  -- ... and the original points here
  created_at             timestamptz not null default now(),
  created_by             text,
  posted_at              timestamptz,
  posted_by              text,
  unique (series_code, voucher_number)
);
create index if not exists idx_vouchers_date   on acc.vouchers(voucher_date);
create index if not exists idx_vouchers_status on acc.vouchers(status);
create index if not exists idx_vouchers_type   on acc.vouchers(voucher_type);

-- Ledger entries (færslur) — append-only double-entry lines
create table if not exists acc.ledger_entries (
  id             bigint generated always as identity primary key,
  voucher_id     uuid not null references acc.vouchers(id),
  line_no        int not null,
  account_number text not null references acc.accounts(account_number),
  debit          numeric(18,2) not null default 0 check (debit  >= 0),
  credit         numeric(18,2) not null default 0 check (credit >= 0),
  vat_code       text references acc.vat_codes(code),
  description    text,
  -- each line is either a debit or a credit, never both, never neither
  constraint debit_xor_credit check ((debit = 0) <> (credit = 0)),
  unique (voucher_id, line_no)
);
create index if not exists idx_ledger_account on acc.ledger_entries(account_number);
create index if not exists idx_ledger_voucher on acc.ledger_entries(voucher_id);

-- Audit log (append-only) — Rgl. 505/2013: who / when / what
create table if not exists acc.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id     text,
  action      text not null,                     -- 'post_voucher','reverse_voucher',...
  entity      text,
  entity_id   text,
  details     jsonb
);
create index if not exists idx_audit_when on acc.audit_log(occurred_at);
create index if not exists idx_audit_ent  on acc.audit_log(entity, entity_id);
