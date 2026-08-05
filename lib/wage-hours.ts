// SJÁLFVIRK FLOKKUN stimplaðra tíma í launategundir skv. kjarasamningi VR/SA (afgreiðslufólk):
//   • Dagvinna: kl. 09:00–18:00 mánudaga–föstudaga (ekki frídaga)
//   • Eftirvinna: öll vinna UTAN dagvinnutímabils — kvöld 18–24, morgnar fyrir 9,
//     helgar og almennir frídagar (skírdagur, annar í páskum, sumardagurinn fyrsti,
//     1. maí, uppstigningardagur, annar í hvítasunnu, annar í jólum)
//   • Næturvinna: kl. 00:00–07:00 alla daga
//   • Stórhátíðarkaup: nýársdagur, föstudagurinn langi, páskadagur, hvítasunnudagur,
//     17. júní, frídagur verslunarmanna, jóladagur — og EFTIR kl. 12 á aðfangadag og gamlársdag
//   • Yfirvinna: samanlögð vinna umfram 167,94 klst á launatímabilinu — umframtímarnir
//     færast af eftir-/nætur-/dagvinnu (í þeirri röð) yfir á yfirvinnutaxta.
// Heimildir: vr.is (Eftir-/nætur-, yfir- og stórhátíðarvinna) og sa.is (Eftir- og yfirvinna
// verslunarmanna) — fullt starf afgreiðslufólks 167,94 klst/mán.

export const FULL_TIME_HOURS = 167.94;

export interface HourBuckets { dag: number; eftir: number; natur: number; yfir: number; storhatid: number }

// Páskadagur (Gregorian, Meeus/anonymous algorithm) — UTC dagsetning.
function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
const sameDay = (a: Date, y: number, m: number, d: number) => a.getUTCFullYear() === y && a.getUTCMonth() === m - 1 && a.getUTCDate() === d;
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 864e5);

// Fyrsti mánudagur í ágúst (frídagur verslunarmanna).
function fridagurVerslunarmanna(year: number): Date {
  const d = new Date(Date.UTC(year, 7, 1));
  return plus(d, (8 - d.getUTCDay()) % 7);
}
// Sumardagurinn fyrsti: fyrsti fimmtudagur eftir 18. apríl.
function sumardagurinnFyrsti(year: number): Date {
  const d = new Date(Date.UTC(year, 3, 19));
  return plus(d, (4 - d.getUTCDay() + 7) % 7);
}

type DayKind = "storhatid" | "storhatid_after12" | "holiday" | "weekend" | "workday";

const dayKindCache = new Map<string, DayKind>();
export function dayKind(day: Date): DayKind {
  const key = day.toISOString().slice(0, 10);
  const hit = dayKindCache.get(key);
  if (hit) return hit;
  const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
  const e = easter(y);
  let kind: DayKind;
  if ((m === 1 && d === 1) || (m === 6 && d === 17) || (m === 12 && d === 25)
    || sameDay(plus(e, -2), y, m, d) || sameDay(e, y, m, d) || sameDay(plus(e, 49), y, m, d)
    || sameDay(fridagurVerslunarmanna(y), y, m, d)) kind = "storhatid";
  else if ((m === 12 && d === 24) || (m === 12 && d === 31)) kind = "storhatid_after12";
  else if ((m === 5 && d === 1) || (m === 12 && d === 26)
    || sameDay(plus(e, -3), y, m, d) || sameDay(plus(e, 1), y, m, d)
    || sameDay(plus(e, 39), y, m, d) || sameDay(plus(e, 50), y, m, d)
    || sameDay(sumardagurinnFyrsti(y), y, m, d)) kind = "holiday";
  else if (day.getUTCDay() === 0 || day.getUTCDay() === 6) kind = "weekend";
  else kind = "workday";
  dayKindCache.set(key, kind);
  return kind;
}

// Flokkar EITT vinnutímabil [inn, út) mínútu fyrir mínútu í fötur (án yfirvinnureglu).
// Tímarnir eru túlkaðir á íslenskum staðartíma; Ísland er á UTC allt árið svo UTC dugar.
export function classifyInterval(clockIn: Date, clockOut: Date, into: HourBuckets): void {
  let t = clockIn.getTime();
  const end = clockOut.getTime();
  while (t < end) {
    const cur = new Date(t);
    const day = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate()));
    const nextMidnight = day.getTime() + 864e5;
    const segEnd = Math.min(end, nextMidnight);
    const kind = dayKind(day);
    // skipta deginum í [frá-klst, til-klst) → fata
    const pieces: { from: number; to: number; bucket: keyof HourBuckets }[] = [];
    if (kind === "storhatid") pieces.push({ from: 0, to: 24, bucket: "storhatid" });
    else {
      const after12 = kind === "storhatid_after12";
      // Aðfangadagur/gamlársdagur eru VENJULEGIR dagar fram að hádegi — dagvinna 9–12 sé
      // dagurinn virkur; falli þeir á helgi gildir helgarsniðið fram að hádegi.
      const dow = day.getUTCDay();
      const workLayout = kind === "workday" || (after12 && dow >= 1 && dow <= 5);
      pieces.push({ from: 0, to: 7, bucket: "natur" });
      if (workLayout) {
        pieces.push({ from: 7, to: 9, bucket: "eftir" }, { from: 9, to: 18, bucket: "dag" }, { from: 18, to: 24, bucket: "eftir" });
      } else {
        pieces.push({ from: 7, to: 24, bucket: "eftir" }); // helgi/frídagur: allt utan nætur = eftirvinna
      }
      if (after12) {
        // aðfangadagur/gamlársdagur: frá kl. 12 gildir stórhátíðarkaup — yfirskrifar það sem ofan á lendir
        for (const p of pieces.slice()) {
          if (p.to > 12) {
            if (p.from < 12) { pieces.push({ from: 12, to: p.to, bucket: "storhatid" }); p.to = 12; }
            else p.bucket = "storhatid";
          }
        }
      }
    }
    for (const p of pieces) {
      const pFrom = day.getTime() + p.from * 3600_000;
      const pTo = day.getTime() + p.to * 3600_000;
      const from = Math.max(t, pFrom), to = Math.min(segEnd, pTo);
      if (to > from) into[p.bucket] += (to - from) / 3600_000;
    }
    t = segEnd;
  }
}

/** Flokkar vinnutímabil starfsmanns + beitir yfirvinnureglunni: samanlagt umfram
 *  fullTime (167,94) færist á yfirvinnu — fyrst af eftirvinnu, svo nætur, svo dagvinnu.
 *  absenceHours (veikindi/orlof á launum) teljast með í þröskuldinn sem dagvinnuígildi. */
export function classifyPeriod(intervals: { clockIn: Date; clockOut: Date }[], absenceHours = 0, fullTime = FULL_TIME_HOURS): HourBuckets {
  const b: HourBuckets = { dag: 0, eftir: 0, natur: 0, yfir: 0, storhatid: 0 };
  for (const iv of intervals) if (iv.clockOut > iv.clockIn) classifyInterval(iv.clockIn, iv.clockOut, b);
  const counted = b.dag + b.eftir + b.natur + absenceHours; // stórhátíð stendur utan þröskuldar
  let excess = Math.max(0, counted - fullTime);
  for (const k of ["eftir", "natur", "dag"] as const) {
    if (excess <= 0) break;
    const take = Math.min(b[k], excess);
    b[k] -= take; b.yfir += take; excess -= take;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { dag: r2(b.dag), eftir: r2(b.eftir), natur: r2(b.natur), yfir: r2(b.yfir), storhatid: r2(b.storhatid) };
}
