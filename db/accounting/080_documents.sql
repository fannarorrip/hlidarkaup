-- Source documents (fylgiskjöl) — the original PDF/scan behind a voucher.
-- Stored as bytea so they travel with the nightly pg_dump (Lög 145/1994 / Rgl 505/2013
-- require retaining source documents for 7 years). One voucher may have one document.
set search_path = acc, public;

create table if not exists acc.documents (
  id          uuid primary key default gen_random_uuid(),
  voucher_id  uuid references acc.vouchers(id),
  filename    text,
  mime        text not null default 'application/pdf',
  byte_size   int,
  bytes       bytea not null,
  created_at  timestamptz default now(),
  created_by  text
);
create index if not exists idx_documents_voucher on acc.documents(voucher_id);
