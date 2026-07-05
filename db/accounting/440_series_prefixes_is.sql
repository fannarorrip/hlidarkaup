-- Align the voucher_series display prefixes with the Icelandic map used everywhere else
-- (lib/format SERIES_PREFIX): DB dagbók, INN innkaup, SR sölureikningur, KR kredit, LN laun.
-- KASSI is already HK (380).
set search_path = acc, public;

update acc.voucher_series set prefix = 'DB'  where series_code = 'JOURNAL';
update acc.voucher_series set prefix = 'INN' where series_code = 'PURCHASE';
update acc.voucher_series set prefix = 'SR'  where series_code = 'SALES';
update acc.voucher_series set prefix = 'KR'  where series_code = 'CREDIT';
update acc.voucher_series set prefix = 'LN'  where series_code = 'PAYROLL';
