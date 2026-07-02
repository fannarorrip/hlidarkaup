import Link from "next/link";
import { getCustomers } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VidskiptamennPage() {
  const customers = await getCustomers();
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Viðskiptamenn</h1>
          <p className="text-sm text-gray-500">{customers.length} viðskiptamenn</p>
        </div>
        <Link href="/bokhald/solukerfi/vidskiptamenn/nyr" className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">+ Nýr viðskiptamaður</Link>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nafn</th>
              <th className="px-4 py-2 font-medium">Kennitala</th>
              <th className="px-4 py-2 font-medium">Sími</th>
              <th className="px-4 py-2 font-medium">Reikningur</th>
              <th className="px-4 py-2 font-medium text-right">Staða</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/bokhald/solukerfi/vidskiptamenn/${c.id}`} className="text-red-700 hover:underline">{c.name}</Link>
                  {c.is_generic && <span className="ml-2 text-[10px] text-gray-400">almenn</span>}
                  {!c.is_active && <span className="ml-2 text-[10px] text-gray-400">óvirkur</span>}
                </td>
                <td className="px-4 py-2 font-mono text-gray-600">{c.kennitala ?? "—"}</td>
                <td className="px-4 py-2 text-gray-600">{c.phone ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">{c.is_account ? "Já" : "—"}</td>
                <td className="px-4 py-2 text-right font-medium">{Number(c.balance) ? kr(c.balance) : <span className="text-gray-300">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
