-- Hlíðarkaup — month-end consolidated billing run for 'consolidated' account customers.
-- Individual account sales already post the receivables (debit AR) at sale time; this run does
-- NOT post new ledger vouchers (that would double-count AR). It produces ONE consolidated invoice
-- document per customer (grouped by shopping trip) + ONE krafa, and marks the included sales billed
-- so they're never re-billed. Apply after 220_billing_mode_claims.sql.
set search_path = acc, public;

create table if not exists acc.billing_runs (
  id            uuid primary key default gen_random_uuid(),
  period        text not null,                 -- 'YYYY-MM'
  from_date     date not null,
  to_date       date not null,
  invoice_count int  not null default 0,
  total         numeric not null default 0,
  created_at    timestamptz not null default now(),
  created_by    text
);

create sequence if not exists acc.billing_invoice_seq;

create table if not exists acc.billing_invoices (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid references acc.billing_runs(id),
  invoice_number  text not null,                -- 'M-000001'
  customer_id     uuid references shop.customers(id),
  kennitala       text,
  customer_name   text,
  period          text not null,
  trip_count      int not null default 0,
  total           numeric not null default 0,
  detail          jsonb,                        -- [{voucherId,date,series_code,voucher_number,total,lines:[...]}]
  delivery        text,                         -- 'einvoice' | 'pdf' | 'none'
  delivery_status text not null default 'queued',
  claim_status    text not null default 'queued',
  created_at      timestamptz not null default now()
);
create index if not exists idx_billing_invoices_customer on acc.billing_invoices(customer_id, created_at desc);

-- A sale belongs to at most one consolidated invoice (unique = billed once).
create table if not exists acc.billing_invoice_vouchers (
  billing_invoice_id uuid not null references acc.billing_invoices(id) on delete cascade,
  voucher_id         uuid not null unique references acc.vouchers(id)
);
