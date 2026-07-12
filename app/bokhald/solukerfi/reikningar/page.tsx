import Link from "next/link";
import { getSalesInvoices } from "@/lib/accounting-queries";
import { dags, kr, vType, sourceLabel, STATUS_LABEL, vNr } from "@/lib/format";
import EinvoiceSendButton from "./EinvoiceSendButton";

export const dynamic = "force-dynamic";

export default async function ReikningarPage() {
  const rows = await getSalesInvoices(200);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Reikningar</h1>
      <p className="text-sm text-gray-500 mb-6">Öll sala — kassasala og reikningar</p>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nr.</th>
              <th className="px-4 py-2 font-medium">Dags.</th>
              <th className="px-4 py-2 font-medium">Tegund</th>
              <th className="px-4 py-2 font-medium">Rás</th>
              <th className="px-4 py-2 font-medium">Lýsing</th>
              <th className="px-4 py-2 font-medium">Staða</th>
              <th className="px-4 py-2 font-medium text-right">Upphæð</th>
              <th className="px-4 py-2 font-medium">Rafrænn</th>
              <th className="px-4 py-2 font-medium text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">Engin sala enn</td></tr>
            ) : rows.map((v) => (
              <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/bokhald/solukerfi/reikningar/${v.id}`} className="font-mono text-red-700 hover:underline">{vNr(v.series_code, v.voucher_number)}</Link>
                </td>
                <td className="px-4 py-2 text-gray-600">{dags(v.voucher_date)}</td>
                <td className="px-4 py-2">{vType(v.voucher_type)}</td>
                <td className="px-4 py-2 text-gray-600">{sourceLabel(v.source)}</td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-sm">{v.description}</td>
                <td className="px-4 py-2"><span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{STATUS_LABEL[v.status] ?? v.status}</span></td>
                <td className="px-4 py-2 text-right font-medium">{kr(v.amount)}</td>
                <td className="px-4 py-2">
                  <EinvoiceSendButton voucherId={v.id} flagged={v.customer_flagged} status={v.einvoice_status} hasKt={!!v.customer_kt} />
                </td>
                <td className="px-4 py-2 text-right">
                  <a href={`/api/reikningur/${v.id}/pdf`} target="_blank" rel="noopener" className="text-red-700 hover:underline">PDF</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
