"use client";

import { useMemo, useState } from "react";
import { C } from "../theme";
import type { Meal } from "../meals";
import { MealCard } from "../MealCard";
import AddToBoxButton from "../AddToBoxButton";

export default function MenuBrowser({ meals }: { meals: Meal[] }) {
  const tags = useMemo(() => ["Allt", ...Array.from(new Set(meals.map((m) => m.tag)))], [meals]);
  const [active, setActive] = useState("Allt");
  const shown = active === "Allt" ? meals : meals.filter((m) => m.tag === active);

  return (
    <>
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
          <MealCard key={m.slug} meal={m} action={<AddToBoxButton slug={m.slug} />} />
        ))}
      </div>
    </>
  );
}
