-- Dedupe key for inExchange-fetched invoices (the transaction UUID), so re-polling
-- the same transaction does not create a duplicate goods receipt.
set search_path = acc, public;
alter table acc.goods_receipts add column if not exists inexchange_uuid text;
create unique index if not exists uq_goods_receipts_inexchange on acc.goods_receipts(inexchange_uuid) where inexchange_uuid is not null;
