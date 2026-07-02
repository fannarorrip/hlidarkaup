import Link from "next/link";
import { getSummary, getRecentVouchers } from "@/lib/accounting-queries";
import { kr, num, vType, STATUS_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [s, recent] = await Promise.all([getSummary(), getRecentVouchers(10)]);

  const heildarvelta =
    Number(s.till_gross) + Number(s.kiosk_gross) + Number(s.web_gross) + Number(s.eldhus_gross);

  const velta = [
    { label: "Velta í kassa", value: kr(s.till_gross) },
    { label: "Velta í sjálfsafgreiðslukassa", value: kr(s.kiosk_gross) },
    { label: "Velta í vefverslun", value: kr(s.web_gross) },
    { label: "Velta í eldhúsi", value: kr(s.eldhus_gross) },
  ];

  const cards = [
    { label: "Heildarvelta", value: kr(heildarvelta) },
    { label: "Sölur (fjöldi)", value: num(s.sales_tx) },
    { label: "Útskattur (VSK)", value: kr(s.output_vat) },
    { label: "Bókhaldslyklar", value: num(s.accounts) },
    { label: "Vörur", value: num(s.products) },
    { label: "Strikamerki", value: num(s.barcodes) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Yfirlit</h1>
      <p className="text-sm text-gray-500 mb-6">Staða bókhalds og nýjustu færslur</p>

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Velta eftir sölurás</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {velta.map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Nýjustu fylgiskjöl</h2>
        <Link href="/bokhald/fylgiskjol" className="text-sm text-red-700 hover:underline">Sjá öll →</Link>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nr.</th>
              <th className="px-4 py-2 font-medium">Dags.</th>
              <th className="px-4 py-2 font-medium">Tegund</th>
              <th className="px-4 py-2 font-medium">Lýsing</th>
              <th className="px-4 py-2 font-medium text-right">Upphæð</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Engin fylgiskjöl enn</td></tr>
            ) : recent.map((v) => (
              <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/bokhald/fylgiskjol/${v.id}`} className="font-mono text-red-700 hover:underline">
                    {v.series_code}-{v.voucher_number}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-600">{v.voucher_date}</td>
                <td className="px-4 py-2">{vType(v.voucher_type)}</td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{v.description}</td>
                <td className="px-4 py-2 text-right font-medium">{kr(v.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {recent.some((v) => v.status !== "posted") && (
        <p className="text-xs text-gray-400 mt-2">Athugið: {STATUS_LABEL.reversed} fylgiskjöl eru sýnd til rekjanleika.</p>
      )}
    </div>
  );
}
