-- Verðlistinn sem afgreiðslan handsló inn sem "Ýmsar vörur" verður að alvöru vörum með föstu
-- verði — eitt tap í stað uppflettingar á blaði. Flokkun: bakkelsi → Bakarí (50), kartöflur +
-- Laugamýri → Grænmeti (30), vigtarvörur + mysa + sódastream-skil → Aðalvalmynd (10).
-- kr/kg-vörur eru vigtarvörur (use_scale) — verðið er per kg, kassinn vigtar.
-- "SÓDASTREAM HYLKI SKILAÐ" er NEIKVÆÐ vara (skilagjald −1.200 kr, 24% skv. blaðinu) — kassinn
-- styður mínus-línur frá og með þessari útgáfu. Gashylki SELT er EKKI stofnað (alltaf skanna).
-- Undanrennuduft í lausu fylgir mjólkurvöru-reglunni (enginn viðskiptamanna-afsláttur).
set search_path = shop, public;

with base as (
  select coalesce(max(product_number::int), 100000) as mx
  from shop.products where product_number ~ '^[0-9]{6}$'
), new_products (name, gross, vat, grp, scale, no_disc) as (values
  -- Bakarí (11% matvara)
  ('AMERÍSK SMÁKAKA Í GLÆRUM',      229, 11, '50', false, false),
  ('FOCCASIA',                      159, 11, '50', false, false),
  ('KALAMATA BRAUÐ',                698, 11, '50', false, false),
  ('OSTASNÚÐUR M/4 OSTUM',          298, 11, '50', false, false),
  ('PÍTSA HITUÐ',                   349, 11, '50', false, false),
  ('RISA SMÁKAKA',                  479, 11, '50', false, false),
  ('SÉRBAKAÐ BRAUÐ 1/2',            449, 11, '50', false, false),
  ('SÚKKULAÐIKLEINA',               389, 11, '50', false, false),
  -- Grænmeti (11% matvara)
  ('KARTÖFLUR REGINA',              719, 11, '30', false, false),
  ('KARTÖFLUR SPECIAL',             639, 11, '30', false, false),
  ('SÆTAR FRANSKAR Í GLÆRUM POKA',  979, 11, '30', false, false),
  ('LAUGAMÝRI SALAT',               479, 11, '30', false, false),
  ('LAUGAMÝRI TÓMATAR Í DÓS',       639, 11, '30', false, false),
  ('LAUGAMÝRI KRYDD',               498, 11, '30', false, false),
  -- Aðalvalmynd: vigtarvörur (verð per kg) + mysa + skilagjald
  ('FUGLAFÓÐUR HVEITIKORN',         198, 24, '10', true,  false),
  ('FUGLAFÓÐUR SÓLBLÓMAFRÆ',        698, 24, '10', true,  false),
  ('UNDANRENNUDUFT Í LAUSU',       1098, 11, '10', true,  true),
  ('MYSA 10L',                     1369, 11, '10', false, false),
  ('MYSA 5L',                       979, 11, '10', false, false),
  ('SÓDASTREAM HYLKI SKILAÐ',     -1200, 24, '10', false, true)
)
insert into shop.products
  (product_number, name, product_group, unit_code, vat_rate, vat_key, unit_price_net,
   is_stock_controlled, use_scale, allow_discount, is_active, source)
select lpad((base.mx + row_number() over (order by np.name))::text, 6, '0'),
       np.name, np.grp,
       case when np.scale then 'KGM' else 'C62' end,
       np.vat,
       case np.vat when 24 then 'U2' when 11 then 'U1' else 'U3' end,
       np.gross / (1 + np.vat / 100.0),
       false, np.scale, not np.no_disc, true, 'handvirk'
from new_products np cross join base
where not exists (select 1 from shop.products p where upper(p.name) = upper(np.name));

-- Vörur sem voru þegar til af listanum fá réttan flokk (birtast þá í grid-inu):
update shop.products set product_group = '50' where product_number = '045015';                -- SKR.FORMBRAUÐ → Bakarí
update shop.products set product_group = '30' where product_number in ('132736','132685');   -- HORNAFJ. ÚTSÆÐI → Grænmeti
