import Link from "next/link";
import { getLedgerAccounts } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdalbokPage() {
  const rows = await getLedgerAccounts();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Aðalbók</h1>
      <p className="text-sm text-gray-500 mb-6">Hreyfðir lyklar — smelltu til að sjá færslur</p>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto max-w-3xl">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Lykill</th>
              <th className="px-4 py-2 font-medium">Heiti</th>
              <th className="px-4 py-2 font-medium text-right">Debet</th>
              <th className="px-4 py-2 font-medium text-right">Kredit</th>
              <th className="px-4 py-2 font-medium text-right">Staða</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Engar hreyfingar enn</td></tr>
            ) : rows.map((r) => (
              <tr key={r.account_number} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono">
                  <Link href={`/bokhald/adalbok/${r.account_number}`} className="text-red-700 hover:underline">{r.account_number}</Link>
                </td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 text-right">{kr(r.total_debit)}</td>
                <td className="px-4 py-2 text-right">{kr(r.total_credit)}</td>
                <td className="px-4 py-2 text-right font-medium">{kr(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
