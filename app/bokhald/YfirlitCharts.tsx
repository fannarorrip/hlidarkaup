"use client";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { kr } from "@/lib/format";

// Brand palette (same family as the till)
const RED = "#DB1A1A";
const INK = "#21323A";
const TEAL = "#2C687B";
const TEAL_LIGHT = "#8CC7C4";
const PIE_COLORS = [TEAL, RED, TEAL_LIGHT, "#E5A33D"];

const MAN = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];

// Icelandic number rendering via lib/format (dot thousands, comma decimals) — explicit,
// because toLocaleString("is-IS") renders comma thousands on some ICU builds.
const krFull = (n: number) => kr(n);
const krStutt = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} m.` :
  Math.abs(n) >= 1_000 ? `${Math.round(n / 1_000)} þ.` : String(Math.round(n));

type Bil = "dagar" | "vikur" | "manudir";

interface Data {
  kpi: { today: number; todayN: number; yesterday: number; wtd: number; wtdPrev: number; mtd: number; mtdPrev: number };
  series: { d: string; sala: number; fjoldi: number }[];
  payments: { name: string; value: number }[];
  topProducts: { nr: string; name: string; sala: number; magn: number }[];
}

// ISO week number for the "Vikur" axis labels
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function label(d: string, bil: Bil): string {
  const dt = new Date(d + "T00:00:00");
  if (bil === "dagar") return `${dt.getDate()}.${dt.getMonth() + 1}.`;
  if (bil === "vikur") return `V${isoWeek(dt)}`;
  return `${MAN[dt.getMonth()]} ´${String(dt.getFullYear()).slice(2)}`;
}

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return <span className="text-xs text-gray-400">— enginn samanburður</span>;
  const pct = ((now - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1).replace(".", ",")}%
      <span className="text-gray-400 font-normal"> ({krStutt(prev)})</span>
    </span>
  );
}

function Kpi({ title, value, children }: { title: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const BIL_LABEL: Record<Bil, string> = { dagar: "Dagar", vikur: "Vikur", manudir: "Mánuðir" };
const WINDOW_LABEL: Record<Bil, string> = {
  dagar: "síðustu 30 daga", vikur: "síðustu 12 vikur", manudir: "frá janúar 2025",
};

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

  if (!data) {
    return <div className="h-96 flex items-center justify-center text-gray-400 text-sm">Sæki sölutölur…</div>;
  }

  const { kpi } = data;
  const chart = data.series.map((r) => ({ ...r, label: label(r.d, bil) }));
  const paymentsTotal = data.payments.reduce((s, p) => s + p.value, 0);
  const maxTop = Math.max(1, ...data.topProducts.map((p) => p.sala));

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Sala í dag" value={krFull(kpi.today)}>
          <Delta now={kpi.today} prev={kpi.yesterday} />
        </Kpi>
        <Kpi title="Vikan (til dagsins í dag)" value={krFull(kpi.wtd)}>
          <Delta now={kpi.wtd} prev={kpi.wtdPrev} />
        </Kpi>
        <Kpi title="Mánuðurinn (til dagsins í dag)" value={krFull(kpi.mtd)}>
          <Delta now={kpi.mtd} prev={kpi.mtdPrev} />
        </Kpi>
        <Kpi title="Sölur í dag" value={String(kpi.todayN)}>
          <span className="text-xs text-gray-400">
            {kpi.todayN > 0 ? `Meðalkarfa ${krFull(kpi.today / kpi.todayN)}` : "Engin sala enn í dag"}
          </span>
        </Kpi>
      </div>

      {/* Main chart with granularity tabs */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-lg" style={{ color: INK }}>Sala</h2>
            <p className="text-xs text-gray-400">Samtals {krFull(chart.reduce((s, r) => s + r.sala, 0))} {WINDOW_LABEL[bil]}</p>
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(Object.keys(BIL_LABEL) as Bil[]).map((b) => (
              <button
                key={b}
                onClick={() => setBil(b)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${bil === b ? "bg-[#2C687B] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {BIL_LABEL[b]}
              </button>
            ))}
          </div>
        </div>
        <div className={`h-72 ${loading ? "opacity-50" : ""}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f4" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8a9aa4" }} tickLine={false} axisLine={false}
                     interval={bil === "dagar" ? 2 : 0} />
              <YAxis tickFormatter={krStutt} tick={{ fontSize: 11, fill: "#8a9aa4" }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                formatter={(v, name) => [name === "sala" ? krFull(Number(v)) : v, name === "sala" ? "Sala" : "Fjöldi sala"]}
                labelFormatter={(l) => l}
                contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }}
              />
              <Bar dataKey="sala" fill={TEAL} radius={[6, 6, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Payments + top products */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-lg mb-1" style={{ color: INK }}>Greiðslumátar</h2>
          <p className="text-xs text-gray-400 mb-3">{WINDOW_LABEL[bil]} · samtals {krFull(paymentsTotal)}</p>
          {data.payments.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">Engar greiðslur á tímabilinu</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.payments} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                    {data.payments.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => krFull(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }} />
                  <Legend formatter={(v) => <span style={{ color: INK, fontSize: 13 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-lg mb-1" style={{ color: INK }}>Söluhæstu vörur</h2>
          <p className="text-xs text-gray-400 mb-3">{WINDOW_LABEL[bil]}</p>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">Engin sala á tímabilinu</p>
          ) : (
            <div className="space-y-2.5">
              {data.topProducts.map((p) => (
                <div key={p.nr}>
                  <div className="flex justify-between text-sm mb-0.5">
                    <span className="truncate pr-3" style={{ color: INK }}>{p.name}</span>
                    <span className="font-semibold tabular-nums shrink-0">{krFull(p.sala)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(p.sala / maxTop) * 100}%`, background: TEAL_LIGHT }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
