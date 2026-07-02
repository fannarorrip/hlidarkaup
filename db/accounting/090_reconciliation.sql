-- Afstemming (reconciliation) records. A reconciliation captures, at a point in
-- time, a comparison between the ledger and an external figure (bank statement /
-- physical count), plus which ledger entries are "cleared". Save/resume.
set search_path = acc, public;

create table if not exists acc.reconciliations (
  id                uuid primary key default gen_random_uuid(),
  recon_type        text not null,                 -- 'bank' | 'ar' | 'inventory'
  account_number    text,                          -- ledger account being reconciled (bank)
  as_of_date        date not null,
  statement_balance numeric(18,2),                 -- bank/external figure
  ledger_balance    numeric(18,2),                 -- ledger figure snapshot at save
  difference        numeric(18,2),
  cleared           bigint[] not null default '{}',-- ledger_entry ids ticked as cleared
  status            text not null default 'open',  -- 'open' | 'done'
  note              text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  created_by        text
);
create index if not exists idx_reconciliations_lookup on acc.reconciliations(recon_type, account_number, status);
