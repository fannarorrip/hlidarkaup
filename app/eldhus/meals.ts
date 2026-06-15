// Sample weekly menu (placeholder content — swap for the real menu later).
export interface Meal {
  slug: string;
  title: string;
  tag: string;        // Fiskur / Kjúklingur / Grænmeti ...
  minutes: number;    // cook time
  kcal: number;       // per serving
  blurb: string;
  // duotone placeholder colors (until real photos are in)
  from: string;
  to: string;
}

export const WEEK_MEALS: Meal[] = [
  {
    slug: "ofnbakadur-lax-dillsosa",
    title: "Ofnbakaður lax með dillsósu",
    tag: "Fiskur",
    minutes: 30,
    kcal: 620,
    blurb: "Roðlaus lax með sítrónu-dillsósu, nýjum kartöflum og steiktu grænmeti.",
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
    from: "#D98A8A",
    to: "#B81414",
  },
  {
    slug: "thorskur-kartoflumus",
    title: "Pönnusteiktur þorskur með kartöflumús",
    tag: "Fiskur",
    minutes: 30,
    kcal: 540,
    blurb: "Þorskhnakki með smjörsteiktu blaðlauki og sítrónu.",
    from: "#A9CBD6",
    to: "#2C687B",
  },
];
