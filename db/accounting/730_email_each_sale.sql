-- Hak á viðskiptamanni: tölvupóstur (kvittun/reikningur í PDF) við HVERJA reikningssölu —
-- óháð reikningsmáta. Krafan/reikningsfærslan sjálf breytist EKKERT (safnast áfram í
-- mánaðaruppgjör hjá 'consolidated'/'staff'); þetta er aðeins tilkynning á viðskiptamanninn.
set search_path = shop, public;

alter table shop.customers
  add column if not exists email_each_sale boolean not null default false;
