-- Hlíðarkaup — billing mode per customer + bank-claim (krafa) queue.
-- billing_mode: 'consolidated' = one monthly invoice via the month-end run (default);
--               'per_trip'     = invoice + krafa per sale, immediately.
-- acc.claims = one bank claim (greiðsluseðill/krafa) per invoice voucher. Creation at the bank
-- is GATED until Arion B2B Claims is live (ARION_CLAIMS_ENABLED); until then rows sit 'queued'.
-- Apply after 210_supplier_statements.sql.
set search_path = acc, public;

alter table shop.customers
  add column if not exists billing_mode text not null default 'consolidated';

create table if not exists acc.claims (
  id           uuid primary key default gen_random_uuid(),
  voucher_id   uuid not null unique references acc.vouchers(id),
  customer_id  uuid references shop.customers(id),
  kennitala    text,
  amount       numeric not null,
  due_date     date,
  status       text not null default 'queued',  -- queued | created | failed | paid | cancelled
  arion_ref    text,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index if not exists idx_claims_status on acc.claims(status, created_at desc);
