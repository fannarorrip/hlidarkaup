import Link from "next/link";
import { getSummary, getRecentVouchers } from "@/lib/accounting-queries";
import { getReminders } from "@/lib/reminders";
import { kr, num, vType, dags, STATUS_LABEL, vNr } from "@/lib/format";
import YfirlitCharts from "./YfirlitCharts";
import ReminderWidget from "./ReminderWidget";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [s, recent, reminders] = await Promise.all([getSummary(), getRecentVouchers(10), getReminders(21).catch(() => [])]);

  const velta = [
    { label: "Kassi", value: kr(s.till_gross) },
    { label: "Sjálfsafgreiðsla", value: kr(s.kiosk_gross) },
    { label: "Vefverslun", value: kr(s.web_gross) },
    { label: "Eldhús", value: kr(s.eldhus_gross) },
  ];

  const stats = [
    { label: "Útskattur (VSK)", value: kr(s.output_vat) },
    { label: "Bókhaldslyklar", value: num(s.accounts) },
    { label: "Vörur", value: num(s.products) },
    { label: "Strikamerki", value: num(s.barcodes) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Yfirlit</h1>
      <p className="text-sm text-gray-500 mb-6">Sala, greiðslumátar og nýjustu fylgiskjöl</p>

      {/* Áminningar: „Ekki gleyma" — efst svo ekkert gleymist */}
      <ReminderWidget initial={reminders} />

      {/* Live analytics: KPI + charts (dagar / vikur / mánuðir) */}
      <YfirlitCharts />

      {/* All-time channel + bookkeeping stats */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mt-8 mb-2">
        Velta eftir sölurás (frá upphafi)
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {velta.map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-xl font-bold mt-1 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-xl font-bold mt-1 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Nýjustu fylgiskjöl</h2>
        <Link href="/bokhald/fylgiskjol" className="text-sm text-red-700 hover:underline">Sjá öll →</Link>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
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
                    {vNr(v.series_code, v.voucher_number)}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-600">{dags(v.voucher_date)}</td>
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
