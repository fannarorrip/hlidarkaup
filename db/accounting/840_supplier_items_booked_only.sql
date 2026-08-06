-- 840: Pörunarminnið endurbyggt — AÐEINS úr BÓKUÐUM móttökum.
--
-- Gallinn í 810/830: endurlærslan tók líka DRÖG með, og drög innihalda sjálfvirk gisk
-- (strikamerkja-/nafnalíkindapörun) sem engin manneskja hefur farið yfir. Græna hakið
-- „staðfesti" þá paranir sem aldrei höfðu verið samþykktar — þveröfugt við tilganginn.
-- Hakið á að þýða: „nákvæmlega þessi pörun hefur verið BÓKUÐ áður".
--
-- Minnið er því tæmt og lært upp á nýtt eingöngu úr status='booked' móttökum (bókun er
-- mannleg staðfesting — „Bóka móttöku" er ýtt af manneskju sem sá línurnar). Báðir lyklar,
-- nýjasta bókunin vinnur. Vistunarlærdómurinn í PATCH-leiðinni er fjarlægður í sömu
-- breytingu (sjálfvirka vistunin var að læra gisk) — lært er við bókun eingöngu.
delete from acc.supplier_items;

insert into acc.supplier_items (supplier_id, match_key, product_number, pack_qty)
select distinct on (r.supplier_id, k.key) r.supplier_id, k.key, l.matched_product_number, l.pack_qty
from acc.goods_receipt_lines l
join acc.goods_receipts r on r.id = l.receipt_id and r.supplier_id is not null and r.status = 'booked'
cross join lateral (values (nullif(btrim(coalesce(l.gtin,'')),'')),
                           (nullif(btrim(coalesce(l.supplier_item_id,'')),''))) as k(key)
where l.matched_product_number is not null and k.key is not null
order by r.supplier_id, k.key, r.created_at desc, l.line_no desc
on conflict (supplier_id, match_key) do nothing;
