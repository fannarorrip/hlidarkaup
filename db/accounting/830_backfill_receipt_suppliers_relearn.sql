-- 830: Gamlar móttökur ÁN tengds birgis (voru bókaðar áður en birgjatengingin komst í lag)
-- skildu ekkert eftir sig í pörunarminninu — endurlærslan (810) gat bara lært af móttökum
-- MEÐ supplier_id. Hér er tvennt gert:
--   1. Móttökur án birgis fá birgi út frá nafninu á reikningnum (sama jafngildisregla og
--      lib/supplier-eqv.ts: normaliserað nafn eins, eða annað orða-forskeyti hins, ≥4 stafir;
--      lengsta nafnið vinnur ef fleiri koma til greina).
--   2. ÖLL sagan endurlærð aftur (eins og 810, báðir lyklar) — ON CONFLICT DO NOTHING svo
--      núverandi lærdómur heldur forgangi og keyrslan er skaðlaus þótt hún endurtaki sig.
update acc.goods_receipts r
set supplier_id = (
  select s.id from acc.suppliers s
  where lower(unaccent(trim(regexp_replace(s.name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i')))) =
        lower(unaccent(trim(regexp_replace(r.supplier_name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i'))))
     or (length(lower(unaccent(trim(regexp_replace(s.name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i'))))) >= 4
         and lower(unaccent(trim(regexp_replace(r.supplier_name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i')))) like
             lower(unaccent(trim(regexp_replace(s.name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i')))) || ' %')
     or (length(lower(unaccent(trim(regexp_replace(r.supplier_name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i'))))) >= 4
         and lower(unaccent(trim(regexp_replace(s.name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i')))) like
             lower(unaccent(trim(regexp_replace(r.supplier_name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i')))) || ' %')
  order by length(s.name) desc
  limit 1
)
where r.supplier_id is null and coalesce(r.supplier_name, '') <> ''
  and exists (
    select 1 from acc.suppliers s
    where lower(unaccent(trim(regexp_replace(s.name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i')))) =
          lower(unaccent(trim(regexp_replace(r.supplier_name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i'))))
       or (length(lower(unaccent(trim(regexp_replace(s.name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i'))))) >= 4
           and lower(unaccent(trim(regexp_replace(r.supplier_name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i')))) like
               lower(unaccent(trim(regexp_replace(s.name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i')))) || ' %')
       or (length(lower(unaccent(trim(regexp_replace(r.supplier_name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i'))))) >= 4
           and lower(unaccent(trim(regexp_replace(s.name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i')))) like
               lower(unaccent(trim(regexp_replace(r.supplier_name, '\s+(ehf|hf|sf|slf|ohf)\.?\s*$', '', 'i')))) || ' %')
  );

-- Endurlæra ALLT (sömu reglur og 810 — báðir lyklar, nýjasta móttakan vinnur, ekkert yfirskrifað).
insert into acc.supplier_items (supplier_id, match_key, product_number, pack_qty)
select distinct on (r.supplier_id, k.key) r.supplier_id, k.key, l.matched_product_number, l.pack_qty
from acc.goods_receipt_lines l
join acc.goods_receipts r on r.id = l.receipt_id and r.supplier_id is not null
cross join lateral (values (nullif(btrim(coalesce(l.gtin,'')),'')),
                           (nullif(btrim(coalesce(l.supplier_item_id,'')),''))) as k(key)
where l.matched_product_number is not null and k.key is not null
order by r.supplier_id, k.key, r.created_at desc, l.line_no desc
on conflict (supplier_id, match_key) do nothing;
