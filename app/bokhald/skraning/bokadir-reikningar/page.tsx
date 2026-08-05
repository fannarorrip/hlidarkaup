import Link from "next/link";
import { getBookedPurchaseInvoices } from "@/lib/accounting-queries";
import { dags, kr, vNr } from "@/lib/format";

export const dynamic = "force-dynamic";

// Allir BÓKAÐIR innkaupareikningar á einum stað — óháð því hvort þeir voru bókaðir í
// pósthólfinu (journal) eða gegnum móttöku (purchase). Smellt á númerið opnar fylgiskjalið.
export default async function BokadirReikningarPage() {
  const rows = await getBookedPurchaseInvoices(300);
  const total = rows.reduce((s, r) => s + Number(r.total), 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">Bókaðir reikningar</h1>
          <p className="text-sm text-gray-500">Innkaupareikningar sem eru komnir í bókhaldið — úr pósthólfi og móttöku ({rows.length} síðustu)</p>
        </div>
        <Link href="/bokhald/skraning/postholf" className="text-sm text-red-600 hover:underline">← Pósthólf</Link>
      </div>
      <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-semibold">Dags.</th>
              <th className="px-4 py-2 font-semibold">Fylgiskjal</th>
              <th className="px-4 py-2 font-semibold">Birgir</th>
              <th className="px-4 py-2 font-semibold">Lýsing</th>
              <th className="px-4 py-2 font-semibold">Leið</th>
              <th className="px-4 py-2 font-semibold text-right">Upphæð</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Engir bókaðir reikningar enn</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 whitespace-nowrap text-gray-500">{dags(r.voucher_date)}</td>
                <td className="px-4 py-2"><Link href={`/bokhald/fylgiskjol/${r.id}`} className="font-mono text-red-700 hover:underline">{vNr(r.series_code, r.voucher_number)}</Link></td>
                <td className="px-4 py-2">{r.supplier_name ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500 max-w-[22rem] truncate">{r.description ?? ""}</td>
                <td className="px-4 py-2 text-gray-400 text-xs">{r.source}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums whitespace-nowrap">{kr(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="px-4 py-2" colSpan={5}>Samtals (síðustu {rows.length})</td>
              <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{kr(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
