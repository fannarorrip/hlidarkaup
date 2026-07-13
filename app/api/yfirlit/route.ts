import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Analytics for the bókhald "Yfirlit" (Vaktborð) dashboard. Sales = shop.sale_lines joined to
// their vouchers (till + sjálfsali + webshop + eldhús all post through postSale). Returns are
// negative line_totals on their own vouchers, so plain SUMs are net automatically. Every sales
// query filters status<>'reversed'. The whole board compares against the SAME WEEKDAY last week
// (current_date-7) — the number the owner actually reasons by — not against yesterday.
//
// Iceland observes no DST and sits on UTC year-round; `at time zone 'Atlantic/Reykjavik'` on
// posted_at (timestamptz) makes hour-of-day wall-clock-correct and explicit/portable.

const PAYMENT_ACCOUNTS: Record<string, string> = {
  "7716": "Kort", "7850": "Reiðufé", "7830": "Millifærsla", "7600": "Á reikning",
};

type Bil = "dagar" | "vikur" | "manudir";
const WINDOW_DAYS: Record<Bil, number> = { dagar: 30, vikur: 84, manudir: 365 };

// Base sales relation, reused everywhere.
const SALES = `from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id where v.status <> 'reversed'`;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("bil") ?? "dagar";
  const bil: Bil = raw === "vikur" || raw === "manudir" ? raw : "dagar";
  const N = WINDOW_DAYS[bil];
  const CUR = `v.voucher_date >= current_date - ${N - 1}`;                                    // this window (N days incl today)
  const PREV = `v.voucher_date >= current_date - ${2 * N - 1} and v.voucher_date <= current_date - ${N}`; // the N days before
  const SINCE_PREV = `v.voucher_date >= current_date - ${2 * N - 1}`;                          // both windows, one scan
  const bucketExpr = bil === "dagar" ? "v.voucher_date"
    : bil === "vikur" ? "date_trunc('week',v.voucher_date)::date"
    : "date_trunc('month',v.voucher_date)::date";

  // Run a query, but never let one failing panel blank the whole board.
  const safe = async <T>(p: Promise<T[]>, fb: T[] = []): Promise<T[]> => {
    try { return await p; } catch (e) { console.warn("[yfirlit] query failed:", (e as Error).message); return fb; }
  };

  // ── KPI / today / week-to-date / month-to-date, all vs same-weekday or day-aligned prior ──
  const kpiP = safe<KpiRow>(query(`
    with sala as (
      select v.voucher_date d, sl.line_total s, sl.quantity q, sl.voucher_id vid, v.source src
      ${SALES}
    )
    select
      current_date::text                                                            as cur_date,
      extract(isodow from current_date)::int                                        as cur_dow,
      extract(hour from now() at time zone 'Atlantic/Reykjavik')::int               as hour_now,
      coalesce(sum(s) filter (where d = current_date),0)::int                       as today,
      coalesce(count(distinct vid) filter (where d = current_date),0)::int          as today_n,
      coalesce(sum(q) filter (where d = current_date),0)::float8                    as today_lines,
      coalesce(sum(s) filter (where d = current_date - 7),0)::int                   as same_weekday,
      coalesce(count(distinct vid) filter (where d = current_date - 7),0)::int      as same_weekday_n,
      coalesce(sum(q) filter (where d = current_date - 7),0)::float8               as same_weekday_lines,
      coalesce(sum(s) filter (where d = current_date - 1),0)::int                  as yesterday,
      coalesce(sum(s) filter (where d >= date_trunc('week',current_date)::date),0)::int as wtd,
      coalesce(sum(s) filter (where d >= date_trunc('week',current_date)::date - 7
                                and d <= current_date - 7),0)::int                  as wtd_prev,
      coalesce(sum(s) filter (where d >= date_trunc('month',current_date)::date),0)::int as mtd,
      coalesce(sum(s) filter (where d >= (date_trunc('month',current_date) - interval '1 month')::date
                                and d <= (current_date - interval '1 month')::date),0)::int as mtd_prev
    from sala`));

  // Today's basket count split by channel (footfall by source).
  const todaySrcP = safe<{ src: string; n: number }>(query(`
    select coalesce(v.source,'?') src, count(distinct v.id)::int n
    ${SALES} and v.voucher_date = current_date group by 1`));

  // This-week vs last-week daily totals, bucketed by ISO weekday (Mán=1 .. Sun=7).
  const weekProfileP = safe<{ dow: number; is_this: boolean; s: number }>(query(`
    select extract(isodow from v.voucher_date)::int dow,
           (v.voucher_date >= date_trunc('week',current_date)::date) is_this,
           sum(sl.line_total)::int s
    ${SALES} and v.voucher_date >= date_trunc('week',current_date)::date - 7
          and v.voucher_date <= current_date
    group by 1,2`));

  // Trailing ~8-week average per weekday (excludes the in-progress week) → expectation caps + vikuspá.
  const weekdayExpP = safe<{ dow: number; e: number }>(query(`
    select dow, avg(daily)::int e from (
      select extract(isodow from v.voucher_date)::int dow, v.voucher_date, sum(sl.line_total) daily
      ${SALES} and v.voucher_date >= current_date - 55
            and v.voucher_date < date_trunc('week',current_date)::date
      group by 1,2
    ) t group by 1`));

  // Last 12 occurrences of today's weekday (e.g. last 12 Mondays) for the KPI sparkline.
  const sparkP = safe<{ d: string; s: number }>(query(`
    select v.voucher_date::text d, sum(sl.line_total)::int s
    ${SALES} and extract(isodow from v.voucher_date) = extract(isodow from current_date)
          and v.voucher_date <= current_date
    group by 1 order by 1 desc limit 12`));

  // Per-hour sums for today + the last 4 same-weekdays → intraday pace + nowcast.
  const intradayP = safe<{ hr: number; d: string; s: number }>(query(`
    select extract(hour from v.posted_at at time zone 'Atlantic/Reykjavik')::int hr,
           v.voucher_date::text d, sum(sl.line_total)::int s
    ${SALES} and v.posted_at is not null
          and v.voucher_date in (current_date, current_date-7, current_date-14, current_date-21, current_date-28)
    group by 1,2`));

  // Weekday × hour average matrix over the trailing 8 weeks (heatmap).
  const heatmapP = safe<{ dow: number; hr: number; avg_s: number }>(query(`
    select extract(isodow from v.voucher_date)::int dow,
           extract(hour from v.posted_at at time zone 'Atlantic/Reykjavik')::int hr,
           (sum(sl.line_total)::numeric / nullif(count(distinct v.voucher_date),0))::int avg_s
    ${SALES} and v.posted_at is not null and v.voucher_date >= current_date - 55
    group by 1,2`));

  // Today's gross margin (framlegð) + same weekday — only over lines with a known cost_price.
  const marginP = safe<MarginRow>(query(`
    select
      coalesce(sum(sl.line_total - sl.quantity*p.cost_price) filter (where v.voucher_date = current_date),0)::int   as fram_today,
      coalesce(sum(sl.line_total) filter (where v.voucher_date = current_date),0)::int                              as cov_today,
      coalesce(sum(sl.line_total - sl.quantity*p.cost_price) filter (where v.voucher_date = current_date - 7),0)::int as fram_prev,
      coalesce(sum(sl.line_total) filter (where v.voucher_date = current_date - 7),0)::int                          as cov_prev
    from shop.sale_lines sl
    join acc.vouchers v on v.id = sl.voucher_id
    join shop.products p on p.product_number = sl.product_number and p.cost_price is not null
    where v.status <> 'reversed' and v.voucher_date in (current_date, current_date - 7)`));

  // Returns health: today vs same weekday + reversed-voucher count.
  const returnsP = safe<ReturnsRow>(query(`
    select
      coalesce(-sum(sl.line_total) filter (where sl.line_total < 0 and v.voucher_date = current_date),0)::int neg_today,
      coalesce( sum(sl.line_total) filter (where sl.line_total > 0 and v.voucher_date = current_date),0)::int pos_today,
      coalesce(-sum(sl.line_total) filter (where sl.line_total < 0 and v.voucher_date = current_date - 7),0)::int neg_prev,
      coalesce( sum(sl.line_total) filter (where sl.line_total > 0 and v.voucher_date = current_date - 7),0)::int pos_prev
    from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id where v.status <> 'reversed'`));
  const reversedP = safe<{ n: number }>(query(
    `select count(*)::int n from acc.vouchers where status = 'reversed' and voucher_date = current_date`));

  // ── Window-dependent series (hero time-series with prior-cycle overlay) ──
  const seriesP = safe<SeriesRow>(query(seriesSql(bil)));

  // Category (vöruflokkur) sales + margin, this window vs prior window.
  const categoriesP = safe<CategoryRow>(query(`
    select coalesce(nullif(p.product_group,''),'—') grp,
      coalesce(sum(sl.line_total) filter (where ${CUR}),0)::int  sala,
      coalesce(sum(sl.line_total) filter (where ${PREV}),0)::int sala_prev,
      coalesce(sum(sl.line_total - sl.quantity*p.cost_price) filter (where ${CUR} and p.cost_price is not null),0)::int framlegd,
      coalesce(sum(sl.line_total) filter (where ${CUR} and p.cost_price is not null),0)::int covered
    from shop.sale_lines sl
    join acc.vouchers v on v.id = sl.voucher_id
    join shop.products p on p.product_number = sl.product_number
    where v.status <> 'reversed' and ${SINCE_PREV}
    group by 1 order by 2 desc limit 8`));

  // Payment split this window vs prior window (keep the debit-credit sign exactly).
  const paymentsP = safe<{ a: string; s: number; sprev: number }>(query(`
    select le.account_number a,
      coalesce(sum(le.debit - le.credit) filter (where ${CUR}),0)::int  s,
      coalesce(sum(le.debit - le.credit) filter (where ${PREV}),0)::int sprev
    from acc.ledger_entries le
    join acc.vouchers v on v.id = le.voucher_id
    where v.status <> 'reversed' and le.account_number in ('7716','7850','7830','7600') and ${SINCE_PREV}
    group by 1`));

  // Top products this window (+ margin + this-window rank).
  const topP = safe<TopRow>(query(`
    select sl.product_number nr, max(sl.name) name,
      sum(sl.line_total)::int s, sum(sl.quantity)::float8 q,
      coalesce(sum(sl.line_total - sl.quantity*p.cost_price) filter (where p.cost_price is not null),0)::int framlegd,
      coalesce(sum(sl.line_total) filter (where p.cost_price is not null),0)::int covered,
      rank() over (order by sum(sl.line_total) desc)::int rnk
    from shop.sale_lines sl
    join acc.vouchers v on v.id = sl.voucher_id
    left join shop.products p on p.product_number = sl.product_number
    where v.status <> 'reversed' and ${CUR} and sl.product_number is not null
    group by 1 order by 3 desc limit 12`));

  // Biggest movers (kr swing this window vs prior).
  const moversP = safe<{ nr: string; name: string; cur: number; prev: number }>(query(`
    select sl.product_number nr, max(sl.name) name,
      coalesce(sum(sl.line_total) filter (where ${CUR}),0)::int  cur,
      coalesce(sum(sl.line_total) filter (where ${PREV}),0)::int prev
    from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id
    where v.status <> 'reversed' and ${SINCE_PREV} and sl.product_number is not null
    group by 1
    order by abs(coalesce(sum(sl.line_total) filter (where ${CUR}),0)
                 - coalesce(sum(sl.line_total) filter (where ${PREV}),0)) desc
    limit 8`));

  // Channel mix over time (source × bucket), this window.
  const channelsP = safe<{ b: string; src: string; s: number }>(query(`
    select ${bucketExpr}::text b, coalesce(v.source,'?') src, sum(sl.line_total)::int s
    ${SALES} and ${CUR} group by 1,2 order by 1`));

  // Slow / dead stock: sold in the last 30d but 0 units in the last 7d.
  const deadP = safe<{ nr: string; name: string; grp: string | null; last_sold: string }>(query(`
    with last7 as (
      select sl.product_number nr, sum(sl.quantity) q
      from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id
      where v.status <> 'reversed' and v.voucher_date >= current_date - 6 group by 1
    )
    select sl.product_number nr, max(sl.name) name, max(p.product_group) grp, max(v.voucher_date)::text last_sold
    from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id
    left join shop.products p on p.product_number = sl.product_number
    where v.status <> 'reversed' and v.voucher_date >= current_date - 29 and sl.product_number is not null
    group by 1
    having coalesce((select q from last7 where last7.nr = sl.product_number),0) = 0
    order by max(v.voucher_date) asc limit 15`));

  const [kpiRows, todaySrc, weekProfile, weekdayExp, spark, intraday, heatmap, marginRows,
         returnsRows, reversedRows, series, categories, payRows, top, movers, channelRows, dead] =
    await Promise.all([kpiP, todaySrcP, weekProfileP, weekdayExpP, sparkP, intradayP, heatmapP, marginP,
      returnsP, reversedP, seriesP, categoriesP, paymentsP, topP, moversP, channelsP, deadP]);

  const kpi = kpiRows[0] ?? EMPTY_KPI;
  const curDow = kpi.cur_dow || 1;
  const hourNow = kpi.hour_now ?? 12;

  // Prior-window ranks for exactly the current top set (compute full ranking in-DB, return few rows).
  const topNrs = top.map((t) => t.nr);
  const priorRankRows = topNrs.length
    ? await safe<{ nr: string; rnk: number }>(query(`
        with pr as (
          select sl.product_number nr, rank() over (order by sum(sl.line_total) desc)::int rnk
          from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id
          where v.status <> 'reversed' and ${PREV} and sl.product_number is not null
          group by 1
        ) select nr, rnk from pr where nr = any($1::text[])`, [topNrs]))
    : [];
  const priorRank = new Map(priorRankRows.map((r) => [r.nr, r.rnk]));

  // ── Shape the response ──────────────────────────────────────────────────────────────────

  // Week strip / hero: dow 1..7 with this-week, last-week, expectation.
  const thisByDow = new Map<number, number>(), prevByDow = new Map<number, number>();
  for (const r of weekProfile) (r.is_this ? thisByDow : prevByDow).set(r.dow, r.s);
  const expByDow = new Map(weekdayExp.map((r) => [r.dow, r.e]));
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const dow = i + 1;
    return {
      dow,
      cur: thisByDow.get(dow) ?? 0,
      prev: prevByDow.get(dow) ?? 0,
      expected: expByDow.get(dow) ?? 0,
      future: dow > curDow,
    };
  });
  // vikuspá: VTD ÷ expected cumulative share of the week completed through today.
  const expTotal = weekDays.reduce((s, d) => s + d.expected, 0);
  const expThrough = weekDays.filter((d) => d.dow <= curDow).reduce((s, d) => s + d.expected, 0);
  const weekShare = expTotal > 0 ? expThrough / expTotal : 0;
  const vikuspa = weekShare > 0 && curDow >= 2 ? Math.round(kpi.wtd / weekShare) : null;

  // Intraday pace: cumulative today vs typical same-weekday curve (+ min/max band).
  const pace = buildPace(intraday, hourNow);

  // Margin today.
  const m = marginRows[0] ?? { fram_today: 0, cov_today: 0, fram_prev: 0, cov_prev: 0 };
  const covToday = m.cov_today, covPrev = m.cov_prev;
  const marginToday = {
    kr: covToday > 0 ? m.fram_today : null,
    pct: covToday > 0 ? (m.fram_today / covToday) * 100 : null,
    pctPrev: covPrev > 0 ? (m.fram_prev / covPrev) * 100 : null,
    coverage: kpi.today > 0 ? covToday / kpi.today : 0,
  };

  // Returns.
  const rr = returnsRows[0] ?? { neg_today: 0, pos_today: 0, neg_prev: 0, pos_prev: 0 };
  const returns = {
    rate: rr.pos_today > 0 ? rr.neg_today / rr.pos_today : 0,
    ratePrev: rr.pos_prev > 0 ? rr.neg_prev / rr.pos_prev : 0,
    reversedCount: reversedRows[0]?.n ?? 0,
  };

  // Categories: coverage + margin%.
  const cats = categories.map((c) => ({
    grp: c.grp, sala: c.sala, salaPrev: c.sala_prev,
    framlegdPct: c.covered > 0 ? (c.framlegd / c.covered) * 100 : null,
    coverage: c.sala > 0 ? c.covered / c.sala : 0,
  }));

  // Payments: current + prior share.
  const payTotal = payRows.reduce((s, r) => s + Math.max(0, r.s), 0);
  const payPrevTotal = payRows.reduce((s, r) => s + Math.max(0, r.sprev), 0);
  const payments = payRows
    .map((r) => ({
      name: PAYMENT_ACCOUNTS[r.a] ?? r.a, value: r.s,
      share: payTotal > 0 ? r.s / payTotal : 0,
      sharePrev: payPrevTotal > 0 ? r.sprev / payPrevTotal : 0,
    }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);

  // Top products enriched.
  const topProducts = top.map((t) => ({
    nr: t.nr, name: t.name, sala: t.s, magn: t.q,
    marginPct: t.covered > 0 ? (t.framlegd / t.covered) * 100 : null,
    coverage: t.s > 0 ? t.covered / t.s : 0,
    rankNow: t.rnk, rankPrev: priorRank.get(t.nr) ?? null,
  }));

  // Channels pivot.
  const channelBuckets = new Map<string, { bucket: string; till: number; kiosk: number; web: number; eldhus: number; other: number }>();
  for (const r of channelRows) {
    const b = channelBuckets.get(r.b) ?? { bucket: r.b, till: 0, kiosk: 0, web: 0, eldhus: 0, other: 0 };
    if (r.src === "till") b.till += r.s; else if (r.src === "kiosk") b.kiosk += r.s;
    else if (r.src === "web") b.web += r.s; else if (r.src === "eldhus") b.eldhus += r.s; else b.other += r.s;
    channelBuckets.set(r.b, b);
  }
  const channels = [...channelBuckets.values()];

  return NextResponse.json({
    bil,
    today: {
      date: kpi.cur_date, isodow: curDow, hourNow,
      sala: kpi.today, fjoldi: kpi.today_n, lines: kpi.today_lines,
      sameWeekday: kpi.same_weekday, sameWeekdayN: kpi.same_weekday_n, sameWeekdayLines: kpi.same_weekday_lines,
      yesterday: kpi.yesterday,
      sourceSplit: todaySrc,
    },
    week: {
      wtd: kpi.wtd, wtdPrev: kpi.wtd_prev, daysElapsed: curDow, vikuspa,
      strip: weekDays.map(({ dow, cur, prev, future }) => ({ dow, cur, prev, future })),
    },
    month: { mtd: kpi.mtd, mtdPrev: kpi.mtd_prev },
    pace,
    margin: marginToday,
    returns,
    sparkline: [...spark].reverse().map((r) => r.s),
    weekProfile: weekDays,
    intraday: pace.series,
    heatmap,
    series: series.map((r) => ({ d: r.d, sala: r.s, salaPrev: r.sprev, fjoldi: r.c, weekday: r.wd })),
    categories: cats,
    payments,
    topProducts,
    movers: movers.map((r) => ({ nr: r.nr, name: r.name, cur: r.cur, prev: r.prev, diff: r.cur - r.prev })),
    channels,
    deadStock: dead.map((r) => ({ nr: r.nr, name: r.name, grp: r.grp, lastSold: r.last_sold })),
  });
}

