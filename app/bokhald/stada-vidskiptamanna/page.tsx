import Link from "next/link";
import { getCustomers } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StadaVidskiptamannaPage() {
  const customers = (await getCustomers()).filter((c) => !c.is_generic);
  const totalDue = customers.reduce((s, c) => s + Number(c.balance), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Staða viðskiptamanna</h1>
      <p className="text-sm text-gray-500 mb-6">Útistandandi staða (viðskiptakröfur)</p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto max-w-3xl">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nafn</th>
              <th className="px-4 py-2 font-medium">Kennitala</th>
              <th className="px-4 py-2 font-medium text-right">Greiðslufrestur</th>
              <th className="px-4 py-2 font-medium text-right">Staða</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Engir reikningsviðskiptamenn enn</td></tr>
            ) : customers.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/bokhald/solukerfi/vidskiptamenn/${c.id}`} className="text-red-700 hover:underline">{c.name}</Link>
                </td>
                <td className="px-4 py-2 font-mono text-gray-600">{c.kennitala ?? "—"}</td>
                <td className="px-4 py-2 text-right text-gray-500">{c.payment_terms_days} d.</td>
                <td className="px-4 py-2 text-right font-medium">{Number(c.balance) ? kr(c.balance) : <span className="text-gray-300">0 kr.</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 font-semibold">
              <td className="px-4 py-2" colSpan={3}>Útistandandi samtals</td>
              <td className="px-4 py-2 text-right">{kr(totalDue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3 max-w-3xl">
        Staðan fyllist þegar sala „á reikning“ er skráð á kassa (debet á viðskiptakröfur). Sá hluti er næsta skref í áfanga 3.
      </p>
    </div>
  );
}
