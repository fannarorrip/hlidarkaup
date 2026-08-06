// Birgja-JAFNGILDI fyrir pörunarminnið: sami birgir er oft til undir FLEIRI en einni skráningu
// („Bananar" og „Bananar ehf.", „Kjarnafæði" og „Kjarnafæði Norðlenska ehf.") og lærdómurinn
// dreifist þá á þær — grænu hökin og sjálfvirka pörunin „gleymdu" því sem lærðist undir hinni.
// Tvær skráningar teljast sami aðili þegar:
//   1. kennitalan (tölustafir) er sú sama,
//   2. normalíseruðu nöfnin (lágstafir, án ehf/hf/sf/slf/ohf-endingar) eru eins, eða
//   3. annað nafnið er ORÐA-forskeyti hins (styttra nafnið + bil, minnst 4 stafir —
//      „kjarnafæði" ↔ „kjarnafæði norðlenska", en „ali" ≠ „alibaba").
// Strengurinn er JOIN-skilyrði milli acc.suppliers s1 (birgir móttökunnar, joinað á undan)
// og s2 (eigandi lærdómsraðar acc.supplier_items si) — nota í fyrirspurnum með þeim ölíösum.
const norm = (col: string) =>
  `lower(unaccent(trim(regexp_replace(${col}, '\\s+(ehf|hf|sf|slf|ohf)\\.?\\s*$', '', 'i'))))`;

export const SUPPLIER_EQV_JOIN = `join acc.suppliers s2 on s2.id = si.supplier_id and (
        s2.id = s1.id
        or (nullif(regexp_replace(coalesce(s1.kennitala,''),'\\D','','g'),'') is not null
            and regexp_replace(coalesce(s2.kennitala,''),'\\D','','g') = regexp_replace(coalesce(s1.kennitala,''),'\\D','','g'))
        or ${norm("s2.name")} = ${norm("s1.name")}
        or (length(${norm("s1.name")}) >= 4 and ${norm("s2.name")} like ${norm("s1.name")} || ' %')
        or (length(${norm("s2.name")}) >= 4 and ${norm("s1.name")} like ${norm("s2.name")} || ' %')
      )`;
