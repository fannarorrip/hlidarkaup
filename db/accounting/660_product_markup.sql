-- Föst álagning Á VÖRU (skráð í móttöku, festist á vörunni): sterkasta reglan í verðútreikningi
-- við móttöku reiknings — vara-álagning > birgja-álagning > sama álagning og var > verðreglutafla.
-- Dæmi: Tortilla fær ×1,35 einu sinni í móttöku → hver framtíðar-kostnaðarbreyting reiknar
-- söluverð = nýr kostnaður × 1,35 (sjálfkrafa ef birgir er á auto, annars tillaga).
set search_path = shop, public;

alter table shop.products add column if not exists markup numeric
  check (markup is null or (markup > 1.0 and markup < 10));
