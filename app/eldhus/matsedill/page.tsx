import { C } from "../theme";
import { getWeekMeals } from "../meals";
import MenuBrowser from "./MenuBrowser";

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

export default async function MatsedillPage() {
  const meals = await getWeekMeals();

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

      <MenuBrowser meals={meals} />
    </main>
  );
}
