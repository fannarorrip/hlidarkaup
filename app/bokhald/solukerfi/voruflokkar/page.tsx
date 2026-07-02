import { getProductGroups } from "@/lib/accounting-queries";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VoruflokkarPage() {
  const groups = await getProductGroups();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Vöruflokkar</h1>
      <p className="text-sm text-gray-500 mb-6">Flokkun vara ({groups.length} flokkar)</p>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Flokkur</th>
              <th className="px-4 py-2 font-medium text-right">Fjöldi vara</th>
              <th className="px-4 py-2 font-medium text-right">Birgðir</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.product_group} className="border-t border-gray-100">
                <td className="px-4 py-2">{g.product_group}</td>
                <td className="px-4 py-2 text-right">{num(g.count)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{Math.floor(Number(g.stock))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3 max-w-xl">
        Flestar vörur eru enn óflokkaðar — vöruflokkar (ProductGroup) verða fluttir inn frá Regla eða skilgreindir hér síðar.
      </p>
    </div>
  );
}
