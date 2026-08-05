-- Tímafærslur fá TEGUND: vinna (stimplanir) + fjarvistir sem bókarinn skráir handvirkt á
-- mánaðarblaði starfsmanns — veikindi, orlof, frídagur, önnur fjarvist. Fjarvist ber enga
-- inn/út-stimplun; klst hennar koma úr hours_override (sjálfgefið 8) og note skýrir.
set search_path = acc, public;

alter table acc.time_entries
  add column if not exists entry_type text not null default 'work',
  add column if not exists hours_override numeric(5,2),
  add column if not exists note text;

alter table acc.time_entries drop constraint if exists time_entries_entry_type_check;
alter table acc.time_entries add constraint time_entries_entry_type_check
  check (entry_type in ('work','sick','vacation','holiday','absence'));

-- „Aðeins ein opin stimplun" á bara við um VINNU — fjarvistarfærslur eru út-stimplunarlausar
-- eðli málsins samkvæmt og mega vera margar í mánuði.
drop index if exists acc.time_entries_open_uk;
create unique index if not exists time_entries_open_uk
  on acc.time_entries(employee_id) where clock_out is null and entry_type = 'work';
