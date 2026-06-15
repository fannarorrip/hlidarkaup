import Link from "next/link";
import { C } from "./theme";
import { WEEK_MEALS } from "./meals";
import { MealCard, MealTile } from "./MealCard";

const serifStyle = { fontFamily: "var(--font-eldhus-serif)" } as const;

export default function EldhusLanding() {
  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <span
            className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-6"
            style={{ backgroundColor: C.tealSoft, color: C.deep }}
          >
            Nýtt frá Hlíðarkaup
          </span>
          <h1 className="text-5xl lg:text-6xl font-bold leading-[1.05] mb-6" style={{ ...serifStyle, color: C.deep }}>
            Ferskt hráefni,<br />
            <span style={{ color: C.red }}>tilbúnar uppskriftir.</span>
          </h1>
          <p className="text-lg leading-relaxed mb-8 max-w-md" style={{ color: C.muted }}>
            Veldu réttina þína fyrir vikuna. Við sendum nákvæmlega rétt hráefni heim að dyrum — þú eldar ljúffenga máltíð á innan við 40 mínútum. Engin matarsóun, engin leiðindi í búðinni.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/eldhus/matsedill" className="font-bold px-7 py-3.5 rounded-full transition-transform active:scale-95 shadow-sm" style={{ backgroundColor: C.red, color: "#fff" }}>
              Sjá matseðil vikunnar
            </Link>
            <Link href="#hvernig" className="font-bold px-7 py-3.5 rounded-full transition-transform active:scale-95" style={{ border: `2px solid ${C.deep}`, color: C.deep }}>
              Hvernig virkar þetta
            </Link>
          </div>
          <div className="flex items-center gap-6 mt-9 text-sm" style={{ color: C.muted }}>
            <span>✓ Sveigjanleg áskrift</span>
            <span>✓ 2 eða 4 manna</span>
            <span>✓ Heimsending eða sókn</span>
          </div>
        </div>

        {/* Hero collage */}
        <div className="grid grid-cols-2 gap-4">
          {WEEK_MEALS.slice(0, 2).map((m, i) => (
            <div key={m.slug} className={i === 0 ? "mt-10" : ""}>
              <MealTile meal={m} />
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="hvernig" className="py-20" style={{ backgroundColor: "#fff" }}>
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-3" style={{ ...serifStyle, color: C.deep }}>
            Svona einfalt er það
          </h2>
          <p className="text-center mb-14 max-w-xl mx-auto" style={{ color: C.muted }}>
            Frá vali til kvöldverðar í þremur skrefum.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: "1", t: "Veldu uppskriftir", d: "Skoðaðu matseðil vikunnar og veldu réttina sem heilla þig." },
              { n: "2", t: "Við sendum hráefnið", d: "Nákvæmlega útmælt, ferskt hráefni með uppskriftakorti — heim eða í sókn." },
              { n: "3", t: "Eldaðu og njóttu", d: "Fylgdu kortinu og berðu fram ljúffenga máltíð á 25–45 mínútum." },
            ].map((s) => (
              <div key={s.n} className="text-center px-4">
                <div
                  className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center text-xl font-bold"
                  style={{ backgroundColor: C.tealSoft, color: C.deep, ...serifStyle }}
                >
                  {s.n}
                </div>
                <h3 className="text-xl font-bold mb-2" style={{ ...serifStyle, color: C.ink }}>{s.t}</h3>
                <p className="text-sm leading-relaxed" style={{ color: C.muted }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── This week's menu ─────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold mb-2" style={{ ...serifStyle, color: C.deep }}>
              Á matseðlinum í þessari viku
            </h2>
            <p style={{ color: C.muted }}>Nýr matseðill á hverjum mánudegi.</p>
          </div>
          <Link href="/eldhus/matsedill" className="hidden sm:block font-semibold hover:opacity-70" style={{ color: C.red }}>
            Sjá allt →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {WEEK_MEALS.slice(0, 6).map((m) => (
            <MealCard key={m.slug} meal={m} />
          ))}
        </div>
      </section>

      {/* ── Box sizes / subscription ─────────────────────────── */}
      <section id="askrift" className="py-20" style={{ backgroundColor: C.tealSoft }}>
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold mb-3" style={{ ...serifStyle, color: C.deep }}>
            Sniðið að þínu heimili
          </h2>
          <p className="mb-12 max-w-xl mx-auto" style={{ color: C.muted }}>
            Veldu fjölda rétta og skammtastærð. Áskrift sem þú stjórnar — slepptu viku eða hættu hvenær sem er.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { t: "3 réttir", d: "fyrir vikuna", note: "Vinsælast" },
              { t: "4 réttir", d: "fyrir vikuna", note: null },
              { t: "5 réttir", d: "fyrir vikuna", note: null },
            ].map((b) => (
              <div key={b.t} className="rounded-3xl bg-white p-8 shadow-sm relative">
                {b.note && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold uppercase tracking-wide px-3 py-1 rounded-full" style={{ backgroundColor: C.red, color: "#fff" }}>
                    {b.note}
                  </span>
                )}
                <p className="text-2xl font-bold mb-1" style={{ ...serifStyle, color: C.deep }}>{b.t}</p>
                <p className="text-sm" style={{ color: C.muted }}>{b.d}</p>
                <p className="mt-4 text-sm" style={{ color: C.ink }}>2 eða 4 manna skammtar</p>
              </div>
            ))}
          </div>
          <Link
            href="/eldhus/matsedill"
            className="inline-block mt-12 font-bold px-8 py-4 rounded-full transition-transform active:scale-95 shadow-sm"
            style={{ backgroundColor: C.red, color: "#fff" }}
          >
            Byrja núna
          </Link>
        </div>
      </section>
    </main>
  );
}

