import Link from "next/link";
import { getDayOverview, getTopByRevenue, getTopByQty, getBasketHits, getTopPairs, getFastLowStock, getDayReturns, getDeadStock, getSalesByHour, getMarginHeroes, getGroupSplit, getWeekdayCompare } from "@/lib/sales-stats";
import { kr, dags, groupLabel } from "@/lib/format";
import DagsVal from "./DagsVal";

export const dynamic = "force-dynamic";

// Sölutölfræði dagsins: söluhæstu vörurnar, heitasta varan (flestar körfur), vörupör,
// klukkutímadreifing, hraðsala vs birgðir, skil og hreyfingarlausar birgðir.
// Aðgangur: stjórnandi + bókari (sér-regla í middleware — velta er ekki lagerstjóramál).
export default async function SalutolfraediPage({ searchParams }: { searchParams: Promise<{ dags?: string }> }) {
  const sp = await searchParams;
  const d = sp.dags && /^\d{4}-\d{2}-\d{2}$/.test(sp.dags) ? sp.dags : new Date().toISOString().slice(0, 10);
  const [o, topRev, topQty, hits, pairs, fastLow, returns, dead, byHour, heroes, groups, wk] = await Promise.all([
    getDayOverview(d), getTopByRevenue(d, 10), getTopByQty(d, 10), getBasketHits(d, 10),
    getTopPairs(d, 10), getFastLowStock(10), getDayReturns(d, 10), getDeadStock(14, 10), getSalesByHour(d),
    getMarginHeroes(d, 10), getGroupSplit(d), getWeekdayCompare(d),
  ]);
  const n = (x: string | number | null | undefined) => Math.round(Number(x) || 0);
  const n1 = (x: string | number | null | undefined) => (Math.round((Number(x) || 0) * 10) / 10).toLocaleString("is-IS");
  const maxHourGross = Math.max(1, ...byHour.map((h) => Number(h.gross)));
  // Vikusamanburður: dagurinn vs meðaltal sama vikudags síðustu 4 vikur.
  const wkAvg = Number(wk?.avg_gross) || 0;
  const wkDiff = wkAvg > 0 ? Math.round(((Number(o.gross) - wkAvg) / wkAvg) * 100) : null;
  const maxGroup = Math.max(1, ...groups.map((g) => Number(g.revenue)));
  const vara = (pn: string, name: string) => (
    <Link href={`/bokhald/solukerfi/salutolfraedi/vara/${pn}`} className="hover:text-red-700 hover:underline">{name}</Link>
  );

  const Metric = ({ label, value }: { label: string; value: string }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
  const Box = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <p className="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-600">{title}{hint && <span className="ml-2 font-normal text-xs text-gray-400">{hint}</span>}</p>
      {children}
    </div>
  );
  const Empty = () => <p className="px-4 py-5 text-center text-sm text-gray-400">Ekkert í dag</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">📈 Sölutölfræði</h1>
        <div className="flex items-center gap-3">
          <Link href="/bokhald/solukerfi/salutolfraedi/samanburdur" className="px-4 py-2 rounded-lg border-2 border-[#2C687B] text-[#2C687B] text-sm font-semibold hover:bg-[#E4F1F0]">⚖️ Bera saman vörur</Link>
          <DagsVal value={d} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label="Körfur" value={String(o.baskets)} />
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Velta (m/VSK)</p>
          <p className="text-2xl font-bold tabular-nums">{kr(n(o.gross))}</p>
          {wkDiff != null && wk.days > 0 && (
            <p className={`text-xs font-semibold ${wkDiff >= 0 ? "text-green-700" : "text-rose-600"}`} title={`Meðaltal sama vikudags síðustu ${wk.days} vikur: ${kr(n(wkAvg))}`}>
              {wkDiff >= 0 ? "▲" : "▼"} {Math.abs(wkDiff)}% vs sami vikudagur
            </p>
          )}
        </div>
        <Metric label="Meðalkarfa" value={kr(n(o.avg_basket))} />
        <Metric label="Vörur í körfu (meðaltal)" value={n1(o.avg_items)} />
        <Metric label="Ólíkar vörur seldar" value={String(o.products)} />
      </div>

      {byHour.length > 0 && (
        <Box title="Sala eftir klukkustund" hint="hvenær er örtröðin">
          <div className="flex items-end gap-1 px-4 py-3 h-28">
            {byHour.map((h) => (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1" title={`${h.hour}:00 — ${h.baskets} körfur · ${kr(n(h.gross))}`}>
                <div className="w-full rounded-t bg-[#2C687B]" style={{ height: `${Math.max(4, (Number(h.gross) / maxHourGross) * 80)}px` }} />
                <span className="text-[10px] text-gray-400">{h.hour}</span>
              </div>
            ))}
          </div>
        </Box>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <Box title="Söluhæsta varan" hint="eftir veltu">
          {topRev.length === 0 ? <Empty /> : <table className="w-full text-sm"><tbody>
            {topRev.map((p, i) => (
              <tr key={p.product_number} className="border-t border-gray-100 first:border-t-0">
                <td className="px-3 py-1.5 text-gray-400 w-6">{i + 1}</td>
                <td className="px-2 py-1.5 max-w-[13rem] truncate">{vara(p.product_number, p.name)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium whitespace-nowrap">{kr(n(p.revenue))}</td>
              </tr>))}
          </tbody></table>}
        </Box>
        <Box title="Mest selda varan" hint="eftir stykkjum">
          {topQty.length === 0 ? <Empty /> : <table className="w-full text-sm"><tbody>
            {topQty.map((p, i) => (
              <tr key={p.product_number} className="border-t border-gray-100 first:border-t-0">
                <td className="px-3 py-1.5 text-gray-400 w-6">{i + 1}</td>
                <td className="px-2 py-1.5 max-w-[13rem] truncate">{vara(p.product_number, p.name)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{n1(p.qty)} stk</td>
              </tr>))}
          </tbody></table>}
        </Box>
        <Box title="Heitasta varan" hint="í flestum körfum">
          {hits.length === 0 ? <Empty /> : <table className="w-full text-sm"><tbody>
            {hits.map((p, i) => (
              <tr key={p.product_number} className="border-t border-gray-100 first:border-t-0">
                <td className="px-3 py-1.5 text-gray-400 w-6">{i + 1}</td>
                <td className="px-2 py-1.5 max-w-[11rem] truncate">{vara(p.product_number, p.name)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium whitespace-nowrap">{p.baskets} körfur <span className="text-gray-400">({p.basket_pct}%)</span></td>
              </tr>))}
          </tbody></table>}
        </Box>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Box title="Framlegðarhetjur" hint="hvað GRÆÐIR mest (velta − kostnaður)">
          {heroes.length === 0 ? <p className="px-4 py-5 text-center text-sm text-gray-400">Vantar kostnaðarverð eða engin sala</p> : <table className="w-full text-sm"><tbody>
            {heroes.map((p, i) => (
              <tr key={p.product_number} className="border-t border-gray-100 first:border-t-0">
                <td className="px-3 py-1.5 text-gray-400 w-6">{i + 1}</td>
                <td className="px-2 py-1.5 max-w-[14rem] truncate">{vara(p.product_number, p.name)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium whitespace-nowrap">{kr(n(p.margin))} <span className="text-gray-400">({p.margin_pct}%)</span></td>
              </tr>))}
          </tbody></table>}
        </Box>
        <Box title="Flokkaskipting veltunnar" hint="hlutur hvers vöruflokks">
          {groups.length === 0 ? <Empty /> : <div className="px-4 py-3 space-y-1.5">
            {groups.map((g) => (
              <div key={g.product_group ?? "óflokkað"} className="flex items-center gap-2 text-sm">
                <span className="w-32 truncate text-gray-600">{groupLabel(g.product_group) ?? "Óflokkað"}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-[#8CC7C4]" style={{ width: `${Math.max(2, (Number(g.revenue) / maxGroup) * 100)}%` }} />
                </div>
                <span className="w-28 text-right tabular-nums whitespace-nowrap">{kr(n(g.revenue))} <span className="text-gray-400 text-xs">{g.share_pct}%</span></span>
              </div>))}
          </div>}
        </Box>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Box title="Saman í körfu" hint="algengustu vörupör dagsins">
          {pairs.length === 0 ? <Empty /> : <table className="w-full text-sm"><tbody>
            {pairs.map((p, i) => (
              <tr key={i} className="border-t border-gray-100 first:border-t-0">
                <td className="px-3 py-1.5 max-w-[20rem] truncate">{p.name_a} <span className="text-gray-400">+</span> {p.name_b}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium w-24">{p.baskets}× saman</td>
              </tr>))}
          </tbody></table>}
        </Box>
        <Box title="Selst hratt — birgðir að klárast" hint="sala 7 daga umfram birgðastöðu">
          {fastLow.length === 0 ? <p className="px-4 py-5 text-center text-sm text-gray-400">Ekkert að klárast 🎉</p> : <table className="w-full text-sm"><tbody>
            {fastLow.map((p) => (
              <tr key={p.product_number} className="border-t border-gray-100 first:border-t-0">
                <td className="px-3 py-1.5 max-w-[16rem] truncate">{vara(p.product_number, p.name)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap"><span className="text-gray-500">{n1(p.sold7)} seldar/7d ·</span> <b className={n(p.stock_quantity) <= 0 ? "text-rose-600" : "text-amber-700"}>{n(p.stock_quantity)} á lager</b></td>
              </tr>))}
          </tbody></table>}
        </Box>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Box title="Skil dagsins">
          {returns.length === 0 ? <p className="px-4 py-5 text-center text-sm text-gray-400">Engin skil 🎉</p> : <table className="w-full text-sm"><tbody>
            {returns.map((p, i) => (
              <tr key={i} className="border-t border-gray-100 first:border-t-0">
                <td className="px-3 py-1.5 max-w-[16rem] truncate">{p.product_number ? vara(p.product_number, p.name) : p.name}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{n1(p.qty)} stk · {kr(n(p.amount))}</td>
              </tr>))}
          </tbody></table>}
        </Box>
        <Box title="Hreyfingarlausar birgðir" hint="ekkert selst í 14+ daga — bundið fé">
          {dead.length === 0 ? <p className="px-4 py-5 text-center text-sm text-gray-400">Allt hreyfist 🎉</p> : <table className="w-full text-sm"><tbody>
            {dead.map((p) => (
              <tr key={p.product_number} className="border-t border-gray-100 first:border-t-0">
                <td className="px-3 py-1.5 max-w-[15rem] truncate">{vara(p.product_number, p.name)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-gray-500">{n(p.stock_quantity)} stk · <b className="text-gray-700">{kr(n(p.value))}</b>{p.last_sold ? ` · síðast ${dags(p.last_sold)}` : " · aldrei selst"}</td>
              </tr>))}
          </tbody></table>}
        </Box>
      </div>
    </div>
  );
}
