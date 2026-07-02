-- Z-skýrsla / dagsuppgjör: an immutable, gap-free daily till close. Snapshots the day's settlement
-- (money in per method, velta by VAT tier, útskattur, counts) at close time so it can't drift, and
-- locks the day (one Z per date). The individual sales are already in the ledger — this is a
-- summary + lock, not a new voucher.
set search_path = acc, public;

create table if not exists acc.z_reports (
  id            uuid primary key default gen_random_uuid(),
  z_number      bigint unique not null,     -- gap-free sequential (assigned under advisory lock)
  report_date   date unique not null,       -- one Z per day
  snapshot      jsonb not null,             -- the DailySettlement at close
  cash_counted  numeric(18,2),
  cash_diff     numeric(18,2),
  closed_at     timestamptz not null default now(),
  closed_by     text
);
