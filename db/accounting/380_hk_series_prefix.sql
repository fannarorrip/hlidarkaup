-- Kassasala receipt series prefix: KS → HK (Hlíðarkaup branding on receipts).
-- Only the display prefix changes — the gap-free voucher_number sequence continues
-- untouched, so document numbering stays sequential per Lög 145/1994.
set search_path = acc, public;

update acc.voucher_series set prefix = 'HK' where series_code = 'KASSI';
