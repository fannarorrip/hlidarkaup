import { getProductGroups, getWebCategories } from "@/lib/accounting-queries";
import { query } from "@/lib/db";
import AiFlokkun from "./AiFlokkun";
import { num, GROUP_NAMES } from "@/lib/format";

export const dynamic = "force-dynamic";

// Tvö AÐSKILIN flokkakerfi: kassaflokkarnir (10/20/30 — takkarnir á kassanum, snertast ekki)
// og VEFFLOKKARNIR (Krónu-stíll: Brauð, Kjöt, Mjólkurvörur...) sem vörur fá að auki.
export default async function VoruflokkarPage() {
  const [groups, webCats] = await Promise.all([getProductGroups(), getWebCategories().catch(() => [])]);
  const unclassified = Number((await query<{ n: string }>(`select count(*) as n from shop.products where is_active and web_category is null`).catch(() => [{ n: "0" }]))[0].n) || 0;
  const mains = webCats.filter((c) => !c.parent_slug);
  const subsOf = (slug: string) => webCats.filter((c) => c.parent_slug === slug);
  const countWithSubs = (slug: string) => (webCats.find((c) => c.slug === slug)?.product_count ?? 0) + subsOf(slug).reduce((s, c) => s + c.product_count, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Vöruflokkar</h1>
        <p className="text-sm text-gray-500 mb-4">Kassaflokkar (takkarnir á kassanum) og vefflokkar (Krónu-stíll) — tvö aðskilin kerfi.</p>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Kassaflokkar ({groups.length})</h2>
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
                  <td className="px-4 py-2">{g.product_group}{GROUP_NAMES[g.product_group] && <span className="ml-2 text-gray-500">{GROUP_NAMES[g.product_group]}</span>}</td>
                  <td className="px-4 py-2 text-right">{num(g.count)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{Math.floor(Number(g.stock))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Vefflokkar ({mains.length} yfirflokkar)</h2>
          <AiFlokkun unclassified={unclassified} />
        </div>
        {mains.length === 0 ? (
          <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-6 max-w-xl">Engir vefflokkar enn — þeir koma með næstu uppfærslu.</p>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {mains.map((m) => (
              <div key={m.slug} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="font-semibold flex items-baseline justify-between">
                  {m.name}
                  <span className="text-xs font-normal text-gray-400">{num(countWithSubs(m.slug))} vörur</span>
                </p>
                {subsOf(m.slug).length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-sm text-gray-600">
                    {subsOf(m.slug).map((s) => (
                      <li key={s.slug} className="flex items-baseline justify-between">
                        <span>{s.name}</span>
                        <span className="text-xs text-gray-400">{s.product_count > 0 ? num(s.product_count) : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">Vara fær vefflokk á vöruspjaldinu (Vefflokkur-valið). Kassaflokkurinn (10/20/30…) stýrir áfram tökkunum á kassanum og breytist ekki.</p>
      </div>
    </div>
  );
}
