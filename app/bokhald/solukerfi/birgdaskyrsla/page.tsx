import { getStockSummary, getStockAttention, getRecentStockMovements } from "@/lib/stock-report";
import { dags, kr } from "@/lib/format";

export const dynamic = "force-dynamic";

const MOVE: Record<string, string> = { sale: "Sala", receipt: "Móttaka", adjust: "Leiðrétting", count: "Talning", waste: "Rýrnun" };

export default async function BirgdaskyrslaPage() {
  const [s, attention, moves] = await Promise.all([getStockSummary(), getStockAttention(300), getRecentStockMovements(60)]);
  const n = (x: string | number | null) => Math.round(Number(x) || 0);

  const Metric = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">📦 Birgðaskýrsla</h1>
        <a href="/api/birgdaskyrsla/xlsx" className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800">📊 Sækja Excel</a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Birgðavirði (kostnaður)" value={kr(n(s.stock_value))} />
        <Metric label="Birgðastýrðar vörur" value={String(s.controlled_count)} />
        <Metric label="Undir öryggisbirgðum" value={String(s.low_count)} accent={s.low_count > 0 ? "text-amber-700" : ""} />
        <Metric label="Búnar vörur" value={String(s.out_count)} accent={s.out_count > 0 ? "text-rose-600" : ""} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Vörur sem þarfnast athygli ({attention.length})</h2>
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr><th className="px-4 py-2 font-medium">Vara</th><th className="px-4 py-2 font-medium">Flokkur</th><th className="px-4 py-2 font-medium text-right">Birgðir</th><th className="px-4 py-2 font-medium text-right">Öryggisb.</th><th className="px-4 py-2 font-medium text-right">Birgðavirði</th><th className="px-4 py-2 font-medium">Staða</th></tr>
            </thead>
            <tbody>
              {attention.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Allar birgðir í lagi 🎉</td></tr> : attention.map((p) => {
                const stock = Number(p.stock_quantity) || 0;
                const out = stock <= 0;
                return (
                  <tr key={p.product_number} className="border-t border-gray-100">
                    <td className="px-4 py-2"><a href={`/bokhald/solukerfi/vorur/${p.product_number}`} className="text-red-700 hover:underline"><span className="font-mono text-gray-400 mr-2">{p.product_number}</span>{p.name}</a></td>
                    <td className="px-4 py-2 text-gray-500">{p.product_group ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{n(p.stock_quantity)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{p.reorder_point != null ? n(p.reorder_point) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{kr(stock * (Number(p.cost_price) || 0))}</td>
                    <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${out ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>{out ? "Búið" : "Lágt"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Nýlegar birgðahreyfingar</h2>
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr><th className="px-4 py-2 font-medium">Dags.</th><th className="px-4 py-2 font-medium">Vara</th><th className="px-4 py-2 font-medium">Tegund</th><th className="px-4 py-2 font-medium text-right">Magn</th></tr>
            </thead>
            <tbody>
              {moves.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Engar hreyfingar enn</td></tr> : moves.map((m) => {
                const d = Number(m.qty_delta) || 0;
                return (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-500">{m.created_at ? `${dags(m.created_at)} ${m.created_at.slice(11, 16)}` : "—"}</td>
                    <td className="px-4 py-2"><span className="font-mono text-gray-400 mr-2">{m.product_number}</span>{m.name ?? ""}</td>
                    <td className="px-4 py-2 text-gray-600">{MOVE[m.type] ?? m.type}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${d < 0 ? "text-rose-600" : "text-green-700"}`}>{d > 0 ? "+" : ""}{n(m.qty_delta)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
