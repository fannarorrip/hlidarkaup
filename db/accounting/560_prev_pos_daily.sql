-- Dagleg kassauppgjör fyrri eiganda (Hlíðarkaup kt. 701274-2889) úr Reglu.
-- Sótt með GetPosReport fyrir yfirtökuna 25. júlí 2026 — 12 mánuðir aftur í tímann.
-- Notað í Yfirlit/Vaktborð til að bera "okkar sölu" saman við sama dag/vikudag hjá honum.
create table if not exists acc.prev_pos_daily (
  day          date primary key,
  sala_24      integer not null default 0,   -- sala á 24% þrepi (m/VSK)
  sala_11      integer not null default 0,
  sala_0       integer not null default 0,
  total        integer not null default 0,   -- "Sala samtals" úr uppgjörinu
  payments     jsonb,                        -- greiðslumátar {"Seðlar og mynt": 126385, ...}
  created_at   timestamptz not null default now()
);
