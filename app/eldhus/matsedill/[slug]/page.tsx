import Link from "next/link";
import { notFound } from "next/navigation";
import { C } from "../../theme";
import { getWeekMeals, getMeal } from "../../meals";
import AddToBoxButton from "../../AddToBoxButton";

const serifStyle = { fontFamily: "var(--font-eldhus-serif)" } as const;

export async function generateStaticParams() {
  return (await getWeekMeals()).map((m) => ({ slug: m.slug }));
}

export default async function MealDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meal = await getMeal(slug);
  if (!meal) notFound();

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <Link href="/eldhus/matsedill" className="inline-flex items-center gap-1 text-sm font-semibold mb-6 hover:opacity-70" style={{ color: C.deep }}>
        ← Matseðill
      </Link>

      <div className="grid lg:grid-cols-2 gap-10">
        {/* Image */}
        <div className="rounded-[2rem] overflow-hidden shadow-md self-start">
          <div
            className="aspect-[4/5] flex items-end p-6 bg-cover bg-center"
            style={meal.image ? { backgroundImage: `url(${meal.image})` } : { background: `linear-gradient(150deg, ${meal.from}, ${meal.to})` }}
          >
            <span className="inline-block text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full bg-white/85" style={{ color: C.deep }}>
              {meal.tag}
            </span>
          </div>
        </div>

        {/* Info */}
        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4" style={{ ...serifStyle, color: C.deep }}>
            {meal.title}
          </h1>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold mb-6" style={{ color: C.deep }}>
            <span>⏱ {meal.minutes} mín</span>
            <span>· {meal.kcal} kcal / skammt</span>
          </div>

          <p className="text-base leading-relaxed mb-8" style={{ color: C.ink }}>{meal.description}</p>

          <div className="mb-8">
            <h2 className="text-xl font-bold mb-3" style={{ ...serifStyle, color: C.deep }}>Hráefni</h2>
            <div className="flex flex-wrap gap-2">
              {meal.ingredients.map((ing) => (
                <span key={ing} className="px-3 py-1.5 rounded-full text-sm" style={{ backgroundColor: C.tealSoft, color: C.ink }}>
                  {ing}
                </span>
              ))}
            </div>
          </div>

          {meal.allergens.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-2" style={{ ...serifStyle, color: C.deep }}>Ofnæmisvaldar</h2>
              <p className="text-sm" style={{ color: C.muted }}>{meal.allergens.join(" · ")}</p>
            </div>
          )}

          <AddToBoxButton slug={meal.slug} large />
          <p className="text-xs mt-2" style={{ color: C.muted }}>Veldu skammtastærð og fjölda rétta í kassanum.</p>
        </div>
      </div>
    </main>
  );
}
