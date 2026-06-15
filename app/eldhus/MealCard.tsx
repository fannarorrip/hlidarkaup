import Link from "next/link";
import { C } from "./theme";
import type { Meal } from "./meals";

const serifStyle = { fontFamily: "var(--font-eldhus-serif)" } as const;

/** Large hero tile (image-forward, no text body). */
export function MealTile({ meal }: { meal: Meal }) {
  return (
    <Link href={`/eldhus/matsedill/${meal.slug}`} className="block rounded-3xl overflow-hidden shadow-md">
      <div className="aspect-[4/5] flex items-end p-5" style={{ background: `linear-gradient(150deg, ${meal.from}, ${meal.to})` }}>
        <div>
          <span className="inline-block text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full mb-2 bg-white/85" style={{ color: C.deep }}>
            {meal.tag}
          </span>
          <p className="text-white font-bold leading-snug text-lg drop-shadow" style={serifStyle}>{meal.title}</p>
        </div>
      </div>
    </Link>
  );
}

/** Standard menu card. */
export function MealCard({ meal }: { meal: Meal }) {
  return (
    <Link href={`/eldhus/matsedill/${meal.slug}`} className="group block rounded-3xl overflow-hidden bg-white shadow-sm hover:shadow-lg transition-shadow">
      <div className="aspect-[3/2] relative" style={{ background: `linear-gradient(150deg, ${meal.from}, ${meal.to})` }}>
        <span className="absolute top-3 left-3 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-white/85" style={{ color: C.deep }}>
          {meal.tag}
        </span>
      </div>
      <div className="p-5">
        <h3 className="text-lg font-bold leading-snug mb-2 group-hover:opacity-80" style={{ ...serifStyle, color: C.ink }}>
          {meal.title}
        </h3>
        <p className="text-sm leading-relaxed mb-4" style={{ color: C.muted }}>{meal.blurb}</p>
        <div className="flex items-center gap-4 text-xs font-medium" style={{ color: C.deep }}>
          <span>⏱ {meal.minutes} mín</span>
          <span>· {meal.kcal} kcal</span>
        </div>
      </div>
    </Link>
  );
}
