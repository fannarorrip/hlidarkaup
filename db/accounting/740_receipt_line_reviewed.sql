-- Móttaka: „farið yfir"-hak á hverja línu — vinnuminni afgreiðslunnar við yfirferð
-- (línan verður ljósgræn í viðmótinu). Vistast með sjálfvirku vistuninni eins og annað.
set search_path = acc, public;

alter table acc.goods_receipt_lines
  add column if not exists reviewed boolean not null default false;
