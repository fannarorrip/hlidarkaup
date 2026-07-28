-- Álagning per birgi + sjálfvirk verðuppfærsla úr reikningum.
-- default_markup: föst álagning birgisins (t.d. 1.20 = kostnaður ×1,20 → söluverð). Notuð sem
-- FYRSTA val í verðbreytingatillögum þegar móttaka les nýjan kostnað úr reikningi (inExchange/PDF);
-- annars gildir "sama álagning og var" og svo gamla verðreglutaflan (pricing_rules).
-- auto_apply_prices: true = verðið uppfærist SJÁLFKRAFA við staðfesta móttöku (tillagan skráist
-- samt sem 'applied' — full rekjanleiki); false = tillaga bíður handsamþykktar eins og áður.
set search_path = acc, public;

alter table acc.suppliers add column if not exists default_markup numeric
  check (default_markup is null or (default_markup > 1.0 and default_markup < 10));
alter table acc.suppliers add column if not exists auto_apply_prices boolean not null default false;

-- Bananar ehf: samningur = öll vara með álagningu ×1,20, uppfærist sjálfkrafa.
update acc.suppliers set default_markup = 1.20, auto_apply_prices = true
 where name ilike '%banana%';
