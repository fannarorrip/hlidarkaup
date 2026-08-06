-- 820: Pörun bankayfirlitslína við ÞEGAR bókaðar færslur á bankalyklinum (afstemming).
--
-- Sumar innborganir eru bókaðar áður en þær birtast í yfirlitinu: innheimtukröfur
-- (syncClaimPayments bókar Dr banki / Cr viðskiptakröfur við greiðslu) og millifærslusala
-- á kassa (bókast á bankalykilinn við söluna). Að bóka yfirlitslínuna líka tvöfaldaði
-- bankann. Nú fær línan status='matched' + matched_voucher_id á fyrirliggjandi fylgiskjal
-- í stað þess að nýtt sé bókað — bankareikningurinn stemmir og ekkert kemur tvisvar.
alter table acc.bank_transactions
  add column if not exists matched_voucher_id uuid references acc.vouchers(id);
alter table acc.bank_transactions drop constraint if exists bank_transactions_status_check;
alter table acc.bank_transactions
  add constraint bank_transactions_status_check
  check (status in ('unmatched','booked','ignored','matched'));
create index if not exists idx_bank_tx_matched_voucher
  on acc.bank_transactions(matched_voucher_id) where matched_voucher_id is not null;
