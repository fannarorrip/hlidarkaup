"use client";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, ReferenceLine, LineChart,
} from "recharts";
import { kr, VIKUDAGAR, VIKUDAGAR_STUTT } from "@/lib/format";

// ── Palette (same family as the till). SOLID TEAL = now, GHOST TEAL_LIGHT / dashed gray = comparison. ──
const RED = "#DB1A1A";
const INK = "#21323A";
const TEAL = "#2C687B";
const TEAL_LIGHT = "#8CC7C4";
const AMBER = "#E5A33D";
const GHOST = "#C9DEDC";      // last-week / prior-cycle bars
const GRID = "#eef2f4";
const AXIS = "#8a9aa4";
const PIE_COLORS = [TEAL, RED, TEAL_LIGHT, AMBER];

const MAN = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];

// Icelandic number rendering via lib/format (dot thousands, comma decimals).
const krFull = (n: number) => kr(n);
const krStutt = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} m.` :
  Math.abs(n) >= 1_000 ? `${Math.round(n / 1_000)} þ.` : String(Math.round(n));
const pct1 = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;
const magn = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

type Bil = "dagar" | "vikur" | "manudir";

interface Data {
  bil: Bil;
  today: {
    date: string; isodow: number; hourNow: number;
    sala: number; fjoldi: number; lines: number;
    sameWeekday: number; sameWeekdayN: number; sameWeekdayLines: number; yesterday: number;
    sourceSplit: { src: string; n: number }[];
  };
  week: { wtd: number; wtdPrev: number; daysElapsed: number; vikuspa: number | null;
    strip: { dow: number; cur: number; prev: number; future: boolean }[] };
  month: { mtd: number; mtdPrev: number };
  pace: { hasHistory: boolean; projected: number | null; typicalFullDay: number; cumShareNow: number;
    todaySoFar: number; hourNow: number;
    series: { hr: number; today: number | null; typical: number; lo: number; hi: number }[] };
  margin: { kr: number | null; pct: number | null; pctPrev: number | null; coverage: number };
  returns: { rate: number; ratePrev: number; reversedCount: number };
  sparkline: number[];
  weekProfile: { dow: number; cur: number; prev: number; expected: number; future: boolean }[];
  intraday: { hr: number; today: number | null; typical: number; lo: number; hi: number }[];
  heatmap: { dow: number; hr: number; avg_s: number }[];
  series: { d: string; sala: number; salaPrev: number; fjoldi: number; weekday: number }[];
  categories: { grp: string; sala: number; salaPrev: number; framlegdPct: number | null; coverage: number }[];
  payments: { name: string; value: number; share: number; sharePrev: number }[];
  topProducts: { nr: string; name: string; sala: number; magn: number; marginPct: number | null; coverage: number; rankNow: number; rankPrev: number | null }[];
  movers: { nr: string; name: string; cur: number; prev: number; diff: number }[];
  channels: { bucket: string; till: number; kiosk: number; web: number; eldhus: number; other: number }[];
  deadStock: { nr: string; name: string; grp: string | null; lastSold: string }[];
  prevOwner?: { sameWeekday: number; n: number; sameDateLastYear: number } | null;
}

const SOURCE_LABEL: Record<string, string> = { till: "Kassi", kiosk: "Sjálfsafgr.", web: "Vefur", eldhus: "Eldhús", "?": "Annað" };

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
function seriesLabel(d: string, bil: Bil): string {
  const dt = new Date(d + "T00:00:00");
  if (bil === "dagar") return `${dt.getDate()}.${dt.getMonth() + 1}.`;
  if (bil === "vikur") return `V${isoWeek(dt)}`;
  return `${MAN[dt.getMonth()]} ´${String(dt.getFullYear()).slice(2)}`;
}

// ── Small shared bits ─────────────────────────────────────────────────────────────────────────
function Delta({ now, prev, absolute = false }: { now: number; prev: number; absolute?: boolean }) {
  if (!prev) return <span className="text-xs text-gray-400">— enginn samanburður</span>;
  const pct = ((now - prev) / prev) * 100;
  const flat = Math.abs(pct) < 2;
  const up = pct >= 0;
  const cls = flat ? "text-gray-400" : up ? "text-emerald-600" : "text-red-600";
  return (
    <span className={`text-xs font-semibold ${cls}`}>
      {flat ? "▬" : up ? "▲" : "▼"} {Math.abs(pct).toFixed(1).replace(".", ",")}%
      {absolute && <span className="font-normal"> · {up ? "+" : "−"}{krStutt(Math.abs(now - prev))}</span>}
      <span className="text-gray-400 font-normal"> (áður {krStutt(prev)})</span>
    </span>
  );
}
function DeltaPP({ now, prev, invertColor = false }: { now: number | null; prev: number | null; invertColor?: boolean }) {
  if (now == null || prev == null) return <span className="text-xs text-gray-400">—</span>;
  const d = now - prev;
  const flat = Math.abs(d) < 0.3;
  const good = invertColor ? d <= 0 : d >= 0;
  const cls = flat ? "text-gray-400" : good ? "text-emerald-600" : "text-red-600";
  return <span className={`text-xs font-semibold ${cls}`}>{flat ? "▬" : d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1).replace(".", ",")} pp</span>;
}
function Kpi({ title, value, basis, children }: { title: string; value: string; basis?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: INK }}>{value}</p>
      {basis && <p className="text-[11px] text-gray-400 mt-0.5">{basis}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
function Panel({ title, subtitle, right, children, className = "" }:
  { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-lg leading-tight" style={{ color: INK }}>{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) =>
  <p className="text-sm text-gray-400 py-12 text-center">{children}</p>;

// Tiny inline bar sparkline — last value highlighted.
function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <div className="h-8" />;
  const max = Math.max(1, ...values.map(Math.abs));
  return (
    <div className="flex items-end gap-[3px] h-8 mt-1">
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm" title={krFull(v)}
          style={{ height: `${Math.max(6, (Math.abs(v) / max) * 100)}%`, background: i === values.length - 1 ? TEAL : TEAL_LIGHT }} />
      ))}
    </div>
  );
}

const BIL_LABEL: Record<Bil, string> = { dagar: "Dagar", vikur: "Vikur", manudir: "Mánuðir" };
const WINDOW_LABEL: Record<Bil, string> = { dagar: "síðustu 30 daga", vikur: "síðustu 12 vikur", manudir: "frá janúar 2025" };
const PREV_WINDOW_LABEL: Record<Bil, string> = { dagar: "fyrri 30 daga", vikur: "fyrri 12 vikur", manudir: "fyrra tímabil" };

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="h-80 bg-gray-100 rounded-xl" />
      <div className="grid lg:grid-cols-2 gap-6"><div className="h-72 bg-gray-100 rounded-xl" /><div className="h-72 bg-gray-100 rounded-xl" /></div>
    </div>
  );
}

export default function YfirlitCharts() {
  const [bil, setBil] = useState<Bil>("dagar");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    fetch(`/api/yfirlit?bil=${bil}`)
      .then((r) => r.json())
      .then((d) => { if (!stop) { setData(d); setLoading(false); } })
      .catch(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, [bil]);

  if (!data) return <Skeleton />;

  const { today, week, month, pace, margin, returns } = data;
  const weekdayName = VIKUDAGAR[(today.isodow - 1 + 7) % 7] ?? "";
  const dt = new Date(today.date + "T00:00:00");
  const dateLabel = `${weekdayName} ${dt.getDate()}. ${["janúar","febrúar","mars","apríl","maí","júní","júlí","ágúst","september","október","nóvember","desember"][dt.getMonth()]}`;
  const meðalkarfa = today.fjoldi > 0 ? today.sala / today.fjoldi : 0;
  const meðalkarfaPrev = today.sameWeekdayN > 0 ? today.sameWeekday / today.sameWeekdayN : 0;
  const vörurKarfa = today.fjoldi > 0 ? today.lines / today.fjoldi : 0;
  const basisWd = `vs sami vikudagur í síð. viku · á sama tíma dags`;

  return (
    <div className={`space-y-6 ${loading ? "opacity-60 transition-opacity" : "transition-opacity"}`}>
      {/* Context strip */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium capitalize" style={{ color: INK }}>{dateLabel}</span>
        <span className="text-xs text-gray-400">Vaktborð · uppfært núna</span>
      </div>

      {/* ── KPI row 1 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Sala í dag" value={krFull(today.sala)} basis={basisWd}>
          <Delta now={today.sala} prev={today.sameWeekday} absolute />
          <Sparkline values={data.sparkline} />
          <p className="text-[11px] text-gray-400 mt-1">sami vd. í síð. viku: {krFull(today.sameWeekday)} · í gær: {krFull(today.yesterday)}</p>
          {data.prevOwner && (
            <p className="text-[11px] text-gray-400 mt-0.5" title={`Meðaltal ${data.prevOwner.n} sömu vikudaga á sama árstíma hjá fyrri eiganda (úr Reglu)`}>
              fyrri eigandi, sami vd. í fyrra: <span className="font-medium text-gray-500">{krFull(data.prevOwner.sameWeekday)}</span>
              {data.prevOwner.sameDateLastYear > 0 && <> · þessi dags. í fyrra: {krFull(data.prevOwner.sameDateLastYear)}</>}
            </p>
          )}
        </Kpi>

        <Kpi title="Spáð dagslok" value={pace.hasHistory && pace.projected != null ? krFull(pace.projected) : krFull(pace.todaySoFar)}
          basis={pace.hasHistory ? `venjulega ${krStutt(pace.typicalFullDay)} á ${weekdayName === "" ? "þessum degi" : weekdayName.replace(/ur$/, "")}` : "raun hingað til"}>
          {pace.hasHistory && pace.projected != null ? (
            <>
              <PaceBar todaySoFar={pace.todaySoFar} typicalFullDay={pace.typicalFullDay} cumShareNow={pace.cumShareNow} />
              <p className="text-[11px] text-gray-400 mt-1">
                á þessum tíma venjulega búið að selja {pct1(pace.cumShareNow * 100)} — {paceVerdict(pace.projected, pace.typicalFullDay)}
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-400">ekki nægur ferill fyrir spá enn</p>
          )}
        </Kpi>

        <Kpi title="Vikan til dagsins" value={krFull(week.wtd)} basis={`vs sömu daga í fyrri viku · dagur ${week.daysElapsed}/7`}>
          <Delta now={week.wtd} prev={week.wtdPrev} absolute />
          <WeekStrip strip={week.strip} today={today.isodow} />
          {week.vikuspa != null && <p className="text-[11px] text-gray-400 mt-1">vikuspá: {krFull(week.vikuspa)}</p>}
        </Kpi>

        <MarginKpi margin={margin} />
      </div>

      {/* ── KPI row 2 (secondary) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Meðalkarfa í dag" value={today.fjoldi > 0 ? krFull(meðalkarfa) : "—"} basis={basisWd}>
          <Delta now={meðalkarfa} prev={meðalkarfaPrev} />
          <p className="text-[11px] text-gray-400 mt-1">{today.fjoldi} sölur í dag · {magn(vörurKarfa)} vörur/körfu</p>
        </Kpi>

        <Kpi title="Fjöldi sala í dag" value={String(today.fjoldi)} basis={basisWd}>
          <Delta now={today.fjoldi} prev={today.sameWeekdayN} />
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
            {today.sourceSplit.length === 0
              ? <span className="text-[11px] text-gray-400">engin sala enn í dag</span>
              : today.sourceSplit.map((s) => <span key={s.src} className="text-[11px] text-gray-400">{SOURCE_LABEL[s.src] ?? s.src} {s.n}</span>)}
          </div>
        </Kpi>

        <Kpi title="Skilhlutfall í dag" value={pct1(returns.rate * 100)} basis={basisWd}>
          <DeltaPP now={returns.rate * 100} prev={returns.ratePrev * 100} invertColor />
          <p className="text-[11px] text-gray-400 mt-1">{returns.reversedCount} bakfærð fylgiskjöl í dag</p>
        </Kpi>

        <Kpi title="Mánuðurinn til dagsins" value={krFull(month.mtd)} basis="vs sömu daga í fyrri mánuði">
          <Delta now={month.mtd} prev={month.mtdPrev} absolute />
        </Kpi>
      </div>

      {/* ── HERO: this week vs last week, day by day + pace lines ── */}
      <WeekVsWeek data={data} />

      {/* ── Intraday + heatmap ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Intraday data={data} weekdayName={weekdayName} />
        <Heatmap data={data} />
      </div>

      {/* ── Hero time-series with granularity tabs (prior-cycle overlay) ── */}
      <TimeSeries data={data} bil={bil} setBil={setBil} />

      {/* ── Category + payments ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Categories data={data} bil={bil} />
        <Payments data={data} bil={bil} />
      </div>

      {/* ── Top products + movers ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <TopProducts data={data} bil={bil} />
        <Movers data={data} bil={bil} />
      </div>

      {/* ── Channels + dead stock ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Channels data={data} bil={bil} />
        <DeadStock data={data} />
      </div>
    </div>
  );
}

// ── Pace bar (today so far vs typical, with a "venjulega núna" tick) ──
function PaceBar({ todaySoFar, typicalFullDay, cumShareNow }: { todaySoFar: number; typicalFullDay: number; cumShareNow: number }) {
  const max = Math.max(todaySoFar, typicalFullDay, 1);
  const fill = (todaySoFar / max) * 100;
  const tick = (Math.min(1, cumShareNow) * (typicalFullDay / max)) * 100;
  return (
    <div className="relative h-2 rounded-full bg-gray-100 mt-1.5 overflow-visible">
      <div className="h-full rounded-full" style={{ width: `${fill}%`, background: TEAL }} />
      <div className="absolute top-[-2px] h-[10px] w-[2px]" style={{ left: `${tick}%`, background: INK }} title="venjulega á þessum tíma" />
    </div>
  );
}
function paceVerdict(projected: number, typical: number): string {
  if (!typical) return "";
  const d = ((projected - typical) / typical) * 100;
  if (Math.abs(d) < 5) return "á áætlun";
  return d > 0 ? `${d.toFixed(0)}% á undan áætlun` : `${Math.abs(d).toFixed(0)}% á eftir áætlun`;
}

function MarginKpi({ margin }: { margin: Data["margin"] }) {
  const weak = margin.coverage < 0.4 || margin.pct == null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col">
      <p className="text-xs text-gray-500">Framlegð í dag</p>
      {weak ? (
        <>
          <p className="text-2xl font-bold mt-1 tabular-nums text-gray-300">—</p>
          <p className="text-[11px] text-gray-400 mt-0.5">ekki næg kostnaðarverð fyrir framlegð</p>
        </>
      ) : (
        <>
          <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: INK }}>{krFull(margin.kr!)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">álagning {pct1(margin.pct!)}</p>
          <div className="mt-1.5"><DeltaPP now={margin.pct} prev={margin.pctPrev} /></div>
        </>
      )}
      <p className="text-[11px] text-gray-400 mt-1">reiknuð á {pct1(margin.coverage * 100)} af sölu</p>
    </div>
  );
}

// ── 7-cell weekday strip for the VTD card ──
function WeekStrip({ strip, today }: { strip: Data["week"]["strip"]; today: number }) {
  const max = Math.max(1, ...strip.map((d) => Math.max(d.cur, d.prev)));
  return (
    <div className="flex gap-1 mt-1.5">
      {strip.map((d) => (
        <div key={d.dow} className="flex-1 flex flex-col items-center gap-0.5" title={`${VIKUDAGAR[d.dow - 1]}: ${krFull(d.cur)} (áður ${krFull(d.prev)})`}>
          <div className="relative w-full h-8 flex items-end">
            <div className="w-full rounded-sm" style={{ height: `${Math.max(3, (d.cur / max) * 100)}%`, background: d.future ? "#e5e7eb" : d.dow === today ? INK : TEAL }} />
            <div className="absolute left-0 right-0 border-t border-dashed" style={{ bottom: `${(d.prev / max) * 100}%`, borderColor: "#b8c6cc" }} />
          </div>
          <span className={`text-[9px] ${d.dow === today ? "font-bold" : ""}`} style={{ color: d.dow === today ? INK : AXIS }}>{VIKUDAGAR_STUTT[d.dow - 1]}</span>
        </div>
      ))}
    </div>
  );
}

// ── HERO: this week vs last week ──
function WeekVsWeek({ data }: { data: Data }) {
  const { weekProfile, today } = data;
  let ccur = 0, clast = 0;
  const rows = weekProfile.map((d) => {
    clast += d.prev;
    if (!d.future) ccur += d.cur;
    return {
      label: VIKUDAGAR_STUTT[d.dow - 1], dow: d.dow,
      cur: d.future ? 0 : d.cur, last: d.prev, expected: d.expected,
      cumCur: d.future ? null : ccur, cumLast: clast, isToday: d.dow === today.isodow,
    };
  });
  const wtd = rows.reduce((s, r) => s + r.cur, 0);
  const lastTotal = rows.reduce((s, r) => s + r.last, 0);
  const hasData = wtd > 0 || lastTotal > 0;

  return (
    <Panel title="Þessi vika vs. síðasta — dag fyrir dag"
      subtitle="Mán–Sun · full súla = þessi vika, ljós súla = síðasta · línur = uppsafnað (hlaupandi vikutala)"
      right={<div className="text-right text-xs"><div className="font-semibold tabular-nums" style={{ color: INK }}>{krFull(wtd)}</div><div className="text-gray-400">síðasta vika {krFull(lastTotal)}</div></div>}>
      {!hasData ? <Empty>Engin sala í þessari eða síðustu viku enn</Empty> : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: AXIS }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" tickFormatter={krStutt} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={52} />
              <YAxis yAxisId="r" orientation="right" tickFormatter={krStutt} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={<WeekTip />} />
              <Bar yAxisId="l" dataKey="last" name="Síðasta vika" fill={GHOST} radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Bar yAxisId="l" dataKey="cur" name="Þessi vika" radius={[4, 4, 0, 0]} maxBarSize={26}>
                {rows.map((r) => <Cell key={r.dow} fill={r.dow >= 6 ? TEAL_LIGHT : TEAL} stroke={r.isToday ? INK : undefined} strokeWidth={r.isToday ? 1.5 : 0} />)}
              </Bar>
              <Line yAxisId="r" dataKey="cumLast" name="Uppsafnað síðast" stroke="#9fb3ba" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
              <Line yAxisId="r" dataKey="cumCur" name="Uppsafnað núna" stroke={INK} strokeWidth={2} dot={{ r: 2, fill: INK }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
function WeekTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; dataKey: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  const cur = get("cur"), last = get("last");
  const d = last ? ((cur - last) / last) * 100 : null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg text-[13px] px-3 py-2 shadow-sm">
      <div className="font-semibold mb-1" style={{ color: INK }}>{label}</div>
      <div className="tabular-nums" style={{ color: TEAL }}>Þessi vika: {krFull(cur)}</div>
      <div className="tabular-nums text-gray-500">Síðasta vika: {krFull(last)}</div>
      {d != null && <div className={`tabular-nums font-medium ${d >= 0 ? "text-emerald-600" : "text-red-600"}`}>{d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1).replace(".", ",")}%</div>}
    </div>
  );
}

// ── Intraday cumulative today vs typical ──
function Intraday({ data, weekdayName }: { data: Data; weekdayName: string }) {
  const s = data.intraday;
  const hasData = s.some((r) => (r.today ?? 0) > 0) || s.some((r) => r.typical > 0);
  return (
    <Panel title="Söluferill dagsins" subtitle={`í dag vs. venjulegur ${weekdayName || "vikudagur"} (uppsafnað eftir klukkustund)`}>
      {!hasData ? <Empty>Ekki næg gögn fyrir söluferil enn</Empty> : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={s} margin={{ top: 8, right: 10, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
              <XAxis dataKey="hr" tickFormatter={(h) => `${h}`} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={krStutt} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={52} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }}
                labelFormatter={(h) => `kl. ${h}`} formatter={(v, n) => [v == null ? "—" : krFull(Number(v)), n === "today" ? "Í dag" : "Venjulega"]} />
              <ReferenceLine x={data.pace.hourNow} stroke={AMBER} strokeDasharray="3 3" label={{ value: "núna", fontSize: 10, fill: AMBER, position: "top" }} />
              <Line dataKey="typical" name="typical" stroke="#9fb3ba" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              <Line dataKey="today" name="today" stroke={TEAL} strokeWidth={2.5} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

// ── Weekday × hour heatmap ──
function Heatmap({ data }: { data: Data }) {
  const cells = data.heatmap;
  const hrs = cells.map((c) => c.hr);
  const loHr = hrs.length ? Math.min(8, ...hrs) : 8;
  const hiHr = hrs.length ? Math.max(20, ...hrs) : 20;
  const hours = Array.from({ length: hiHr - loHr + 1 }, (_, i) => loHr + i);
  const map = new Map(cells.map((c) => [`${c.dow}-${c.hr}`, c.avg_s]));
  const max = Math.max(1, ...cells.map((c) => c.avg_s));
  const hasData = cells.length > 0;
  const shade = (v: number) => {
    if (!v) return "#f6f8f9";
    const t = 0.15 + 0.85 * (v / max);
    return `rgba(44,104,123,${t.toFixed(2)})`;
  };
  return (
    <Panel title="Vikuhitakort" subtitle="meðalsala eftir vikudegi × klukkustund (síðustu 8 vikur)">
      {!hasData ? <Empty>Ekki næg saga fyrir hitakort enn</Empty> : (
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            <div className="flex gap-[3px] mb-1 pl-9">
              {hours.map((h) => <div key={h} className="flex-1 text-center text-[9px] text-gray-400 tabular-nums">{h}</div>)}
            </div>
            {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
              <div key={dow} className={`flex items-center gap-[3px] mb-[3px] ${dow === data.today.isodow ? "font-bold" : ""}`}>
                <div className="w-8 text-[10px] shrink-0" style={{ color: dow === data.today.isodow ? INK : AXIS }}>{VIKUDAGAR_STUTT[dow - 1]}</div>
                {hours.map((h) => {
                  const v = map.get(`${dow}-${h}`) ?? 0;
                  return <div key={h} className="flex-1 aspect-square rounded-[3px]" style={{ background: shade(v), outline: dow === data.today.isodow ? `1px solid ${TEAL_LIGHT}` : "none" }} title={`${VIKUDAGAR[dow - 1]} kl. ${h}: ${krFull(v)}`} />;
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── Time-series with tabs ──
function TimeSeries({ data, bil, setBil }: { data: Data; bil: Bil; setBil: (b: Bil) => void }) {
  const chart = data.series.map((r) => ({ ...r, label: seriesLabel(r.d, bil) }));
  const total = chart.reduce((s, r) => s + r.sala, 0);
  const hasData = chart.some((r) => r.sala > 0 || r.salaPrev > 0);
  return (
    <Panel title="Sala" subtitle={`Samtals ${krFull(total)} ${WINDOW_LABEL[bil]} · brotalína = ${bil === "dagar" ? "sami dagur viku áður" : bil === "vikur" ? "vika áður" : "mánuður áður"}`}
      right={
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(Object.keys(BIL_LABEL) as Bil[]).map((b) => (
            <button key={b} onClick={() => setBil(b)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${bil === b ? "text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              style={bil === b ? { background: TEAL } : undefined}>{BIL_LABEL[b]}</button>
          ))}
        </div>}>
      {!hasData ? <Empty>Engin sala á tímabilinu</Empty> : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} interval={bil === "dagar" ? 2 : 0} />
              <YAxis tickFormatter={krStutt} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={<SeriesTip bil={bil} />} />
              <Bar dataKey="sala" name="Sala" radius={[6, 6, 0, 0]} maxBarSize={38}>
                {chart.map((r, i) => <Cell key={i} fill={bil === "dagar" && r.weekday >= 6 ? TEAL_LIGHT : TEAL} />)}
              </Bar>
              <Line dataKey="salaPrev" name="prev" stroke="#9fb3ba" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
function SeriesTip({ active, payload, label, bil }: { active?: boolean; payload?: { dataKey: string; value: number; payload: { fjoldi: number } }[]; label?: string; bil: Bil }) {
  if (!active || !payload?.length) return null;
  const sala = payload.find((p) => p.dataKey === "sala")?.value ?? 0;
  const prev = payload.find((p) => p.dataKey === "salaPrev")?.value ?? 0;
  const fjoldi = payload[0]?.payload?.fjoldi ?? 0;
  const d = prev ? ((sala - prev) / prev) * 100 : null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg text-[13px] px-3 py-2 shadow-sm">
      <div className="font-semibold mb-1" style={{ color: INK }}>{label}</div>
      <div className="tabular-nums" style={{ color: TEAL }}>Sala: {krFull(sala)}</div>
      <div className="tabular-nums text-gray-500">{bil === "dagar" ? "Viku áður" : bil === "vikur" ? "Vika áður" : "Mánuður áður"}: {krFull(prev)}</div>
      <div className="tabular-nums text-gray-400">{fjoldi} sölur</div>
      {d != null && <div className={`tabular-nums font-medium ${d >= 0 ? "text-emerald-600" : "text-red-600"}`}>{d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1).replace(".", ",")}%</div>}
    </div>
  );
}

// ── Margin chip ──
function MarginChip({ pct, coverage }: { pct: number | null; coverage: number }) {
  if (pct == null || coverage < 0.4) return <span className="text-[10px] text-gray-300">álagn. ?</span>;
  const color = pct < 0 ? RED : pct < 15 ? AMBER : TEAL;
  return <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded" style={{ color, background: `${color}14` }}>{pct1(pct)}</span>;
}

// ── Categories ──
function Categories({ data, bil }: { data: Data; bil: Bil }) {
  const cats = data.categories;
  const max = Math.max(1, ...cats.map((c) => c.sala));
  return (
    <Panel title="Sala eftir vöruflokki" subtitle={`${WINDOW_LABEL[bil]} · ljós súla = ${PREV_WINDOW_LABEL[bil]} · álagningarmerki`}>
      {cats.length === 0 ? <Empty>Engin flokkuð sala á tímabilinu</Empty> : (
        <div className="space-y-3">
          {cats.map((c) => {
            const d = c.salaPrev ? ((c.sala - c.salaPrev) / c.salaPrev) * 100 : null;
            return (
              <div key={c.grp}>
                <div className="flex justify-between items-center text-sm mb-1">
                  <span className="truncate pr-3 flex items-center gap-1.5" style={{ color: INK }}>{c.grp}<MarginChip pct={c.framlegdPct} coverage={c.coverage} /></span>
                  <span className="tabular-nums shrink-0 flex items-center gap-2">
                    <span className="font-semibold">{krFull(c.sala)}</span>
                    {d != null && <span className={`text-[10px] font-medium ${Math.abs(d) < 2 ? "text-gray-400" : d >= 0 ? "text-emerald-600" : "text-red-600"}`}>{d >= 0 ? "▲" : "▼"}{Math.abs(d).toFixed(0)}%</span>}
                  </span>
                </div>
                <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="absolute inset-y-0 left-0 rounded-full opacity-40" style={{ width: `${(c.salaPrev / max) * 100}%`, background: GHOST }} />
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(c.sala / max) * 100}%`, background: TEAL }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Payments donut + delta table ──
function Payments({ data, bil }: { data: Data; bil: Bil }) {
  const pays = data.payments;
  const total = pays.reduce((s, p) => s + p.value, 0);
  return (
    <Panel title="Greiðslumátar" subtitle={`${WINDOW_LABEL[bil]} · Δ vs ${PREV_WINDOW_LABEL[bil]}`}>
      {pays.length === 0 ? <Empty>Engar greiðslur á tímabilinu</Empty> : (
        <div className="grid grid-cols-[1fr_1.1fr] gap-3 items-center">
          <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pays} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="88%" paddingAngle={2}>
                  {pays.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => krFull(Number(v))} contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-gray-400">samtals</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: INK }}>{krStutt(total)}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            {pays.map((p, i) => {
              const pp = (p.share - p.sharePrev) * 100;
              return (
                <div key={p.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5" style={{ color: INK }}>
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{p.name}
                  </span>
                  <span className="tabular-nums flex items-center gap-2">
                    <span className="text-gray-500">{pct1(p.share * 100)}</span>
                    <span className={`text-[10px] w-14 text-right ${Math.abs(pp) < 0.5 ? "text-gray-400" : pp >= 0 ? "text-emerald-600" : "text-red-600"}`}>{pp >= 0 ? "▲" : "▼"}{Math.abs(pp).toFixed(1).replace(".", ",")}pp</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── Top products enriched ──
function RankArrow({ now, prev }: { now: number; prev: number | null }) {
  if (prev == null) return <span className="text-[10px] text-emerald-600 font-medium">nýtt</span>;
  const d = prev - now; // positive = climbed
  if (d === 0) return <span className="text-[10px] text-gray-300">▬</span>;
  return <span className={`text-[10px] font-medium ${d > 0 ? "text-emerald-600" : "text-red-600"}`}>{d > 0 ? `↑${d}` : `↓${-d}`}</span>;
}
function TopProducts({ data, bil }: { data: Data; bil: Bil }) {
  const top = data.topProducts;
  const max = Math.max(1, ...top.map((p) => p.sala));
  return (
    <Panel title="Söluhæstu vörur" subtitle={`${WINDOW_LABEL[bil]} · álagning + hreyfing frá fyrra tímabili`}>
      {top.length === 0 ? <Empty>Engin sala á tímabilinu</Empty> : (
        <div className="space-y-2.5">
          {top.slice(0, 10).map((p) => (
            <div key={p.nr}>
              <div className="flex justify-between text-sm mb-0.5 gap-2">
                <span className="truncate flex items-center gap-1.5" style={{ color: INK }}>
                  <RankArrow now={p.rankNow} prev={p.rankPrev} />{p.name}
                </span>
                <span className="tabular-nums shrink-0 flex items-center gap-2">
                  <MarginChip pct={p.marginPct} coverage={p.coverage} />
                  <span className="text-gray-400 text-xs">{magn(p.magn)} stk</span>
                  <span className="font-semibold">{krFull(p.sala)}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(p.sala / max) * 100}%`, background: TEAL_LIGHT }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Movers ──
function Movers({ data, bil }: { data: Data; bil: Bil }) {
  const movers = data.movers.filter((m) => m.diff !== 0);
  const max = Math.max(1, ...movers.map((m) => Math.abs(m.diff)));
  return (
    <Panel title="Mest að aukast / minnka" subtitle={`kr breyting vs ${PREV_WINDOW_LABEL[bil]}`}>
      {movers.length === 0 ? <Empty>Engin marktæk breyting á tímabilinu</Empty> : (
        <div className="space-y-2">
          {movers.map((m) => {
            const up = m.diff >= 0;
            return (
              <div key={m.nr} className="flex items-center gap-2 text-sm">
                <span className="truncate flex-1" style={{ color: INK }}>{m.name}</span>
                <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden flex" style={{ justifyContent: up ? "flex-start" : "flex-end" }}>
                  <div className="h-full rounded-full" style={{ width: `${(Math.abs(m.diff) / max) * 100}%`, background: up ? TEAL : RED }} />
                </div>
                <span className={`tabular-nums text-xs font-semibold w-20 text-right ${up ? "text-emerald-600" : "text-red-600"}`}>{up ? "+" : "−"}{krStutt(Math.abs(m.diff))}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Channels stacked bar over time ──
const CH = [
  { key: "till", label: "Kassi", color: TEAL },
  { key: "kiosk", label: "Sjálfsafgr.", color: TEAL_LIGHT },
  { key: "web", label: "Vefverslun", color: AMBER },
  { key: "eldhus", label: "Eldhús", color: INK },
] as const;
function Channels({ data, bil }: { data: Data; bil: Bil }) {
  const rows = data.channels.map((c) => ({ ...c, label: seriesLabel(c.bucket, bil) }));
  const hasData = rows.some((r) => r.till + r.kiosk + r.web + r.eldhus + r.other > 0);
  return (
    <Panel title="Rásir & kassar" subtitle={`velta eftir sölurás · ${WINDOW_LABEL[bil]}`}>
      {!hasData ? <Empty>Engin sala eftir rásum á tímabilinu</Empty> : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} interval={bil === "dagar" ? 2 : 0} />
              <YAxis tickFormatter={krStutt} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={52} />
              <Tooltip formatter={(v, n) => [krFull(Number(v)), CH.find((c) => c.key === n)?.label ?? n]} contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }} />
              <Legend formatter={(v) => <span style={{ color: INK, fontSize: 12 }}>{CH.find((c) => c.key === v)?.label ?? v}</span>} />
              {CH.map((c, i) => <Bar key={c.key} dataKey={c.key} stackId="s" fill={c.color} radius={i === CH.length - 1 ? [4, 4, 0, 0] : undefined} maxBarSize={38} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

// ── Dead stock ──
function DeadStock({ data }: { data: Data }) {
  const rows = data.deadStock;
  const daysSince = (d: string) => Math.round((Date.now() - new Date(d + "T00:00:00").getTime()) / 86400000);
  return (
    <Panel title="Hægsölu / dauðar vörur" subtitle="seldust síðustu 30 daga en 0 stk síðustu 7 daga">
      {rows.length === 0 ? <Empty>Engar dauðar vörur — eða ekki næg saga enn</Empty> : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[380px]">
            <thead className="text-gray-400 text-left text-xs">
              <tr><th className="px-2 py-1 font-medium">Vara</th><th className="px-2 py-1 font-medium">Flokkur</th><th className="px-2 py-1 font-medium text-right">Síðast selt</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.nr} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 truncate max-w-[160px]" style={{ color: INK }}>{r.name}</td>
                  <td className="px-2 py-1.5 text-gray-500 truncate">{r.grp || "—"}</td>
                  <td className="px-2 py-1.5 text-right text-gray-500 tabular-nums whitespace-nowrap">{daysSince(r.lastSold)} d. síðan</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
