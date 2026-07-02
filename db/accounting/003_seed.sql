-- Hlíðarkaup accounting — SEED (VAT codes, numbering series, VAT control accounts)
-- Apply after 002. Account NUMBERS below are PLACEHOLDERS — replace with your
-- real bókhaldslyklar once the Regla chart-of-accounts export is imported.

set search_path = acc, public;

-- VAT codes — current Icelandic rates (24% standard, 11% reduced, 0/exempt)
insert into acc.vat_codes(code, description, rate, direction) values
  ('S24','Útskattur 24% (almennt þrep)', 24.00, 'utskattur'),
  ('S11','Útskattur 11% (lægra þrep)',   11.00, 'utskattur'),
  ('S00','Undanþegið / 0%',               0.00, 'enginn'),
  ('I24','Innskattur 24%',               24.00, 'innskattur'),
  ('I11','Innskattur 11%',               11.00, 'innskattur')
on conflict (code) do nothing;

-- Numbering series (gap-free)
insert into acc.voucher_series(series_code, description, prefix, next_number) values
  ('JOURNAL', 'Almenn dagbókarfærsla',    'J',  1),
  ('SALES',   'Sölureikningur',           '',   1),
  ('CREDIT',  'Kreditreikningur',         'K',  1),
  ('KASSI',   'Kassasala (sjóðvél)',      'KS', 1),
  ('PURCHASE','Innkaupareikningur',       'P',  1)
on conflict (series_code) do nothing;

-- NOTE: the real VAT control accounts come from the imported chart of accounts
-- (010_chart_of_accounts.sql): 9510/9512 innskattur, 9530/9532 útskattur,
-- 9535 uppgjörsreikningur VSK, 9999 biðreikningur. No placeholders needed.
