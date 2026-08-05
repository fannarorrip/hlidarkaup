-- Launataxtar kjarasamnings VR og SA 2024–2027 (gildir frá 1. apríl 2026) + taxtatenging
-- starfsmanna: launaflokkur (wage_category) og starfsaldur í starfsgrein (trade_start;
-- start_date á employees er starfsaldur í FYRIRTÆKINU). Taxtaval reiknast í lib/wage-scale.ts:
-- aldur úr kennitölu (unglingataxtar 14–17 ára), 6 mán í starfsgrein (eða 22 ára — fótnóta 2),
-- 1/2/5 ár í fyrirtæki, 1/3 ár í starfsgrein. Ný tafla per gildistöku = ný lína í valid_from.
set search_path = acc, public;

create table if not exists acc.wage_scale (
  id          uuid primary key default gen_random_uuid(),
  agreement   text not null default 'VR-SA',
  valid_from  date not null,
  category    text not null,   -- afgreidsla | serthjalfad | skrifstofa | lyfjataeknir | afthreying
  step        text not null,   -- 14ara..17ara | byrjun | 6man_grein | 1ar_grein | 3ar_grein | 1ar_fyrirtaeki | 2ar_fyrirtaeki | 5ar_fyrirtaeki
  sort        int  not null,
  monthly     numeric(12,2) not null,
  dagvinna    numeric(10,2) not null,
  eftirvinna  numeric(10,2),
  naeturvinna numeric(10,2),
  yfirvinna   numeric(10,2) not null,
  storhatid   numeric(10,2) not null,
  unique (agreement, valid_from, category, step)
);

alter table acc.employees
  add column if not exists wage_category text,   -- null = handvirk laun (óbreytt hegðun)
  add column if not exists trade_start   date;   -- starfsaldur í starfsgrein (tómt = sama og start_date)

-- ── VR/SA taxtar frá 1.4.2026 (úr opinberu taxtaskjali VR) ─────────────────────────────────
insert into acc.wage_scale (agreement, valid_from, category, step, sort, monthly, dagvinna, eftirvinna, naeturvinna, yfirvinna, storhatid) values
  ('VR-SA','2026-04-01','afgreidsla','14ara',          0, 298798, 1779.19, 2460.60, 2636.59, 3103.02, 4108.47),
  ('VR-SA','2026-04-01','afgreidsla','15ara',          1, 342172, 2037.47, 2817.79, 3019.33, 3553.46, 4704.87),
  ('VR-SA','2026-04-01','afgreidsla','16ara',          2, 404823, 2410.52, 3333.72, 3572.16, 4204.09, 5566.32),
  ('VR-SA','2026-04-01','afgreidsla','17ara',          3, 428919, 2554.00, 3532.15, 3784.78, 4454.32, 5897.64),
  ('VR-SA','2026-04-01','afgreidsla','byrjun',        10, 481932, 2869.67, 3968.71, 4252.57, 5004.86, 6626.57),
  ('VR-SA','2026-04-01','afgreidsla','6man_grein',    20, 492925, 2935.13, 4059.24, 4349.57, 5119.03, 6777.72),
  ('VR-SA','2026-04-01','afgreidsla','1ar_fyrirtaeki',30, 495186, 2948.59, 4077.86, 4369.52, 5142.51, 6808.81),
  ('VR-SA','2026-04-01','afgreidsla','2ar_fyrirtaeki',40, 509065, 3031.23, 4192.15, 4491.99, 5286.64, 6999.64),
  ('VR-SA','2026-04-01','afgreidsla','5ar_fyrirtaeki',60, 523378, 3116.46, 4310.02, 4618.29, 5435.28, 7196.45),

  ('VR-SA','2026-04-01','serthjalfad','byrjun',        10, 488774, 2910.41, 4025.05, 4312.94, 5075.92, 6720.64),
  ('VR-SA','2026-04-01','serthjalfad','6man_grein',    20, 501379, 2985.47, 4128.86, 4424.17, 5206.82, 6893.96),
  ('VR-SA','2026-04-01','serthjalfad','1ar_fyrirtaeki',30, 503575, 2998.54, 4146.94, 4443.55, 5229.63, 6924.16),
  ('VR-SA','2026-04-01','serthjalfad','2ar_fyrirtaeki',40, 517702, 3082.66, 4263.28, 4568.20, 5376.34, 7118.40),
  ('VR-SA','2026-04-01','serthjalfad','5ar_fyrirtaeki',60, 533644, 3177.59, 4394.56, 4708.87, 5541.89, 7337.61),

  ('VR-SA','2026-04-01','skrifstofa','byrjun',    10, 515868, 3238.95, 4513.85, 4836.26, 5357.29, 7093.19),
  ('VR-SA','2026-04-01','skrifstofa','3ar_grein', 45, 542218, 3404.40, 4744.41, 5083.29, 5630.93, 7455.50),

  ('VR-SA','2026-04-01','lyfjataeknir','byrjun',        10, 510368, 3038.99, 4202.88, 4503.49, 5300.17, 7017.56),
  ('VR-SA','2026-04-01','lyfjataeknir','6man_grein',    20, 511848, 3047.80, 4215.07, 4516.55, 5315.54, 7037.91),
  ('VR-SA','2026-04-01','lyfjataeknir','3ar_grein',     45, 520984, 3102.20, 4290.30, 4597.16, 5410.42, 7163.53),
  ('VR-SA','2026-04-01','lyfjataeknir','5ar_fyrirtaeki',60, 539942, 3215.09, 4446.42, 4764.45, 5607.30, 7424.20),

  ('VR-SA','2026-04-01','afthreying','byrjun',        10, 504344, 3003.12, 4153.27, 4450.33, 5237.61, 6934.73),
  ('VR-SA','2026-04-01','afthreying','6man_grein',    20, 512321, 3050.62, 4218.96, 4520.72, 5320.45, 7044.41),
  ('VR-SA','2026-04-01','afthreying','1ar_grein',     25, 519087, 3090.91, 4274.68, 4580.42, 5390.72, 7137.45),
  ('VR-SA','2026-04-01','afthreying','3ar_grein',     45, 526389, 3134.39, 4334.81, 4644.86, 5466.55, 7237.85),
  ('VR-SA','2026-04-01','afthreying','5ar_fyrirtaeki',60, 542218, 3228.64, 4465.17, 4784.53, 5630.93, 7455.50)
on conflict (agreement, valid_from, category, step) do update
  set monthly = excluded.monthly, dagvinna = excluded.dagvinna, eftirvinna = excluded.eftirvinna,
      naeturvinna = excluded.naeturvinna, yfirvinna = excluded.yfirvinna, storhatid = excluded.storhatid,
      sort = excluded.sort;
