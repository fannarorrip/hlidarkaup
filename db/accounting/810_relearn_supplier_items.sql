-- 810: Endurlæra ALLAR sögulegar vörupörunar úr móttökum — með BÁÐUM lyklum.
--
-- Gallinn: lærdómurinn geymdi bara EINN lykil á línu (strikamerkið ef það var til,
-- annars vörunúmer birgja). Næsti reikningur frá sama birgi sýnir stundum bara hinn
-- lykilinn (AI-lestur á PDF nær t.d. ekki alltaf strikamerkinu) — uppflettingin fann
-- þá ekkert og græna hakið birtist aldrei þótt varan hafi verið pöruð margoft áður.
--
-- Hér er farið yfir allar móttökur með þekktan birgi og hver pöruð lína lærð undir
-- báðum lyklum (snyrtum með btrim). Nýjasta móttakan vinnur ef sami lykill kemur
-- oftar en einu sinni fyrir. ON CONFLICT DO NOTHING: það sem þegar er lært heldur
-- forgangi — þetta fyllir bara í götin (vantandi seinni lykla).
insert into acc.supplier_items (supplier_id, match_key, product_number, pack_qty)
select distinct on (r.supplier_id, k.key) r.supplier_id, k.key, l.matched_product_number, l.pack_qty
from acc.goods_receipt_lines l
join acc.goods_receipts r on r.id = l.receipt_id and r.supplier_id is not null
cross join lateral (values (nullif(btrim(coalesce(l.gtin,'')),'')),
                           (nullif(btrim(coalesce(l.supplier_item_id,'')),''))) as k(key)
where l.matched_product_number is not null and k.key is not null
order by r.supplier_id, k.key, r.created_at desc, l.line_no desc
on conflict (supplier_id, match_key) do nothing;
