import Link from "next/link";
import { getProductInfo, getProductDaily, getProductTotals, getCompanions, getProductWeekdayAvg } from "@/lib/sales-stats";
import { kr, dags, groupLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

// Stök vara í smáatriðum: sala síðustu daga, framlegð, körfuhlutfall, vikudagamynstur
// og fylgivörurnar ("kaupa oftast með"). ?dagar=30|90 velur tímabilið.
const VIKUDAGAR = ["sun", "mán", "þri", "mið", "fim", "fös", "lau"];

export default async function VaraTolfraediPage({ params, searchParams }: { params: Promise<{ nr: string }>; searchParams: Promise<{ dagar?: string }> }) {
  const { nr } = await params;
  const sp = await searchParams;
  const days = sp.dagar === "90" ? 90 : sp.dagar === "7" ? 7 : 30;
  const p = await getProductInfo(nr);
  if (!p) {
    return <div><p className="text-gray-500 mb-2">Vara fannst ekki.</p><Link href="/bokhald/solukerfi/salutolfraedi" className="text-red-600 hover:underline text-sm">← Sölutölfræði</Link></div>;
  }
  const [daily, totals, companions, weekday] = await Promise.all([
    getProductDaily([nr], days), getProductTotals([nr], days), getCompanions(nr, days, 10), getProductWeekdayAvg(nr, Math.max(days, 56)),
  ]);
  const t = totals[0];
  const n = (x: string | number | null | undefined) => Math.round(Number(x) || 0);
  const n1 = (x: string | number | null | undefined) => (Math.round((Number(x) || 0) * 10) / 10).toLocaleString("is-IS");

  // Daga-röð tímabilsins (líka núll-dagar) fyrir súlurnar.
  const byDay = new Map(daily.map((r) => [r.day, r]));
  const series: { day: string; qty: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({ day: key, qty: Number(byDay.get(key)?.qty) || 0 });
  }
  const maxQty = Math.max(1, ...series.map((s) => s.qty));
  const maxW = Math.max(1, ...weekday.map((w) => Number(w.avg_qty)));

  const Metric = ({ label, value }: { label: string; value: string }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <p className="text-sm text-gray-500">
            <span className="font-mono">{p.product_number}</span>
            {groupLabel(p.product_group) && <> · {groupLabel(p.product_group)}</>}
            {" "}· verð {kr(p.price_gross)}{Number(p.cost_price) > 0 && <> · kostnaður {kr(n(p.cost_price))}</>}
            {p.is_stock_controlled && <> · <b>{n(p.stock_quantity)} á lager</b></>}
            {" "}· <Link href={`/bokhald/solukerfi/vorur/${p.product_number}`} className="text-red-600 hover:underline">vöruspjald →</Link>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {[7, 30, 90].map((dg) => (
            <Link key={dg} href={`/bokhald/solukerfi/salutolfraedi/vara/${nr}?dagar=${dg}`}
              className={`px-3 py-1.5 rounded-lg border ${days === dg ? "bg-[#21323A] text-white border-[#21323A]" : "border-gray-300 hover:bg-gray-50"}`}>{dg} dagar</Link>
          ))}
          <Link href="/bokhald/solukerfi/salutolfraedi" className="ml-2 text-red-600 hover:underline">← Sölutölfræði</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label={`Selt stk (${days}d)`} value={t ? n1(t.qty) : "0"} />
        <Metric label="Velta" value={kr(n(t?.revenue))} />
        <Metric label="Framlegð" value={t?.margin != null ? kr(n(t.margin)) : "— (vantar kostnverð)"} />
        <Metric label="Körfur" value={String(t?.baskets ?? 0)} />
        <Metric label="Hlutfall af körfum" value={`${t?.basket_pct ?? 0}%`} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <p className="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-600">Seld stykki per dag — síðustu {days} dagar</p>
        <div className="flex items-end gap-px px-4 py-3 h-32 overflow-x-auto">
          {series.map((s) => (
            <div key={s.day} className="flex-1 min-w-[6px]" title={`${dags(s.day)}: ${n1(s.qty)} stk`}>
              <div className={`w-full rounded-t ${s.qty > 0 ? "bg-[#2C687B]" : "bg-gray-100"}`} style={{ height: `${Math.max(3, (s.qty / maxQty) * 100)}px` }} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-600">Vikudagamynstur <span className="font-normal text-xs text-gray-400">meðalsala per vikudag (8 vikur)</span></p>
          <div className="flex items-end gap-3 px-6 py-4 h-32">
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const w = weekday.find((x) => x.dow === dow);
              const v = Number(w?.avg_qty) || 0;
              return (
                <div key={dow} className="flex-1 flex flex-col items-center gap-1" title={`${VIKUDAGAR[dow]}: ${n1(v)} stk að meðaltali`}>
                  <div className={`w-full rounded-t ${v > 0 ? "bg-[#8CC7C4]" : "bg-gray-100"}`} style={{ height: `${Math.max(3, (v / maxW) * 80)}px` }} />
                  <span className="text-[11px] text-gray-500">{VIKUDAGAR[dow]}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-600">Kaupa oftast með <span className="font-normal text-xs text-gray-400">sömu körfur, {days} dagar</span></p>
          {companions.length === 0 ? <p className="px-4 py-5 text-center text-sm text-gray-400">Engar fylgivörur enn</p> : (
            <table className="w-full text-sm"><tbody>
              {companions.map((c, i) => (
                <tr key={c.product_number} className="border-t border-gray-100 first:border-t-0">
                  <td className="px-3 py-1.5 text-gray-400 w-6">{i + 1}</td>
                  <td className="px-2 py-1.5"><Link href={`/bokhald/solukerfi/salutolfraedi/vara/${c.product_number}?dagar=${days}`} className="hover:text-red-700 hover:underline">{c.name}</Link></td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium w-28">{c.together}× saman</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
