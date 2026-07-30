-- Vöruflokks-læsingin (700) felld niður: rótin á "flokkur hvarf við endurnefningu" var í
-- vöru-PATCH leiðinni sjálfri (hlutauppfærsla ÞURRKAÐI product_group, unit_code, description,
-- innihald, næringargildi, pöntunarmörk...) — nú lagað með nærveru-vörðum í API-inu ("field" in
-- body = eina leiðin til að snerta sviðið). Viljandi flutningar milli flokka virka því aftur
-- í vöruritlinum, og ekkert hlutaferli getur lengur hreinsað flokk óvart.
set search_path = shop, public;

drop trigger if exists product_group_lock on shop.products;
drop function if exists shop.protect_product_group();
