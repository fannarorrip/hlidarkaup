-- Sjálfvirkur hádegismatarfrádráttur (leið B): kerfið tryggir að 1 klst á bilinu 12–14 sé
-- ólaunuð á 5+ klst vinnudögum — NEMA hakað sé við „matur greiddur" fyrir daginn (starfsmaður
-- vann í gegnum matinn; sá tími greiðist þá með EFTIRVINNUKAUPI skv. kjarasamningi).
-- Röð hér = undantekningin: enginn frádráttur þennan dag hjá þessum starfsmanni.
set search_path = acc, public;

create table if not exists acc.time_lunch_overrides (
  employee_id uuid not null references acc.employees(id),
  day         date not null,
  created_by  text,
  created_at  timestamptz not null default now(),
  primary key (employee_id, day)
);
