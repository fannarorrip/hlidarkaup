-- SVO GOTT — orders table. Run once in the Supabase SQL Editor.

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null,
  created_at    timestamptz not null default now(),
  plan          text not null default 'once',        -- once | subscription
  delivery_type text not null default 'pickup',      -- pickup | delivery
  pickup_time   text,
  address       text,
  distance_km   numeric,
  shipping      int  not null default 0,
  portions      int  not null default 2,
  meals         int  not null default 0,
  items         jsonb not null default '[]',         -- [{slug,title}]
  subtotal      int  not null default 0,
  total         int  not null default 0,
  customer_name  text,
  customer_phone text,
  customer_email text,
  status        text not null default 'new'          -- new | preparing | done
);

-- Add the email column if the table already existed from an earlier run.
alter table public.orders add column if not exists customer_email text;

alter table public.orders enable row level security;

-- Anyone (the public checkout) can place an order…
drop policy if exists "anyone can create order" on public.orders;
create policy "anyone can create order" on public.orders for insert with check (true);

-- …but only logged-in staff can read and update them.
drop policy if exists "staff read orders" on public.orders;
create policy "staff read orders" on public.orders for select to authenticated using (true);

drop policy if exists "staff update orders" on public.orders;
create policy "staff update orders" on public.orders for update to authenticated using (true) with check (true);
