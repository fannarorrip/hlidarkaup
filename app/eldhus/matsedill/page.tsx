"use client";

import { useMemo, useState } from "react";
import { C } from "../theme";
import { getWeekMeals } from "../meals";
import { MealCard } from "../MealCard";

const serifStyle = { fontFamily: "var(--font-eldhus-serif)" } as const;

function weekLabel() {
  const now = new Date();
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("is-IS", { day: "numeric", month: "long" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export default function MatsedillPage() {
  const meals = getWeekMeals();
  const tags = useMemo(() => ["Allt", ...Array.from(new Set(meals.map((m) => m.tag)))], [meals]);
  const [active, setActive] = useState("Allt");

  const shown = active === "Allt" ? meals : meals.filter((m) => m.tag === active);

  return (
    <main className="max-w-6xl mx-auto px-6 py-14">
      <header className="text-center mb-10">
        <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4" style={{ backgroundColor: C.tealSoft, color: C.deep }}>
          Matseðill vikunnar · {weekLabel()}
        </span>
        <h1 className="text-4xl lg:text-5xl font-bold mb-3" style={{ ...serifStyle, color: C.deep }}>
          Veldu réttina þína
        </h1>
        <p className="max-w-xl mx-auto" style={{ color: C.muted }}>
          Nýr matseðill á hverjum mánudegi. Veldu það sem heillar — við sjáum um afganginn.
        </p>
      </header>

      {/* Category filter */}
      <div className="flex flex-wrap justify-center gap-2 mb-10">
        {tags.map((tag) => {
          const on = tag === active;
          return (
            <button
              key={tag}
              onClick={() => setActive(tag)}
              className="px-4 py-2 rounded-full text-sm font-semibold transition-colors"
              style={
                on
                  ? { backgroundColor: C.deep, color: "#fff" }
                  : { backgroundColor: "#fff", color: C.deep, border: `1px solid ${C.tealSoft}` }
              }
            >
              {tag}
            </button>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {shown.map((m) => (
          <MealCard key={m.slug} meal={m} />
        ))}
      </div>
    </main>
  );
}
