-- Vöruflokkur er LÆSTUR þegar hann er kominn (ákvörðun eiganda 2026-07-29): vara sem þegar
-- hefur flokk heldur honum — allar tilraunir til að breyta/hreinsa hann (vöruritill, innflutningur,
-- API, framtíðarkóði) halda gamla gildinu HLJÓÐLAUST. Flokk má áfram SETJA á flokklausa vöru.
-- (Þarf einhvern tíma að endurflokka viljandi: gera það í SQL með session_replication_role
-- = replica, eða fella trigger-inn tímabundið.)
set search_path = shop, public;

create or replace function shop.protect_product_group() returns trigger
language plpgsql as $$
begin
  if coalesce(old.product_group, '') <> '' and new.product_group is distinct from old.product_group then
    new.product_group := old.product_group;
  end if;
  return new;
end $$;

drop trigger if exists product_group_lock on shop.products;
create trigger product_group_lock
  before update on shop.products
  for each row execute function shop.protect_product_group();
