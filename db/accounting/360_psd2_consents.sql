-- Server-side PSD2 consent storage. Consents previously lived ONLY in browser localStorage —
-- unusable from another device and invisible to any server job (the Samstillingar auto_sync
-- toggle could never work). One row per consent created; the newest valid one is the default.
set search_path = acc, public;

create table if not exists acc.psd2_consents (
  id           uuid primary key default gen_random_uuid(),
  consent_id   text unique not null,
  status       text not null default 'received',   -- received | valid | rejected | expired | revoked
  valid_until  date,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists psd2_consents_status_idx on acc.psd2_consents (status, created_at desc);
