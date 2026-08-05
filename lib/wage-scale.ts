// Taxtaval úr kjarasamningi VR/SA (acc.wage_scale): réttur taxti út frá ALDRI (kennitölu),
// starfsaldri í STARFSGREIN (trade_start, tómt = start_date) og starfsaldri í FYRIRTÆKI
// (start_date). Reglurnar:
//   • 14–17 ára → unglingataxti (aðeins til hjá afgreiðslufólki; annars byrjunarlaun)
//   • „Eftir 6 mánuði í starfsgrein" — gildir LÍKA strax við 22 ára aldur (fótnóta 2 í taxtaskjali)
//   • „Eftir 1/2/5 ár í fyrirtæki" og „Eftir 1/3 ár í starfsgrein" eftir flokki
//   • Hæsta þrep sem starfsmaðurinn uppfyllir gildir.
import { query } from "@/lib/db";

export const WAGE_CATEGORIES: Record<string, string> = {
  afgreidsla: "Afgreiðslufólk í verslunum",
  serthjalfad: "Sérþjálfað starfsfólk verslana",
  skrifstofa: "Skrifstofufólk",
  lyfjataeknir: "Lyfjatæknar",
  afthreying: "Afþreying/ferðaþjónusta (samsett störf)",
};

export const STEP_LABEL: Record<string, string> = {
  "14ara": "14 ára", "15ara": "15 ára", "16ara": "16 ára", "17ara": "17 ára",
  byrjun: "Byrjunarlaun", "6man_grein": "Eftir 6 mán. í starfsgrein",
  "1ar_grein": "Eftir 1 ár í starfsgrein", "3ar_grein": "Eftir 3 ár í starfsgrein",
  "1ar_fyrirtaeki": "Eftir 1 ár í fyrirtæki", "2ar_fyrirtaeki": "Eftir 2 ár í fyrirtæki",
  "5ar_fyrirtaeki": "Eftir 5 ár í fyrirtæki",
  ungmenni_95: "18–19 ára (95% byrjunarlauna, <700 vinnust.)",
};

// 18–19 ára reglan af launablaði Hlíðarkaups: 95% af byrjunarlaunum þar til 700
// vinnustundum er náð — þá full laun. Starfsmaður með eldri starfsgreinarreynslu
// (trade_start á undan start_date) telst hafa náð stundunum.
export const YOUNG_ADULT_PCT = 0.95;
export const YOUNG_ADULT_HOURS = 700;

export interface WageRates {
  category: string; step: string; stepLabel: string; validFrom: string;
  monthly: number; dagvinna: number; eftirvinna: number | null; naeturvinna: number | null;
  yfirvinna: number; storhatid: number; age: number | null;
}

// Aldur úr íslenskri kennitölu á gefnum degi: DDMMYY + aldarstafur (9. tölustafur eftir
// hreinsun er raðtala; SÍÐASTI stafurinn er öldin: 9 = 1900, 0 = 2000, 8 = 1800).
export function ageFromKennitala(kennitala: string | null | undefined, at: Date): number | null {
  const kt = (kennitala ?? "").replace(/\D/g, "");
  if (kt.length !== 10) return null;
  const dd = Number(kt.slice(0, 2)), mm = Number(kt.slice(2, 4)), yy = Number(kt.slice(4, 6));
  const centuryDigit = kt[9];
  const century = centuryDigit === "9" ? 1900 : centuryDigit === "0" ? 2000 : centuryDigit === "8" ? 1800 : null;
  if (century == null || dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  const birth = new Date(Date.UTC(century + yy, mm - 1, dd));
  if (isNaN(birth.getTime())) return null;
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const anniv = new Date(Date.UTC(at.getUTCFullYear(), mm - 1, dd));
  if (at < anniv) age--;
  return age;
}

const monthsBetween = (from: Date, to: Date) =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) - (to.getUTCDate() < from.getUTCDate() ? 1 : 0);

interface ScaleRow { category: string; step: string; sort: number; valid_from: string; monthly: string; dagvinna: string; eftirvinna: string | null; naeturvinna: string | null; yfirvinna: string; storhatid: string }

/** Réttur taxti starfsmanns á degi `at`. null = flokkur óþekktur eða engir taxtar til.
 *  workedHours = vinnustundir starfsmannsins alls (fyrir 18–19 ára regluna; null = óþekkt → full laun). */
