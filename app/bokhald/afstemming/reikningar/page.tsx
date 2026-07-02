import Link from "next/link";
import { getOpenReceivables, getDuplicateSales } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReikningsafstemmingPage() {
  const [open, dups] = await Promise.all([getOpenReceivables(), getDuplicateSales()]);
  const totalOpen = open.reduce((s, c) => s + Number(c.balance), 0);

  return (
    <div>
      <Link href="/bokhald/afstemming" className="text-sm text-gray-500 hover:underline">← Afstemming</Link>
      <h1 className="text-2xl font-bold mb-1 mt-1 flex items-center gap-2">📋 Reikningsafstemming</h1>
      <p className="text-sm text-gray-500 mb-5">Útgefnir reikningar á móti greiðslum — ógreitt og mögulegar tvískráningar.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Ógreitt samtals</p><p className="text-2xl font-bold mt-1">{kr(totalOpen)}</p></div>
        <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Viðskiptamenn með stöðu</p><p className="text-2xl font-bold mt-1">{open.length}</p></div>
        <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Mögulegar tvískráningar</p><p className={`text-2xl font-bold mt-1 ${dups.length ? "text-amber-600" : ""}`}>{dups.length}</p></div>
      </div>

      <h2 className="text-lg font-semibold mb-2">Ógreitt eftir viðskiptamanni</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Viðskiptamaður</th>
              <th className="px-4 py-2 font-medium">Kennitala</th>
              <th className="px-4 py-2 font-medium text-right">Reikningar</th>
              <th className="px-4 py-2 font-medium text-right">Staða (ógreitt)</th>
            </tr>
          </thead>
          <tbody>
            {open.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Ekkert ógreitt — allt stemmir ✓</td></tr>
            ) : open.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2"><Link href={`/bokhald/solukerfi/vidskiptamenn/${c.id}`} className="text-red-700 hover:underline">{c.name}</Link></td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500">{c.kennitala ?? "-"}</td>
                <td className="px-4 py-2 text-right text-gray-600">{c.invoices}</td>
                <td className="px-4 py-2 text-right font-semibold">{kr(c.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold mb-2">Mögulegar tvískráningar</h2>
      <p className="text-xs text-gray-400 mb-2">Sölur með sama viðskiptamann, dagsetningu og fjárhæð — yfirfarðu hvort um tvískráningu sé að ræða.</p>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Viðskiptamaður</th>
              <th className="px-4 py-2 font-medium">Dags.</th>
              <th className="px-4 py-2 font-medium text-right">Fjárhæð</th>
              <th className="px-4 py-2 font-medium text-right">Fjöldi</th>
              <th className="px-4 py-2 font-medium">Fylgiskjöl</th>
            </tr>
          </thead>
          <tbody>
            {dups.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Engar tvískráningar fundust ✓</td></tr>
            ) : dups.map((d, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-2">{d.customer_name ?? "(almennur)"}</td>
                <td className="px-4 py-2 text-gray-600">{d.voucher_date}</td>
                <td className="px-4 py-2 text-right">{kr(d.amount)}</td>
                <td className="px-4 py-2 text-right text-amber-600 font-semibold">{d.cnt}×</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500">{d.vouchers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
