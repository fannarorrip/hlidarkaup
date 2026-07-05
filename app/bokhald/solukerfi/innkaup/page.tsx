import Link from "next/link";
import { getPurchases, getPostableAccounts, getBankAccounts } from "@/lib/accounting-queries";
import { dags, kr } from "@/lib/format";
import PurchaseForm from "./PurchaseForm";

export const dynamic = "force-dynamic";

export default async function InnkaupPage() {
  const [purchases, accounts, banks] = await Promise.all([
    getPurchases(100),
    getPostableAccounts(["gjold", "eign"]),
    getBankAccounts(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Innkaup</h1>
      <p className="text-sm text-gray-500 mb-6">Innkaupareikningar með innskatti</p>

      <PurchaseForm accounts={accounts} banks={banks} />

      <h2 className="text-lg font-semibold mb-3">Skráð innkaup</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nr.</th>
              <th className="px-4 py-2 font-medium">Dags.</th>
              <th className="px-4 py-2 font-medium">Birgi</th>
              <th className="px-4 py-2 font-medium text-right">Upphæð</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Engin innkaup skráð enn</td></tr>
            ) : purchases.map((v) => (
              <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/bokhald/fylgiskjol/${v.id}`} className="font-mono text-red-700 hover:underline">{v.series_code}-{v.voucher_number}</Link>
                </td>
                <td className="px-4 py-2 text-gray-600">{dags(v.voucher_date)}</td>
                <td className="px-4 py-2 text-gray-600">{v.description?.replace(/^Innkaup – /, "")}</td>
                <td className="px-4 py-2 text-right font-medium">{kr(v.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
