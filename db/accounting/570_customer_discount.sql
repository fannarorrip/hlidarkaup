-- Fastur afsláttur á viðskiptamann (%). Ritstýrt í bókhaldi (viðskiptamanna-ritli);
-- kassinn dregur hann sjálfkrafa af öllum línum þegar viðskiptamaðurinn er valinn.
alter table shop.customers
  add column if not exists discount_pct numeric(5,2) not null default 0
    check (discount_pct >= 0 and discount_pct <= 100);