// ── Types ───────────────────────────────────────────────────────────────────────────────────
interface KpiRow {
  cur_date: string; cur_dow: number; hour_now: number;
  today: number; today_n: number; today_lines: number;
  same_weekday: number; same_weekday_n: number; same_weekday_lines: number;
  yesterday: number; wtd: number; wtd_prev: number; mtd: number; mtd_prev: number;
}
const EMPTY_KPI: KpiRow = {
  cur_date: new Date().toISOString().slice(0, 10), cur_dow: 1, hour_now: 12,
  today: 0, today_n: 0, today_lines: 0, same_weekday: 0, same_weekday_n: 0, same_weekday_lines: 0,
  yesterday: 0, wtd: 0, wtd_prev: 0, mtd: 0, mtd_prev: 0,
};
interface MarginRow { fram_today: number; cov_today: number; fram_prev: number; cov_prev: number; }
interface ReturnsRow { neg_today: number; pos_today: number; neg_prev: number; pos_prev: number; }
interface SeriesRow { d: string; s: number; sprev: number; c: number; wd: number; }
interface CategoryRow { grp: string; sala: number; sala_prev: number; framlegd: number; covered: number; }
interface TopRow { nr: string; name: string; s: number; q: number; framlegd: number; covered: number; rnk: number; }

