-- Samstillingar: editable defaults for the bankatenging module (were previously hardcoded /
-- .env-only). Single row. FKs to acc.accounts guarantee the chosen lyklar exist. Consumed by the
-- card-booking route (liability default), the statement/payables UIs (contra + bank prefills).
set search_path = acc, public;

create table if not exists acc.bank_settings (
  id                     int primary key default 1 check (id = 1),
  card_liability_account text not null default '9310' references acc.accounts(account_number),   -- Visa skuld
  card_expense_account   text references acc.accounts(account_number),   -- default gjaldalykill for card purchases
  default_bank_ledger    text references acc.accounts(account_number),   -- primary bank lykill (t.d. 7830)
  statement_contra_in    text references acc.accounts(account_number),   -- default mótlykill for money IN (t.d. 7600)
  statement_contra_out   text references acc.accounts(account_number),   -- default mótlykill for money OUT (t.d. 9300)
  auto_sync              boolean not null default false,                 -- preference: nightly sync (read by a server cron)
  updated_at             timestamptz not null default now()
);
insert into acc.bank_settings (id) values (1) on conflict do nothing;
