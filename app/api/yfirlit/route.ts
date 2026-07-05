import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Analytics for the bókhald Yfirlit dashboard. Sales = shop.sale_lines joined to their
// vouchers (till + sjálfsali + webshop + eldhús all post through postSale). Returns are
// negative line_totals on their own vouchers, so plain sums are net automatically.
// Payment split comes from the ledger: 7716 kort, 7850 reiðufé, 7830 millifærsla, 7600 á reikning.

const PAYMENT_ACCOUNTS: Record<string, string> = {
  "7716": "Kort",
  "7850": "Reiðufé",
  "7830": "Millifærsla",
  "7600": "Á reikning",
};

type Bil = "dagar" | "vikur" | "manudir";

export async function GET(req: NextRequest) {
  const bil = (req.nextUrl.searchParams.get("bil") ?? "dagar") as Bil;

  // Window for the aggregate panels (payments, top products) follows the picked granularity.
  const from =
    bil === "manudir" ? "2025-01-01" : bil === "vikur" ? "current_date - 83" : "current_date - 29";
  const fromExpr = bil === "manudir" ? `'2025-01-01'::date` : from;

  // ── KPI row: today / week-to-date / month-to-date, each vs the comparable prior window ──
  const [kpi] = await query<{
    today: string; today_n: string; yesterday: string;
    wtd: string; wtd_prev: string; mtd: string; mtd_prev: string;
  }>(`
    with sala as (
      select v.voucher_date d, sl.line_total s, sl.voucher_id vid
        from shop.sale_lines sl
        join acc.vouchers v on v.id = sl.voucher_id
       where v.status <> 'reversed'
    )
    select
      coalesce(sum(s) filter (where d = current_date), 0)                                    as today,
      coalesce(count(distinct vid) filter (where d = current_date), 0)                       as today_n,
      coalesce(sum(s) filter (where d = current_date - 1), 0)                                as yesterday,
      coalesce(sum(s) filter (where d >= date_trunc('week', current_date)::date), 0)         as wtd,
      coalesce(sum(s) filter (where d >= date_trunc('week', current_date)::date - 7
                                and d <= current_date - 7), 0)                               as wtd_prev,
      coalesce(sum(s) filter (where d >= date_trunc('month', current_date)::date), 0)        as mtd,
      coalesce(sum(s) filter (where d >= (date_trunc('month', current_date) - interval '1 month')::date
                                and d <= (current_date - interval '1 month')::date), 0)      as mtd_prev
    from sala`);

  // ── Time series for the main chart (zero-filled so quiet days show as gaps, not holes) ──
  let series: { d: string; s: number; c: number }[];
  if (bil === "dagar") {
    series = await query(`
      with days as (select generate_series(current_date - 29, current_date, '1 day')::date d),
      sala as (
        select v.voucher_date d, sum(sl.line_total)::int s, count(distinct sl.voucher_id)::int c
          from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id
         where v.status <> 'reversed' group by 1)
      select days.d::text, coalesce(sala.s, 0) s, coalesce(sala.c, 0) c
        from days left join sala on sala.d = days.d order by days.d`);
  } else if (bil === "vikur") {
    series = await query(`
      with weeks as (select generate_series(date_trunc('week', current_date)::date - 77,
                                            date_trunc('week', current_date)::date, '7 days')::date d),
      sala as (
        select date_trunc('week', v.voucher_date)::date d, sum(sl.line_total)::int s,
               count(distinct sl.voucher_id)::int c
          from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id
         where v.status <> 'reversed' group by 1)
      select weeks.d::text, coalesce(sala.s, 0) s, coalesce(sala.c, 0) c
        from weeks left join sala on sala.d = weeks.d order by weeks.d`);
  } else {
    series = await query(`
      with months as (select generate_series('2025-01-01'::date,
                                             date_trunc('month', current_date)::date, '1 month')::date d),
      sala as (
        select date_trunc('month', v.voucher_date)::date d, sum(sl.line_total)::int s,
               count(distinct sl.voucher_id)::int c
          from shop.sale_lines sl join acc.vouchers v on v.id = sl.voucher_id
         where v.status <> 'reversed' group by 1)
      select months.d::text, coalesce(sala.s, 0) s, coalesce(sala.c, 0) c
        from months left join sala on sala.d = months.d order by months.d`);
  }

  // ── Payment-method split over the window ──
  const payRows = await query<{ a: string; s: string }>(`
    select le.account_number a, sum(le.debit - le.credit)::int s
      from acc.ledger_entries le
      join acc.vouchers v on v.id = le.voucher_id
     where v.status <> 'reversed' and v.voucher_date >= ${fromExpr}
       and le.account_number in ('7716','7850','7830','7600')
     group by 1`);
  const payments = payRows
    .map((r) => ({ name: PAYMENT_ACCOUNTS[r.a] ?? r.a, value: Number(r.s) }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);

  // ── Top 10 products over the window ──
  const topProducts = await query<{ nr: string; name: string; s: string; q: string }>(`
    select coalesce(sl.product_number, '—') nr, max(sl.name) name,
           sum(sl.line_total)::int s, sum(sl.quantity)::numeric(18,3) q
      from shop.sale_lines sl
      join acc.vouchers v on v.id = sl.voucher_id
     where v.status <> 'reversed' and v.voucher_date >= ${fromExpr}
     group by 1 order by 3 desc limit 10`);

  return NextResponse.json({
    kpi: {
      today: Number(kpi.today), todayN: Number(kpi.today_n), yesterday: Number(kpi.yesterday),
      wtd: Number(kpi.wtd), wtdPrev: Number(kpi.wtd_prev),
      mtd: Number(kpi.mtd), mtdPrev: Number(kpi.mtd_prev),
    },
    series: series.map((r) => ({ d: r.d, sala: Number(r.s), fjoldi: Number(r.c) })),
    payments,
    topProducts: topProducts.map((r) => ({ nr: r.nr, name: r.name, sala: Number(r.s), magn: Number(r.q) })),
  });
}
