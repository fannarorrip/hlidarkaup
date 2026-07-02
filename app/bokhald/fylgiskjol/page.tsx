import Link from "next/link";
import { getVouchers } from "@/lib/accounting-queries";
import { kr, vType, STATUS_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const badge = (status: string) => {
  const map: Record<string, string> = {
    posted: "bg-green-50 text-green-700",
    reversed: "bg-gray-100 text-gray-500 line-through",
    draft: "bg-amber-50 text-amber-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
};

export default async function FylgiskjolPage() {
  const vouchers = await getVouchers(200);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Fylgiskjöl</h1>
      <p className="text-sm text-gray-500 mb-6">Dagbók — allar bókaðar færslur</p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nr.</th>
              <th className="px-4 py-2 font-medium">Dags.</th>
              <th className="px-4 py-2 font-medium">Tegund</th>
              <th className="px-4 py-2 font-medium">Lýsing</th>
              <th className="px-4 py-2 font-medium">Staða</th>
              <th className="px-4 py-2 font-medium text-right">Upphæð</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Engin fylgiskjöl enn</td></tr>
            ) : vouchers.map((v) => (
              <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/bokhald/fylgiskjol/${v.id}`} className="font-mono text-red-700 hover:underline">
                    {v.series_code}-{v.voucher_number}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-600">{v.voucher_date}</td>
                <td className="px-4 py-2">{vType(v.voucher_type)}</td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-sm">{v.description}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${badge(v.status)}`}>{STATUS_LABEL[v.status] ?? v.status}</span>
                </td>
                <td className="px-4 py-2 text-right font-medium">{kr(v.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
