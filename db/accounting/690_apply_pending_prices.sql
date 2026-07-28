-- Verð breytast nú STRAX við bókun móttöku (engin samþykktarskref — ákvörðun eiganda 2026-07-28).
-- Þessi migration lætur tillögurnar sem ÞEGAR bíða (t.d. Holta-móttakan í dag) taka gildi um leið,
-- svo ekkert situr eftir í biðröðinni. Ein pending-tillaga per vöru (partial unique) svo þetta er ótvírætt.
set search_path = acc, public;

update shop.products p
   set unit_price_net = round(s.suggested_price / (1 + coalesce(p.vat_rate, 0) / 100.0), 4),
       updated_at = now()
  from acc.price_suggestions s
 where s.status = 'pending' and s.product_number = p.product_number;

update acc.price_suggestions set status = 'applied', decided_at = now() where status = 'pending';
