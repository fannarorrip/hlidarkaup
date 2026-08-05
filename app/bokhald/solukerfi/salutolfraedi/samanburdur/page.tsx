import Link from "next/link";
import { Suspense } from "react";
import { getProductTotals, getProductDaily } from "@/lib/sales-stats";
import { kr } from "@/lib/format";
import VoruVal from "./VoruVal";

export const dynamic = "force-dynamic";

// Vörusamanburður: veldu vörur og sjáðu þær hlið við hlið — stk, veltu, framlegð,
// körfuhlutfall og dagssöluna sem litakóðaðar súlur á sömu tímalínu.
const COLORS = ["#2C687B", "#DB1A1A", "#D9A400", "#5B8C5A", "#7B5BA6", "#B85C38"];

export default async function SamanburdurPage({ searchParams }: { searchParams: Promise<{ vorur?: string; dagar?: string }> }) {
  const sp = await searchParams;
  const days = sp.dagar === "90" ? 90 : sp.dagar === "7" ? 7 : 30;
  const pns = (sp.vorur ?? "").split(",").map((s) => decodeURIComponent(s.trim())).filter(Boolean).slice(0, 6);
  const totals = pns.length ? await getProductTotals(pns, days) : [];
  const daily = pns.length ? await getProductDaily(pns, days) : [];
  const n = (x: string | number | null | undefined) => Math.round(Number(x) || 0);
  const n1 = (x: string | number | null | undefined) => (Math.round((Number(x) || 0) * 10) / 10).toLocaleString("is-IS");

  // Röð daganna (líka núll-dagar) + hámark yfir allar vörur svo súlurnar séu samanburðarhæfar.
  const seriesDays: string[] = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); seriesDays.push(d.toISOString().slice(0, 10)); }
  const qtyOf = (pn: string, day: string) => Number(daily.find((r) => r.product_number === pn && r.day === day)?.qty) || 0;
  const maxQty = Math.max(1, ...daily.map((r) => Number(r.qty)));
  const ordered = pns.map((pn) => totals.find((t) => t.product_number === pn)).filter(Boolean) as typeof totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">⚖️ Vörusamanburður</h1>
          <p className="text-sm text-gray-500">Veldu allt að 6 vörur og berðu þær saman — <Link href="/bokhald/solukerfi/salutolfraedi" className="text-red-600 hover:underline">← Sölutölfræði</Link></p>
        </div>
      </div>

      <Suspense><VoruVal selected={ordered.map((t) => ({ product_number: t.product_number, name: t.name }))} days={days} /></Suspense>

      {ordered.length === 0 ? (
        <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl px-4 py-10 text-center">Leitaðu að vöru hér að ofan til að hefja samanburðinn.{pns.length > 0 && " (Engin sala á völdum vörum á tímabilinu.)"}</p>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr><th className="px-4 py-2 font-medium">Vara</th><th className="px-4 py-2 font-medium text-right">Selt stk</th><th className="px-4 py-2 font-medium text-right">Velta</th><th className="px-4 py-2 font-medium text-right">Framlegð</th><th className="px-4 py-2 font-medium text-right">Körfur</th><th className="px-4 py-2 font-medium text-right">% af körfum</th></tr>
              </thead>
              <tbody>
                {ordered.map((t, i) => (
                  <tr key={t.product_number} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <span className="inline-block w-3 h-3 rounded-sm mr-2 align-middle" style={{ background: COLORS[i % COLORS.length] }} />
                      <Link href={`/bokhald/solukerfi/salutolfraedi/vara/${t.product_number}?dagar=${days}`} className="hover:text-red-700 hover:underline">{t.name}</Link>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{n1(t.qty)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{kr(n(t.revenue))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.margin != null ? kr(n(t.margin)) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.baskets}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.basket_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <p className="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-600">Seld stykki per dag — síðustu {days} dagar</p>
            <div className="px-4 py-3 space-y-2">
              {ordered.map((t, i) => (
                <div key={t.product_number} className="flex items-end gap-px h-14" title={t.name}>
                  {seriesDays.map((day) => {
                    const q = qtyOf(t.product_number, day);
                    return <div key={day} className="flex-1 min-w-[4px]" title={`${t.name} — ${day}: ${n1(q)} stk`}>
                      <div className="w-full rounded-t" style={{ height: `${Math.max(2, (q / maxQty) * 48)}px`, background: q > 0 ? COLORS[i % COLORS.length] : "#f3f4f6" }} />
                    </div>;
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
