-- Product photos for the till grid (ávextir/grænmeti PLU tiles etc.). The image itself lives in
-- Supabase storage (bucket product-photos, public CDN URL) — same pattern as SVO GOTT meal photos;
-- the catalog row only carries the URL.
set search_path = shop, public;

alter table shop.products add column if not exists image_url text;
