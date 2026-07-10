-- (I) Dagatal + áminningar: the "don't forget" brain behind the Yfirlit reminder widget
-- and the daily escalation email. Two sources feed the widget:
--   1. LIVE obligations computed in lib/reminders.ts (óbókuð fylgiskjöl, VSK-skiladagur,
--      staðgreiðsla, gjaldfallnir reikningar, kælaaflestur ekki skráður…) — clear themselves.
--   2. SCHEDULED reminders below (rituals like Föstudagskjúklingur + manual one-offs) — marked
--      done per occurrence so a weekly ritual reappears next week.
set search_path = acc, public;

create table if not exists acc.reminders (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  category       text not null default 'annað',        -- 'ritúal' | 'skattur' | 'pöntun' | 'annað'
  schedule_kind  text not null check (schedule_kind in ('weekly','monthly','yearly','oneoff')),
  weekday        int check (weekday between 1 and 7),   -- weekly (1 = mánudagur)
  day_of_month   int check (day_of_month between 1 and 31),
  month          int check (month between 1 and 12),    -- yearly
  due_date       date,                                  -- oneoff
  lead_days      int not null default 2,                -- byrja að minna svona mörgum dögum áður
  email_escalate boolean not null default false,        -- taka með í áminningarpóst þegar áríðandi
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- one row per completed occurrence (weekly ritual done for THIS friday, VSK done for THIS period)
create table if not exists acc.reminder_done (
  id              uuid primary key default gen_random_uuid(),
  reminder_key    text not null,                        -- reminder id, or a synthetic key for tax items ('VSK-2026-jan-feb')
  occurrence_date date not null,                        -- the due date of the occurrence that was completed
  done_at         timestamptz not null default now(),
  done_by         text,
  unique (reminder_key, occurrence_date)
);
create index if not exists reminder_done_key_idx on acc.reminder_done(reminder_key, occurrence_date);

-- de-dupe the escalation email to at most one per day
create table if not exists acc.reminder_email_log (
  id          uuid primary key default gen_random_uuid(),
  sent_date   date not null unique,
  item_count  int not null,
  recipients  text,
  sent_at     timestamptz not null default now()
);

-- Seed the old store's revenue rituals (from the operations binder).
insert into acc.reminders (title, description, category, schedule_kind, weekday, lead_days, email_escalate) values
  ('Föstudagskjúklingur', 'Panta ~80 grillkjúklinga + taka við forpöntunum viðskiptavina', 'ritúal', 'weekly', 4, 1, false),
  ('Helgarpöntun (fimmtudagur)', 'Grænmeti kl. 8, mjólk (3 beljur), Myllan, SS, Kjarnafæði fyrir helgina', 'ritúal', 'weekly', 4, 0, false),
  ('Þurrvörupantanir undirbúnar (sunnudagur)', 'Ísam, Nathan & Olsen, Innnes, Danól fyrir mánudag', 'ritúal', 'weekly', 7, 0, false)
on conflict do nothing;

-- Yearly ritual (variable date, reminded from 1. október).
insert into acc.reminders (title, description, category, schedule_kind, month, day_of_month, lead_days, email_escalate) values
  ('Jólapantanir', 'Ölgerðin/SS/Frón jólalistarnir fara af stað — panta jólavörur og sælgæti', 'ritúal', 'yearly', 10, 1, 0, false)
on conflict do nothing;
