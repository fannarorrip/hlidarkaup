-- Track Arion card transactions already booked to the ledger, so re-fetching + re-booking
-- never double-posts. One row per bank card transaction id.
set search_path = acc, public;

create table if not exists acc.card_transactions (
  id                   uuid primary key default gen_random_uuid(),
  card_transaction_id  text unique not null,
  voucher_id           uuid references acc.vouchers(id),
  tx_date              date,
  amount               numeric,
  merchant             text,
  masked_pan           text,
  created_at           timestamptz not null default now()
);
