import Link from "next/link";
import { listGoodsReceipts, type GoodsReceiptRow } from "@/lib/accounting-queries";
import { dags, kr } from "@/lib/format";
import MottakaUpload from "./MottakaUpload";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { draft: "Drög", received: "Móttekið", booked: "Bókað" };
const STATUS_CLASS: Record<string, string> = { draft: "bg-amber-100 text-amber-800", received: "bg-blue-100 text-blue-800", booked: "bg-green-100 text-green-800" };
const SOURCE: Record<string, string> = { peppol: "inExchange (XML)", pdf: "PDF", manual: "Handvirkt" };

export default async function MottakaPage() {
  const receipts = await listGoodsReceipts();
  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">Móttaka</h1>
          <p className="text-sm text-gray-500">Berðu saman móttekið magn við reikninginn, bókaðu og uppfærðu birgðir.</p>
        </div>
        <MottakaUpload />
      </div>

      {receipts.length === 0 ? (
        <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-10 text-center">Engin móttaka skráð. Hlaðaðu inn reikningi (inExchange XML eða PDF).</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2 font-semibold">Birgir</th>
                <th className="px-4 py-2 font-semibold">Reikningur</th>
                <th className="px-4 py-2 font-semibold">Dags</th>
                <th className="px-4 py-2 font-semibold">Uppruni</th>
                <th className="px-4 py-2 font-semibold text-center">Línur</th>
                <th className="px-4 py-2 font-semibold text-right">Upphæð</th>
                <th className="px-4 py-2 font-semibold">Staða</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r: GoodsReceiptRow) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{r.supplier_name || "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{r.invoice_number || "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{dags(r.invoice_date)}</td>
                  <td className="px-4 py-2 text-gray-500">{SOURCE[r.source] || r.source}</td>
                  <td className="px-4 py-2 text-center text-gray-600">{r.line_count}</td>
                  <td className="px-4 py-2 text-right">{r.total_gross ? kr(r.total_gross) : "—"}</td>
                  <td className="px-4 py-2"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[r.status] || "bg-gray-100"}`}>{STATUS[r.status] || r.status}</span></td>
                  <td className="px-4 py-2 text-right"><Link href={`/bokhald/solukerfi/innkaup/mottaka/${r.id}`} className="text-red-600 hover:text-red-700 font-medium">Skoða →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
