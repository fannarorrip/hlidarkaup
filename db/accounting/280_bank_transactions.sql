-- Bank-account statement lines fetched from Arion PSD2 (Berlin Group /accounts/{id}/transactions).
-- One row per bank transaction; deduped on (account_id, entry_reference) so re-fetching a window
-- never duplicates. voucher_id is set once the line is booked to the ledger (mirrors acc.card_transactions).
set search_path = acc, public;

create table if not exists acc.bank_transactions (
  id                uuid primary key default gen_random_uuid(),
  account_id        text not null,                 -- Arion PSD2 resourceId of the account
  iban              text,
  entry_reference   text not null,                 -- bank's transactionId / entryReference (dedup key)
  booking_date      date,
  value_date        date,
  amount            numeric(18,2) not null,        -- SIGNED: + money in, - money out
  currency          text,
  counterparty      text,
  remittance        text,
  reference         text,
  ledger_account    text references acc.accounts(account_number),  -- the bank lykill (e.g. 7830)
  contra_account    text references acc.accounts(account_number),  -- the other side when booked
  voucher_id        uuid references acc.vouchers(id),
  status            text not null default 'unmatched'
                      check (status in ('unmatched','booked','ignored')),
  created_at        timestamptz not null default now(),
  unique (account_id, entry_reference)
);

create index if not exists bank_transactions_status_idx on acc.bank_transactions (status, booking_date);
create index if not exists bank_transactions_account_idx on acc.bank_transactions (account_id, booking_date);
-- Hard backstop: one bank line can map to at most one voucher (guards against double-posting even
-- outside bookBankTransaction).
create unique index if not exists bank_transactions_voucher_uk on acc.bank_transactions (voucher_id) where voucher_id is not null;
