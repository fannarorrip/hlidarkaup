-- Posa-annáll: HVER einasta posafærsla (rukkun / endurgreiðsla / hætt við / stöðufyrirspurn)
-- skráist með niðurstöðu. Tilgangur: tvírukkanir sjást svart á hvítu (tvær approved rukkanir
-- á móti einni bókaðri sölu) og hægt er að stemma af við Straumur/Adyen yfirlitið.
-- Skrifast best-effort úr lib/adyen-terminal.ts — bilun í annál stöðvar aldrei greiðslu.
set search_path = acc, public;

create table if not exists acc.terminal_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('pay','refund','abort','verify')),
  poiid       text,
  service_id  text,
  ref         text,
  amount      numeric(14,2),
  currency    text,
  approved    boolean,
  error       text,
  poi_tx_id   text
);

create index if not exists terminal_log_created_idx on acc.terminal_log (created_at desc);
create index if not exists terminal_log_service_idx on acc.terminal_log (service_id);
