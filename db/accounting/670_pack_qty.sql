-- Pakkastærð: reikningseining birgja er oft KASSI/GRIND með mörgum söluvörum (t.d. Lífland egg:
-- 1 XFR grind = 144 stk á 84.815 kr → raunkostnaður söluvöru = 84.815/144 = 589 kr). pack_qty =
-- fjöldi söluvara í hverri reikningseiningu. Skráð einu sinni í móttöku, lærist á vörutengingu
-- birgisins (supplier_items) og fyllist sjálfkrafa á næsta reikningi. Kostnaður og birgðir
-- reiknast á söluvöru: kostnaður = línuupphæð ÷ (magn × pack_qty); birgðir += móttekið × pack_qty.
set search_path = acc, public;

alter table acc.supplier_items      add column if not exists pack_qty numeric check (pack_qty is null or pack_qty > 0);
alter table acc.goods_receipt_lines add column if not exists pack_qty numeric check (pack_qty is null or pack_qty > 0);
-- Handvirk leiðrétting á einingaverði (kostnaður á SÖLUVÖRU) beint í móttökunni — sterkari en
-- allir útreikningar; einskiptis á þessari móttöku (pakkastærðin er varanlega lærða leiðin).
alter table acc.goods_receipt_lines add column if not exists unit_cost_override numeric check (unit_cost_override is null or unit_cost_override > 0);
