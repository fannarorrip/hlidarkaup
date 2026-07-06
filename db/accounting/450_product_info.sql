-- Hlíðarkaup — PRODUCT INFO: innihald, ofnæmisvaldar, næringargildi (450)
-- EU 1169/2011: fjarsala (vefverslun) verður að birta skyldumerkingar matvæla ÁÐUR
-- en kaup fara fram — innihaldslýsingu, ofnæmisvalda, næringargildi og nettómagn.
-- Fyllt inn með: AI-lestri af mynd af umbúðum, gögnum frá birgjum, Open Food Facts
-- eða handvirkt. info_source rekur hvaðan gögnin komu.

alter table shop.products
  add column if not exists innihald        text,        -- innihaldslýsing eins og á umbúðum (ofnæmisvaldar í HÁSTÖFUM)
  add column if not exists ofnaemisvaldar  text,        -- t.d. "MJÓLK, GLÚTEN (HVEITI), EGG"
  add column if not exists naeringargildi  jsonb,       -- í 100 g/ml: {orka_kj, orka_kcal, fita, mettadar_fitusyrur, kolvetni, sykrur, trefjar, protein, salt}
  add column if not exists netto_magn      text,        -- nettómagn, t.d. "500 g" / "1 l"
  add column if not exists uppruni         text,        -- upprunaland þegar það er skylt/sýnilegt
  add column if not exists info_source     text,        -- 'label_ai' | 'supplier' | 'off' | 'manual'
  add column if not exists info_updated_at timestamptz;
