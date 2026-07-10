-- Monthly consolidated claims: a krafa can now come from a month-end billing invoice
-- (which groups many vouchers) instead of a single sale voucher. Adds a dedicated
-- kröfunúmer sequence for those (per-trip claims keep using the voucher number).
set search_path = acc, public;

create sequence if not exists acc.claim_number_seq start 100000;  -- 6-digit kröfunúmer for monthly claims

alter table acc.claims
  add column if not exists claim_number bigint,                               -- kröfunúmer for billing-invoice claims
  add column if not exists billing_invoice_id uuid references acc.billing_invoices(id);

-- A month-end claim has no single voucher.
alter table acc.claims alter column voucher_id drop not null;

-- One claim per monthly invoice; kröfunúmer unique where set.
create unique index if not exists idx_claims_billing_invoice on acc.claims(billing_invoice_id) where billing_invoice_id is not null;
create unique index if not exists idx_claims_number on acc.claims(claim_number) where claim_number is not null;
