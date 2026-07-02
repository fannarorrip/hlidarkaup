-- Arion audit hardening (2026-07): give every settlement path the same hard double-posting
-- backstop the statement table already has, plus schema consistency fixes.
set search_path = acc, public;

-- One voucher per booked card transaction / settled payable / paid claim (partial unique).
create unique index if not exists card_transactions_voucher_uk on acc.card_transactions (voucher_id) where voucher_id is not null;
create unique index if not exists payables_payment_voucher_uk on acc.payables (payment_voucher_id) where payment_voucher_id is not null;
create unique index if not exists claims_payment_voucher_uk on acc.claims (payment_voucher_id) where payment_voucher_id is not null;

-- claims.status gets the CHECK its siblings have. 'sending' added for the two-phase send.
alter table acc.claims drop constraint if exists claims_status_check;
alter table acc.claims add constraint claims_status_check
  check (status in ('queued','sending','created','failed','paid','cancelled'));

-- A bank claim reference should never be duplicated across rows.
create unique index if not exists claims_arion_ref_uk on acc.claims (arion_ref) where arion_ref is not null;

-- Consistent money types (bare numeric → numeric(18,2)).
alter table acc.claims alter column amount type numeric(18,2);
alter table acc.card_transactions alter column amount type numeric(18,2);

-- Kröfusnið codes must be unique (they're bank-assigned identifiers).
create unique index if not exists collection_profiles_code_uk on acc.collection_profiles (code);