// ── Hero time-series SQL (zero-filled + prior-cycle lag) ──────────────────────────────────────
function seriesSql(bil: Bil): string {
  if (bil === "vikur") {
    return `
      with weeks as (select generate_series(date_trunc('week',current_date)::date - 77,
                                            date_trunc('week',current_date)::date, '7 days')::date d),
      sala as (select date_trunc('week',v.voucher_date)::date d, sum(sl.line_total)::int s,
                      count(distinct sl.voucher_id)::int c ${SALES} group by 1)
      select weeks.d::text d, coalesce(cur.s,0) s, coalesce(prev.s,0) sprev, coalesce(cur.c,0) c, 0 wd
        from weeks
        left join sala cur  on cur.d  = weeks.d
        left join sala prev on prev.d = weeks.d - 7
       order by weeks.d`;
  }
  if (bil === "manudir") {
    return `
      with months as (select generate_series('2025-01-01'::date,
                                             date_trunc('month',current_date)::date, '1 month')::date d),
      sala as (select date_trunc('month',v.voucher_date)::date d, sum(sl.line_total)::int s,
                      count(distinct sl.voucher_id)::int c ${SALES} group by 1)
      select months.d::text d, coalesce(cur.s,0) s, coalesce(prev.s,0) sprev, coalesce(cur.c,0) c, 0 wd
        from months
        left join sala cur  on cur.d  = months.d
        left join sala prev on prev.d = (months.d - interval '1 month')::date
       order by months.d`;
  }
  return `
    with days as (select generate_series(current_date - 29, current_date, '1 day')::date d),
    sala as (select v.voucher_date d, sum(sl.line_total)::int s,
                    count(distinct sl.voucher_id)::int c ${SALES} group by 1)
    select days.d::text d, coalesce(cur.s,0) s, coalesce(prev.s,0) sprev, coalesce(cur.c,0) c,
           extract(isodow from days.d)::int wd
      from days
      left join sala cur  on cur.d  = days.d
      left join sala prev on prev.d = days.d - 7
     order by days.d`;
}

