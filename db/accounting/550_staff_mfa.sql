-- Staff MFA (TOTP, stjórnendur only) — short-lived pending-login tickets. Between the
-- password step and the TOTP-code step we hold the Supabase access token SERVER-SIDE
-- (never handed to the browser); the client only carries the ticket id. Rows are deleted
-- on use and expire after a few minutes.
create table if not exists acc.staff_login_tickets (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  role         text not null,
  supabase_uid text,
  access_token text not null,        -- Supabase AAL1 token, deleted on verify / expiry
  factor_id    text,                 -- TOTP factor being enrolled/challenged
  mode         text not null,        -- 'challenge' (already enrolled) | 'enroll' (first time)
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists staff_login_tickets_expiry_ix on acc.staff_login_tickets (expires_at);
