-- SVO GOTT — menu schema for Supabase.
-- Run once in the Supabase SQL Editor (Project → SQL → New query → paste → Run).

create table if not exists public.meals (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  tag         text not null default '',
  minutes     int  not null default 30,
  kcal        int  not null default 0,
  blurb       text not null default '',
  description text not null default '',
  ingredients text[] not null default '{}',
  allergens   text[] not null default '{}',
  image_url   text,
  from_color  text not null default '#8CC7C4',
  to_color    text not null default '#2C687B',
  published   boolean not null default true,
  position    int  not null default 0,
  week_of     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.meals enable row level security;

-- Everyone can read published meals; logged-in editors can read/write everything.
drop policy if exists "public read published" on public.meals;
create policy "public read published" on public.meals for select using (published = true);

drop policy if exists "auth read all" on public.meals;
create policy "auth read all" on public.meals for select to authenticated using (true);

drop policy if exists "auth insert" on public.meals;
create policy "auth insert" on public.meals for insert to authenticated with check (true);

drop policy if exists "auth update" on public.meals;
create policy "auth update" on public.meals for update to authenticated using (true) with check (true);

drop policy if exists "auth delete" on public.meals;
create policy "auth delete" on public.meals for delete to authenticated using (true);

-- Photo storage (public read, editors upload).
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do nothing;

drop policy if exists "public read meal photos" on storage.objects;
create policy "public read meal photos" on storage.objects for select using (bucket_id = 'meal-photos');

drop policy if exists "auth upload meal photos" on storage.objects;
create policy "auth upload meal photos" on storage.objects for insert to authenticated with check (bucket_id = 'meal-photos');

drop policy if exists "auth update meal photos" on storage.objects;
create policy "auth update meal photos" on storage.objects for update to authenticated using (bucket_id = 'meal-photos');

-- Seed the current sample menu (skips rows that already exist).
insert into public.meals (slug, title, tag, minutes, kcal, blurb, description, ingredients, allergens, from_color, to_color, position) values
('ofnbakadur-lax-dillsosa', 'Ofnbakaður lax með dillsósu', 'Fiskur', 30, 620,
  'Roðlaus lax með sítrónu-dillsósu, nýjum kartöflum og steiktu grænmeti.',
  'Safaríkur ofnbakaður lax með ferskri sítrónu- og dillsósu, borinn fram með smjörsteiktum nýjum kartöflum og litríku árstíðagrænmeti.',
  array['Laxaflök','Nýjar kartöflur','Ferskt dill','Sítróna','Sýrður rjómi','Brokkólí','Gulrætur','Smjör'],
  array['Fiskur','Mjólk'], '#8CC7C4', '#2C687B', 1),
('kjuklingakarry-jasmin', 'Mild kjúklingakarrý með jasmínhrísgrjónum', 'Kjúklingur', 35, 710,
  'Rjómakennt kókoskarrý með ferskum kóríander og lime.',
  'Mjúkt og bragðmikið kókoskarrý með mýrum kjúklingabitum, paprika og lauk, borið fram með ilmandi jasmínhrísgrjónum.',
  array['Kjúklingabringur','Kókosmjólk','Karrýmauk','Jasmínhrísgrjón','Paprika','Laukur','Kóríander','Lime'],
  array[]::text[], '#E7A977', '#B81414', 2),
('graenmetislasagne', 'Grænmetislasagne með ricotta', 'Grænmeti', 45, 560,
  'Lög af kúrbít, sveppum og tómatsósu með ostagratíni.',
  'Ríkulegt grænmetislasagne með lögum af kúrbít, sveppum og heimagerðri tómatsósu, kórónað með ricotta og bráðnum osti.',
  array['Lasagneplötur','Kúrbítur','Sveppir','Maukaðir tómatar','Ricotta','Rifinn ostur','Hvítlaukur','Basilíka'],
  array['Glúten','Mjólk'], '#9FD0AC', '#2C687B', 3),
('halloumi-bowl-kuskus', 'Halloumi-bowl með kúskús', 'Grænmeti', 25, 590,
  'Grillaður halloumi, sítrónukúskús, granatepli og myntu-jógúrt.',
  'Litríkur og ferskur skál með grilluðum halloumi, sítrónukúskús, stökku grænmeti, granateplum og kælandi myntu-jógúrt.',
  array['Halloumi','Kúskús','Granatepli','Gúrka','Kirsuberjatómatar','Jógúrt','Mynta','Sítróna'],
  array['Mjólk','Glúten'], '#8CC7C4', '#5C8A6A', 4),
('nautabollur-bolognese', 'Nautabollur í bolognese', 'Nautakjöt', 40, 740,
  'Heimagerðar nautabollur í ríkulegri tómatsósu með spaghettí.',
  'Mjúkar heimagerðar nautabollur hægeldaðar í ríkulegri tómat- og kryddjurtasósu, bornar fram með spaghettí og rifnum parmesan.',
  array['Nautahakk','Spaghettí','Maukaðir tómatar','Laukur','Hvítlaukur','Parmesan','Brauðrasp','Egg'],
  array['Glúten','Mjólk','Egg'], '#D98A8A', '#B81414', 5),
('thorskur-kartoflumus', 'Pönnusteiktur þorskur með kartöflumús', 'Fiskur', 30, 540,
  'Þorskhnakki með smjörsteiktum blaðlauki og sítrónu.',
  'Stökk-steiktur þorskhnakki með rjómakenndri kartöflumús, smjörsteiktum blaðlauki og léttri sítrónusmjörsósu.',
  array['Þorskhnakki','Kartöflur','Blaðlaukur','Smjör','Mjólk','Sítróna','Steinselja','Hvítlaukur'],
  array['Fiskur','Mjólk'], '#A9CBD6', '#2C687B', 6)
on conflict (slug) do nothing;
