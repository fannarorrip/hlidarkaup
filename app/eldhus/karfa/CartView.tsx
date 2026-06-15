"use client";

import Link from "next/link";
import { C } from "../theme";
import type { Meal } from "../meals";
import { useBox, PORTION_OPTIONS, MEAL_OPTIONS } from "../box-context";

const serif = { fontFamily: "var(--font-eldhus-serif)" } as const;

export default function CartView({ meals }: { meals: Meal[] }) {
  const box = useBox();
  const selectedMeals = box.selected
    .map((slug) => meals.find((m) => m.slug === slug))
    .filter((m): m is Meal => Boolean(m));
  const remaining = Math.max(0, box.target - box.count);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-8" style={{ ...serif, color: C.deep }}>Kassinn þinn</h1>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* Left: box config + selected meals */}
        <div className="lg:col-span-2 space-y-8">
          {/* Box size */}
          <section className="bg-white rounded-3xl p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-4" style={{ ...serif, color: C.deep }}>Skammtastærð</h2>
            <div className="flex gap-3 mb-6">
              {PORTION_OPTIONS.map((p) => (
                <Choice key={p} on={box.portions === p} onClick={() => box.setPortions(p)} label={`${p} manna`} />
              ))}
            </div>
            <h2 className="text-lg font-bold mb-4" style={{ ...serif, color: C.deep }}>Fjöldi rétta á viku</h2>
            <div className="flex gap-3">
              {MEAL_OPTIONS.map((n) => (
                <Choice key={n} on={box.target === n} onClick={() => box.setTarget(n)} label={`${n} réttir`} />
              ))}
            </div>
          </section>

          {/* Selected meals */}
          <section className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ ...serif, color: C.deep }}>
                Réttir ({box.count}/{box.target})
              </h2>
              {box.count > 0 && (
                <button onClick={box.clear} className="text-sm font-semibold" style={{ color: C.red }}>Tæma</button>
              )}
            </div>

            {selectedMeals.length === 0 ? (
              <p className="py-6 text-center" style={{ color: C.muted }}>
                Engir réttir valdir enn.
              </p>
            ) : (
              <div className="space-y-3">
                {selectedMeals.map((m) => (
                  <div key={m.slug} className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-xl bg-cover bg-center shrink-0"
                      style={m.image ? { backgroundImage: `url(${m.image})` } : { background: `linear-gradient(150deg, ${m.from}, ${m.to})` }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate" style={{ color: C.ink }}>{m.title}</p>
                      <p className="text-sm" style={{ color: C.muted }}>{m.tag} · {m.minutes} mín</p>
                    </div>
                    <button onClick={() => box.removeMeal(m.slug)} className="text-sm font-semibold px-2" style={{ color: C.red }}>Fjarlægja</button>
                  </div>
                ))}
              </div>
            )}

            {remaining > 0 && (
              <Link href="/eldhus/matsedill" className="mt-5 inline-block font-semibold" style={{ color: C.deep }}>
                + Veldu {remaining} {remaining === 1 ? "rétt" : "rétti"} í viðbót
              </Link>
            )}
          </section>
        </div>

        {/* Right: summary */}
        <aside className="bg-white rounded-3xl p-6 shadow-sm lg:sticky lg:top-24">
          <h2 className="text-lg font-bold mb-4" style={{ ...serif, color: C.deep }}>Samantekt</h2>
          <Row label={`${box.target} réttir × ${box.portions} manna`} value={`${(box.target * box.portions)} skammtar`} />
          <Row label="Verð á skammt" value={`${box.pricePerServing.toLocaleString("is-IS")} kr.`} />
          <div className="border-t my-4" style={{ borderColor: C.tealSoft }} />
          <div className="flex justify-between items-end mb-1">
            <span className="font-bold" style={{ color: C.ink }}>Samtals á viku</span>
            <span className="text-2xl font-extrabold" style={{ color: C.red }}>{box.total.toLocaleString("is-IS")} kr.</span>
          </div>
          <p className="text-xs mb-5" style={{ color: C.muted }}>Afhending reiknuð í næsta skrefi.</p>

          <button
            disabled={!box.isFull}
            className="w-full font-bold py-4 rounded-full text-white transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: C.red }}
            title={!box.isFull ? "Veldu fleiri rétti fyrst" : undefined}
          >
            {box.isFull ? "Halda áfram að afhendingu" : `Veldu ${remaining} í viðbót`}
          </button>
          <p className="text-[11px] text-center mt-3" style={{ color: C.muted }}>
            Afhending, greiðsla og áskrift koma í næsta skrefi.
          </p>
        </aside>
      </div>
    </main>
  );
}

function Choice({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2.5 rounded-full text-sm font-bold transition-colors"
      style={on ? { backgroundColor: C.deep, color: "#fff" } : { backgroundColor: C.cream, color: C.deep, border: `1px solid ${C.tealSoft}` }}
    >
      {label}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1" style={{ color: C.muted }}>
      <span>{label}</span>
      <span style={{ color: C.ink }}>{value}</span>
    </div>
  );
}
