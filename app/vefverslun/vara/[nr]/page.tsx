import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import AddToCartButton from "@/components/AddToCartButton";

// Public product page (vefverslun) — shows the mandatory EU 1169/2011 food
// information (innihald, ofnæmisvaldar, næringargildi, nettómagn) BEFORE purchase,
// as required for matvöru í fjarsölu. Data comes straight from shop.products.
export const dynamic = "force-dynamic";

const NUTRITION_ROWS: [string, string, string][] = [
  ["orka_kj", "Orka", "kJ"],
  ["orka_kcal", "", "kcal"],
  ["fita", "Fita", "g"],
  ["mettadar_fitusyrur", "þar af mettaðar fitusýrur", "g"],
  ["kolvetni", "Kolvetni", "g"],
  ["sykrur", "þar af sykrur", "g"],
  ["trefjar", "Trefjar", "g"],
  ["protein", "Prótein", "g"],
  ["salt", "Salt", "g"],
];

interface Row {
  product_number: string; name: string; description: string | null; price_gross: number;
  product_group: string | null; stock_quantity: string; is_stock_controlled: boolean;
  image_url: string | null; innihald: string | null; ofnaemisvaldar: string | null;
  naeringargildi: Record<string, number | null> | null; netto_magn: string | null; uppruni: string | null;
}

async function getProduct(nr: string): Promise<Row | null> {
  const rows = await query<Row>(`
    select product_number, name, description, price_gross, product_group, stock_quantity,
           is_stock_controlled, image_url, innihald, ofnaemisvaldar, naeringargildi, netto_magn, uppruni
    from shop.products
    where product_number = $1 and is_active and price_gross > 0
      -- sama fullgerðar-sía og í /api/products: mynd + innihald skilyrði fyrir birtingu
      and image_url is not null and innihald is not null`, [nr]);
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ nr: string }> }) {
  const { nr } = await params;
  const p = await getProduct(nr);
  return { title: p ? `${p.name} — Hlíðarkaup` : "Vara — Hlíðarkaup" };
}

export default async function VaraPage({ params }: { params: Promise<{ nr: string }> }) {
  const { nr } = await params;
  const p = await getProduct(nr);
  if (!p) notFound();

  const product = {
    id: p.product_number,
    name: p.name,
    description: p.description ?? p.name,
    price: Number(p.price_gross),
    image: p.image_url ?? undefined,
    stock: p.is_stock_controlled ? Math.max(0, Math.floor(Number(p.stock_quantity))) : undefined,
  };
  const nutrition = p.naeringargildi ?? null;
  const hasNutrition = !!nutrition && NUTRITION_ROWS.some(([k]) => nutrition[k] != null);
  const allergens = (p.ofnaemisvaldar ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const fmt = (v: number) => v.toLocaleString("is-IS", { maximumFractionDigits: 2 });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link href="/vefverslun" className="text-sm text-gray-500 hover:text-brand-red hover:underline">← Aftur í verslun</Link>

      <div className="mt-4 grid md:grid-cols-2 gap-8">
        {/* Image */}
        <div className="bg-gradient-to-br from-red-50 to-white rounded-2xl border border-gray-100 flex items-center justify-center min-h-64 p-6">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt={product.name} className="max-h-72 w-full object-contain" />
          ) : (
            <span className="text-7xl select-none">🛒</span>
          )}
        </div>

        {/* Name, price, cart */}
        <div className="flex flex-col">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">{p.name}</h1>
          {p.netto_magn && <p className="mt-1 text-sm text-gray-500">{p.netto_magn}</p>}
          {p.description && p.description !== p.name && (
            <p className="mt-3 text-gray-600 text-sm">{p.description}</p>
          )}
          <p className="mt-4 text-3xl font-extrabold text-gray-900">
            {product.price.toLocaleString("is-IS")} kr.
          </p>
          {product.stock !== undefined && product.stock > 0 && product.stock <= 4 && (
            <p className="mt-1 text-sm font-semibold text-amber-600">Fátt eftir á lager</p>
          )}
          <div className="mt-5">
            <AddToCartButton product={product} />
          </div>
          {p.uppruni && (
            <p className="mt-6 text-sm text-gray-500">Upprunaland: <span className="font-medium text-gray-800">{p.uppruni}</span></p>
          )}
        </div>
      </div>

      {/* Mandatory food information */}
      <div className="mt-10 grid md:grid-cols-2 gap-6">
        <section className="bg-white border border-gray-100 rounded-2xl p-5">
          <h2 className="font-bold text-gray-900 mb-3">Innihald</h2>
          {p.innihald ? (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{p.innihald}</p>
          ) : (
            <p className="text-sm text-gray-400">Innihaldslýsing hefur ekki verið skráð fyrir þessa vöru.</p>
          )}
          {allergens.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Ofnæmis- og óþolsvaldar</h3>
              <div className="flex flex-wrap gap-1.5">
                {allergens.map((a) => (
                  <span key={a} className="text-xs font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-100 rounded-2xl p-5">
          <h2 className="font-bold text-gray-900 mb-3">Næringargildi í 100 g / 100 ml</h2>
          {hasNutrition && nutrition ? (
            <table className="w-full text-sm">
              <tbody>
                {NUTRITION_ROWS.map(([key, label, unit]) => {
                  const v = nutrition[key];
                  if (v == null) return null;
                  const sub = label === "" || label.startsWith("þar af");
                  return (
                    <tr key={key} className="border-b border-gray-100 last:border-0">
                      <td className={`py-1.5 ${sub ? "pl-4 text-gray-500" : "font-medium text-gray-800"}`}>
                        {label || " "}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-gray-800">{fmt(v)} {unit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400">Næringargildi hafa ekki verið skráð fyrir þessa vöru.</p>
          )}
        </section>
      </div>
    </div>
  );
}