export async function resolveWageRates(opts: { kennitala?: string | null; category: string; startDate?: string | null; tradeStart?: string | null; at: Date; workedHours?: number | null }): Promise<WageRates | null> {
  const rows = await query<ScaleRow>(`
    select category, step, sort, valid_from::text as valid_from, monthly::text as monthly, dagvinna::text as dagvinna,
           eftirvinna::text as eftirvinna, naeturvinna::text as naeturvinna, yfirvinna::text as yfirvinna, storhatid::text as storhatid
    from acc.wage_scale
    where category = $1 and valid_from <= $2::date
      and valid_from = (select max(valid_from) from acc.wage_scale w2 where w2.category = $1 and w2.valid_from <= $2::date)
    order by sort`, [opts.category, opts.at.toISOString().slice(0, 10)]);
  if (!rows.length) return null;

  const age = ageFromKennitala(opts.kennitala, opts.at);
  const start = opts.startDate ? new Date(opts.startDate + "T00:00:00Z") : null;
  const trade = opts.tradeStart ? new Date(opts.tradeStart + "T00:00:00Z") : start;
  const mCompany = start ? Math.max(0, monthsBetween(start, opts.at)) : 0;
  const mTrade = trade ? Math.max(0, monthsBetween(trade, opts.at)) : 0;

  let pick: ScaleRow | undefined;
  if (age != null && age < 18) {
    // Unglingataxtar: nákvæmt aldursþrep (13 ára og yngri fá 14 ára taxtann). Flokkar án
    // unglingataxta (t.d. skrifstofa) falla á byrjunarlaun.
    const key = `${Math.min(17, Math.max(14, age))}ara`;
    pick = rows.find((r) => r.step === key) ?? rows.find((r) => r.step === "byrjun");
  } else {
    const eligible = (step: string) => {
      switch (step) {
        case "byrjun": return true;
        case "6man_grein": return mTrade >= 6 || (age != null && age >= 22);
        case "1ar_grein": return mTrade >= 12;
        case "3ar_grein": return mTrade >= 36;
        case "1ar_fyrirtaeki": return mCompany >= 12;
        case "2ar_fyrirtaeki": return mCompany >= 24;
        case "5ar_fyrirtaeki": return mCompany >= 60;
        default: return false;
      }
    };
    const ok = rows.filter((r) => eligible(r.step));
    pick = ok.length ? ok[ok.length - 1] : rows.find((r) => r.step === "byrjun");
  }
  if (!pick) return null;
  const n = (v: string | null) => (v == null ? null : Number(v));
  const r2 = (v: number) => Math.round(v * 100) / 100;

  // 18–19 ára reglan (launablað Hlíðarkaups): 95% af BYRJUNARLAUNUM að 700 vinnustundum.
  // Eldri starfsgreinarreynsla (trade_start < start_date) telst uppfylla stundirnar.
  const priorExperience = !!(opts.tradeStart && opts.startDate && opts.tradeStart < opts.startDate);
  if (age != null && (age === 18 || age === 19) && opts.workedHours != null && opts.workedHours < YOUNG_ADULT_HOURS && !priorExperience) {
    const byrjun = rows.find((r) => r.step === "byrjun");
    if (byrjun) {
      return {
        category: byrjun.category, step: "ungmenni_95", stepLabel: STEP_LABEL.ungmenni_95, validFrom: byrjun.valid_from,
        monthly: r2(Number(byrjun.monthly) * YOUNG_ADULT_PCT), dagvinna: r2(Number(byrjun.dagvinna) * YOUNG_ADULT_PCT),
        eftirvinna: byrjun.eftirvinna == null ? null : r2(Number(byrjun.eftirvinna) * YOUNG_ADULT_PCT),
        naeturvinna: byrjun.naeturvinna == null ? null : r2(Number(byrjun.naeturvinna) * YOUNG_ADULT_PCT),
        yfirvinna: r2(Number(byrjun.yfirvinna) * YOUNG_ADULT_PCT), storhatid: r2(Number(byrjun.storhatid) * YOUNG_ADULT_PCT), age,
      };
    }
  }

  return {
    category: pick.category, step: pick.step, stepLabel: STEP_LABEL[pick.step] ?? pick.step, validFrom: pick.valid_from,
    monthly: Number(pick.monthly), dagvinna: Number(pick.dagvinna),
    eftirvinna: n(pick.eftirvinna), naeturvinna: n(pick.naeturvinna),
    yfirvinna: Number(pick.yfirvinna), storhatid: Number(pick.storhatid), age,
  };
}

/** Vinnustundir starfsmanns ALLS (lokaðar vinnustimplanir) — fyrir 18–19 ára regluna. */
export async function totalWorkedHours(employeeId: string): Promise<number> {
  const r = await query<{ h: string }>(`
    select coalesce(sum(extract(epoch from (clock_out - clock_in)) / 3600.0), 0)::text as h
    from acc.time_entries where employee_id = $1 and entry_type = 'work' and clock_out is not null`, [employeeId]);
  return Number(r[0]?.h) || 0;
}
