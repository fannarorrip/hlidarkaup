-- Learned categorization: merchant/counterparty → bókhaldslykill. Every time the accountant
-- books a card transaction or bank-statement line to an account, the mapping is remembered
-- and pre-fills the next transaction from the same counterparty ("kerfið lærir").
set search_path = acc, public;

create table if not exists acc.tx_account_rules (
  match_key      text primary key,   -- lower(unaccent(trim(merchant/counterparty)))
  account_number text not null references acc.accounts(account_number),
  hits           int not null default 1,
  updated_at     timestamptz not null default now()
);