// ── Intraday pace / nowcast from per-hour sums (today + last 4 same weekdays) ──────────────────
function buildPace(rows: { hr: number; d: string; s: number }[], hourNow: number) {
  const dates = [...new Set(rows.map((r) => r.d))].sort();          // ascending
  const today = dates[dates.length - 1];                            // most recent = today (current_date)
  const priorDates = dates.filter((d) => d !== today);
  const byDate = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const m = byDate.get(r.d) ?? new Map<number, number>();
    m.set(r.hr, (m.get(r.hr) ?? 0) + r.s);
    byDate.set(r.d, m);
  }
  const hrs = rows.map((r) => r.hr);
  const loHr = hrs.length ? Math.min(8, ...hrs) : 8;
  const hiHr = hrs.length ? Math.max(21, ...hrs) : 21;

  const cumOf = (m: Map<number, number> | undefined) => {
    const out: number[] = []; let run = 0;
    for (let h = loHr; h <= hiHr; h++) { run += m?.get(h) ?? 0; out.push(run); }
    return out;
  };
  const todayCum = cumOf(byDate.get(today));
  const priorCums = priorDates.map((d) => cumOf(byDate.get(d))).filter((c) => c[c.length - 1] > 0);

  const series = [];
  for (let i = 0, h = loHr; h <= hiHr; h++, i++) {
    const vals = priorCums.map((c) => c[i]);
    const typical = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    series.push({
      hr: h,
      today: h <= hourNow ? todayCum[i] : null,
      typical,
      lo: vals.length ? Math.min(...vals) : 0,
      hi: vals.length ? Math.max(...vals) : 0,
    });
  }

  const typicalFullDay = priorCums.length
    ? Math.round(priorCums.reduce((a, c) => a + c[c.length - 1], 0) / priorCums.length) : 0;
  const idxNow = Math.max(0, Math.min(series.length - 1, hourNow - loHr));
  const typicalNow = series[idxNow]?.typical ?? 0;
  const cumShareNow = typicalFullDay > 0 ? typicalNow / typicalFullDay : 0;
  const todaySoFar = todayCum[Math.min(idxNow, todayCum.length - 1)] ?? 0;
  const hasHistory = priorCums.length >= 2 && cumShareNow > 0.02;
  const projected = hasHistory ? Math.round(todaySoFar / cumShareNow) : null;

  return { hasHistory, projected, typicalFullDay, cumShareNow, todaySoFar, hourNow, series };
}
