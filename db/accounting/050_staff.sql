-- Staff + roles for the unified admin. Roles:
--   stjornandi (admin, everything + manage staff) · bokari (bókhald) ·
--   afgreidsla (till + orders) · eldhus (menu + orders)
create schema if not exists shop;
set search_path = shop, public;

create table if not exists shop.staff (
  email        text primary key,
  name         text,
  role         text not null default 'afgreidsla'
                 check (role in ('stjornandi','bokari','afgreidsla','eldhus')),
  supabase_uid uuid,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function shop.touch_staff_updated() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_staff_touch on shop.staff;
create trigger trg_staff_touch before update on shop.staff
  for each row execute function shop.touch_staff_updated();

-- Seed the existing Supabase accounts. Owner = stjórnandi; others default to
-- afgreidsla (least privilege) — reassign in the Starfsmenn screen.
insert into shop.staff (email, name, role) values ('fannar@geimur.is', 'Fannar', 'stjornandi')
  on conflict (email) do update set role = 'stjornandi';
insert into shop.staff (email, role) values
  ('petur@geimur.is', 'afgreidsla'),
  ('oli@geimur.is', 'afgreidsla'),
  ('birgittabjortp@gmail.com', 'afgreidsla')
  on conflict (email) do nothing;
