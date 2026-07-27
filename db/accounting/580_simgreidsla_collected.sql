-- Collecting old símgreiðslur that were rung up with the pre-MOTO "Símgreiðsla" button: each posted
-- a kassi_sale whose money-in was booked to 7830 (bank/millifærsla) but NO card was ever charged, so
-- the customer still owes. The collection tool charges the card now (MOTO) and posts a receipt journal
-- Dr 7716 / Cr 7830 (moves the phantom transfer to real card money; revenue untouched — counted once).
-- This table records WHICH original sales have been collected, so an order can't be charged twice and
-- drops off the "ógreiddar símgreiðslur" list. Apply after 570_customer_discount.sql.
set search_path = acc, public;

create table if not exists acc.simgreidsla_collected (
  voucher_id          uuid primary key references acc.vouchers(id),   -- the original kassi_sale (HK-…)
  journal_voucher_id  uuid not null references acc.vouchers(id),      -- the Dr7716/Cr7830 receipt (DB-…)
  amount              numeric(18,2) not null,
  poi_tx              text,                                           -- Adyen/Straumur POI transaction id
  collected_at        timestamptz not null default now(),
  collected_by        text
);
