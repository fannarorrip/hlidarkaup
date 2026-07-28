-- KS-samstæðan (kt 550698-2349 + deildartala aftan við): samningskjörin eru
--   • 7% afsláttur á kassa/reikningum (discount_pct)
--   • rafrænir reikningar um inExchange (rafraen_vidskipti)
--   • REIKNINGUR í hvert sinn, ENGIN bankakrafa (billing_mode 'per_trip_invoice')
-- Nær yfir alla viðskiptamenn þar sem kennitalan byrjar á 5506982349 (líka með
-- deildartölu aftan við). Ný deild stofnuð síðar fær sömu kjör sjálfkrafa í
-- /api/customers (sjá route). Yfirskrifar EKKI hærri afslátt sé hann þegar til.
set search_path = shop, public;

update shop.customers
   set discount_pct      = greatest(discount_pct, 7),
       rafraen_vidskipti = true,
       billing_mode      = 'per_trip_invoice'
 where regexp_replace(coalesce(kennitala, ''), '\D', '', 'g') like '5506982349%';
