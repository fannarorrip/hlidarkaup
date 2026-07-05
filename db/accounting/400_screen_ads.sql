-- Skjáauglýsingar: slideshow images (tilboð, promotions) shown on the in-store price
-- checker (/verdskanni) while it idles. Managed in bókhald → sölukerfi → skjáauglýsingar.
set search_path = shop, public;

create table if not exists shop.screen_ads (
  id          bigint generated always as identity primary key,
  image_url   text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
