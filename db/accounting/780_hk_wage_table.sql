-- HLÍÐARKAUPSTAFLAN í stað hrárra VR-taxta: launataxtablað búðarinnar (Raðhús ehf. —
-- „Launahækkanir 01.01.2026 með 10% álagi") notað ORÐRÉTT skv. ákvörðun Fannars 5.8.2026.
-- Tölurnar eru VR-taxtar + 10% Hlíðarkaupsálag; blaðið er innbyrdis samkvæmt formúlunum
-- dagv = mán/167,94 · eftirv = 0,8235% · yfirv = 1,0385% · stórh = 1,375% af mán.launum.
-- Næturvinna er ekki á blaðinu og leiðist af sömu formúlu: 0,8824% af mán.launum.
-- Flokkarnir tveir sem búðin notar: afgreiðslufólk (m/unglingatöxtum) og sérþjálfaðir.
-- 18–19 ára reglan af blaðinu (95% af byrjunarlaunum að 700 vinnustundum) er í lib/wage-scale.ts.
set search_path = acc, public;

delete from acc.wage_scale where agreement in ('VR-SA', 'HK-10');

insert into acc.wage_scale (agreement, valid_from, category, step, sort, monthly, dagvinna, eftirvinna, naeturvinna, yfirvinna, storhatid)
select 'HK-10', date '2026-01-01', c, s, so, m, d, e, round((m * 0.008824)::numeric, 2), y, st
from (values
  ('afgreidsla', '14ara',           0, 328576, 1956.50, 2705.82, 3412.26, 4517.91),
  ('afgreidsla', '15ara',           1, 376272, 2240.51, 3098.60, 3907.59, 5173.73),
  ('afgreidsla', '16ara',           2, 445167, 2650.75, 3665.95, 4623.06, 6121.04),
  ('afgreidsla', '17ara',           3, 471665, 2808.53, 3884.16, 4898.23, 6485.39),
  ('afgreidsla', 'byrjun',         10, 529960, 3155.65, 4364.22, 5503.64, 7286.95),
  ('afgreidsla', '6man_grein',     20, 542049, 3227.63, 4463.78, 5629.18, 7453.18),
  ('afgreidsla', '1ar_fyrirtaeki', 30, 544536, 3242.45, 4484.26, 5655.01, 7487.37),
  ('afgreidsla', '2ar_fyrirtaeki', 40, 559799, 3333.33, 4609.95, 5813.51, 7697.24),
  ('afgreidsla', '5ar_fyrirtaeki', 60, 575537, 3427.04, 4739.55, 5976.95, 7913.63),

  ('serthjalfad', 'byrjun',         10, 537485, 3200.46, 4426.19, 5581.79, 7390.43),
  ('serthjalfad', '6man_grein',     20, 551345, 3282.99, 4540.33, 5725.72, 7581.00),
  ('serthjalfad', '1ar_fyrirtaeki', 30, 553761, 3297.37, 4560.23, 5750.81, 7614.21),
  ('serthjalfad', '2ar_fyrirtaeki', 40, 569295, 3389.87, 4688.15, 5912.13, 7827.81),
  ('serthjalfad', '5ar_fyrirtaeki', 60, 586826, 3494.26, 4832.51, 6094.19, 8068.85)
) as t(c, s, so, m, d, e, y, st);
