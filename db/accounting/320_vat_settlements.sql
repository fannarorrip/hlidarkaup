-- VSK-uppgjör: one row per VAT period that has been settled to the ledger, so a period can be
-- booked at most once. The settlement voucher clears the period's útskattur/innskattur into
-- 9535 (Uppgjörsreikningur VSK). period_key = 'YYYY-P'.
set search_path = acc, public;

create table if not exists acc.vat_settlements (
  id           uuid primary key default gen_random_uuid(),
  period_key   text unique not null,
  year         int not null,
  period       int not null,
  period_from  date,
  period_to    date,
  output_vat   numeric(18,2) not null default 0,
  input_vat    numeric(18,2) not null default 0,
  net          numeric(18,2) not null default 0,
  voucher_id   uuid references acc.vouchers(id),
  settled_at   timestamptz not null default now()
);
