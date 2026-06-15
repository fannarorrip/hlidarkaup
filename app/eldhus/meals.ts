// Weekly menu data.
//
// PLACEHOLDER source: a static array for now. The page/detail read through the
// getWeekMeals()/getMeal() helpers below, so when the real backend (e.g.
// Supabase) lands, only those two functions change — the pages stay the same.
// This interface also doubles as the menu schema for that backend.
import { supabase } from "@/lib/supabase/client";

export interface Meal {
  slug: string;
  title: string;
  tag: string;          // category: Fiskur / Kjúklingur / Grænmeti / Nautakjöt ...
  minutes: number;      // cook time
  kcal: number;         // per serving
  blurb: string;        // short card description
  description: string;  // longer detail description
  ingredients: string[];
  allergens: string[];  // Fiskur, Mjólk, Glúten, Egg ...
  image?: string;       // real photo (Supabase); falls back to the gradient
  // duotone placeholder colors (until a real photo is set)
  from: string;
  to: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToMeal(r: any): Meal {
  return {
    slug: r.slug,
    title: r.title,
    tag: r.tag ?? "",
    minutes: r.minutes ?? 0,
    kcal: r.kcal ?? 0,
    blurb: r.blurb ?? "",
    description: r.description ?? "",
    ingredients: r.ingredients ?? [],
    allergens: r.allergens ?? [],
    image: r.image_url ?? undefined,
    from: r.from_color ?? "#8CC7C4",
    to: r.to_color ?? "#2C687B",
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const WEEK_MEALS: Meal[] = [
  {
    slug: "ofnbakadur-lax-dillsosa",
    title: "Ofnbakaður lax með dillsósu",
    tag: "Fiskur",
    minutes: 30,
    kcal: 620,
    blurb: "Roðlaus lax með sítrónu-dillsósu, nýjum kartöflum og steiktu grænmeti.",
    description:
      "Safaríkur ofnbakaður lax með ferskri sítrónu- og dillsósu, borinn fram með smjörsteiktum nýjum kartöflum og litríku árstíðagrænmeti. Einföld en glæsileg máltíð sem er tilbúin á hálftíma.",
    ingredients: ["Laxaflök", "Nýjar kartöflur", "Ferskt dill", "Sítróna", "Sýrður rjómi", "Brokkólí", "Gulrætur", "Smjör"],
    allergens: ["Fiskur", "Mjólk"],
    from: "#8CC7C4",
    to: "#2C687B",
  },
  {
    slug: "kjuklingakarry-jasmin",
    title: "Mild kjúklingakarrý með jasmínhrísgrjónum",
    tag: "Kjúklingur",
    minutes: 35,
    kcal: 710,
    blurb: "Rjómakennt kókoskarrý með ferskum kóríander og lime.",
    description:
      "Mjúkt og bragðmikið kókoskarrý með mýrum kjúklingabitum, paprika og lauk, borið fram með ilmandi jasmínhrísgrjónum, fersku kóríander og lime. Mild og barnvæn en samt full af bragði.",
    ingredients: ["Kjúklingabringur", "Kókosmjólk", "Karrýmauk", "Jasmínhrísgrjón", "Paprika", "Laukur", "Kóríander", "Lime"],
    allergens: [],
    from: "#E7A977",
    to: "#B81414",
  },
  {
    slug: "graenmetislasagne",
    title: "Grænmetislasagne með ricotta",
    tag: "Grænmeti",
    minutes: 45,
    kcal: 560,
    blurb: "Lög af kúrbít, sveppum og tómatsósu með ostagratíni.",
    description:
      "Ríkulegt grænmetislasagne með lögum af kúrbít, sveppum og heimagerðri tómatsósu, kórónað með ricotta og bráðnum osti. Hjartastyrkjandi og saðsamt — uppáhald hjá öllum.",
    ingredients: ["Lasagneplötur", "Kúrbítur", "Sveppir", "Maukaðir tómatar", "Ricotta", "Rifinn ostur", "Hvítlaukur", "Basilíka"],
    allergens: ["Glúten", "Mjólk"],
    from: "#9FD0AC",
    to: "#2C687B",
  },
  {
    slug: "halloumi-bowl-kuskus",
    title: "Halloumi-bowl með kúskús",
    tag: "Grænmeti",
    minutes: 25,
    kcal: 590,
    blurb: "Grillaður halloumi, sítrónukúskús, granatepli og myntu-jógúrt.",
    description:
      "Litríkur og ferskur skál með grilluðum halloumi, sítrónukúskús, stökku grænmeti, granateplum og kælandi myntu-jógúrt. Tilbúinn á 25 mínútum og fullkominn í annríki.",
    ingredients: ["Halloumi", "Kúskús", "Granatepli", "Gúrka", "Kirsuberjatómatar", "Jógúrt", "Mynta", "Sítróna"],
    allergens: ["Mjólk", "Glúten"],
    from: "#8CC7C4",
    to: "#5C8A6A",
  },
  {
    slug: "nautabollur-bolognese",
    title: "Nautabollur í bolognese",
    tag: "Nautakjöt",
    minutes: 40,
    kcal: 740,
    blurb: "Heimagerðar nautabollur í ríkulegri tómatsósu með spaghettí.",
    description:
      "Mjúkar heimagerðar nautabollur hægeldaðar í ríkulegri tómat- og kryddjurtasósu, bornar fram með spaghettí og rifnum parmesan. Sannkölluð huggunarmáltíð.",
    ingredients: ["Nautahakk", "Spaghettí", "Maukaðir tómatar", "Laukur", "Hvítlaukur", "Parmesan", "Brauðrasp", "Egg"],
    allergens: ["Glúten", "Mjólk", "Egg"],
    from: "#D98A8A",
    to: "#B81414",
  },
  {
    slug: "thorskur-kartoflumus",
    title: "Pönnusteiktur þorskur með kartöflumús",
    tag: "Fiskur",
    minutes: 30,
    kcal: 540,
    blurb: "Þorskhnakki með smjörsteiktum blaðlauki og sítrónu.",
    description:
      "Stökk-steiktur þorskhnakki með rjómakenndri kartöflumús, smjörsteiktum blaðlauki og léttri sítrónusmjörsósu. Klassísk íslensk máltíð í nútímabúningi.",
    ingredients: ["Þorskhnakki", "Kartöflur", "Blaðlaukur", "Smjör", "Mjólk", "Sítróna", "Steinselja", "Hvítlaukur"],
    allergens: ["Fiskur", "Mjólk"],
    from: "#A9CBD6",
    to: "#2C687B",
  },
];

/** Published menu — from Supabase when configured, else the sample data. */
export async function getWeekMeals(): Promise<Meal[]> {
  if (!supabase) return WEEK_MEALS;
  const { data, error } = await supabase
    .from("meals")
    .select("*")
    .eq("published", true)
    .order("position", { ascending: true });
  if (error || !data || data.length === 0) return WEEK_MEALS;
  return data.map(rowToMeal);
}

/** Single meal by slug. */
export async function getMeal(slug: string): Promise<Meal | undefined> {
  if (!supabase) return WEEK_MEALS.find((m) => m.slug === slug);
  const { data, error } = await supabase.from("meals").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) return WEEK_MEALS.find((m) => m.slug === slug);
  return rowToMeal(data);
}
