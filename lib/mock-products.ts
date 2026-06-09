import { Product } from "./types";

// ── Seed data per category ────────────────────────────────────────────────────

const SEED: Record<string, { names: string[]; descs: string[]; priceRange: [number, number] }> = {
  "Mjólkurvörur": {
    names: ["Rjómamjólk", "Léttmjólk", "Undanrenna", "Kefír", "Skyr", "Smjör", "Rjómi", "Sýrður rjómi", "Edam ostur", "Gouda ostur", "Brie ostur", "Camembert", "Fetaostur", "Cottage cheese", "Mysa", "Íslenskur ostur"],
    descs: ["1L", "500ml", "250g", "400g", "1kg", "200g", "Fersk vara", "Íslenskt"],
    priceRange: [199, 1299],
  },
  "Bakkelsi": {
    names: ["Heilhveiti brauð", "Rúgbrauð", "Hvítt brauð", "Súrdeigbrauð", "Baguette", "Ciabatta", "Kringlur", "Snúðar", "Kleinur", "Pönnukökur", "Vöfflur", "Croissant", "Muffins", "Skónaddar", "Laufabrauð", "Flatbrauð"],
    descs: ["Nýbakað", "500g", "Ferskt", "Heimabakað stíll", "Daglegt brauð"],
    priceRange: [299, 899],
  },
  "Ávextir & grænmeti": {
    names: ["Epli", "Banani", "Appelsína", "Mandarína", "Perur", "Vínber", "Jarðarber", "Hindber", "Bláber", "Tómatar", "Paprika", "Gulrætur", "Laukur", "Hvítlaukur", "Brokkólí", "Blómkál", "Spínat", "Salat", "Gúrka", "Kúrbítur", "Hvítkál", "Rauðkál", "Rófur", "Sellerí", "Kartöflur", "Sætar kartöflur", "Spergilkál", "Fennikkál", "Radísur", "Steinselja"],
    descs: ["Á kg", "Stk.", "500g", "250g", "Ferskt", "Íslenskt þar sem hægt er"],
    priceRange: [149, 799],
  },
  "Kjöt": {
    names: ["Kjúklingabringa", "Kjúklingalæri", "Kjúklingur heill", "Nautahakk", "Nautasteik", "Nauta­ribeye", "Lambakjöt", "Lambakóteletta", "Lambahryggur", "Svínakjöt", "Svínafile", "Beikon", "Pylsur", "Hamburgarar", "Kjötbollur", "Skinka"],
    descs: ["Á kg", "500g", "Íslenskt", "Ferskt", "Kælt"],
    priceRange: [599, 3999],
  },
  "Fiskur": {
    names: ["Lax", "Þorskur", "Ýsa", "Steinbítur", "Síld", "Makríll", "Rækjur", "Humar", "Kamkrabbi", "Lúða", "Bleikja", "Karfi", "Sandhverfa", "Skarkoli", "Skötuselur", "Fiskibollur"],
    descs: ["Á kg", "Ferskur", "Fryst", "Íslenskur", "Filet"],
    priceRange: [799, 4999],
  },
  "Þurrvarningur": {
    names: ["Pasta", "Spagettí", "Penne", "Fusilli", "Hrísgrjón", "Basmati", "Jasmine hrísgrjón", "Quinoa", "Hafragrautur", "Corn flakes", "Müsli", "Granola", "Tómatósa", "Kókosmjólk", "Niðursoðnar baunir", "Linsubaunir", "Kjúklingabaunir", "Hveiti", "Sykur", "Saltið", "Pipar", "Olía", "Ólífuolía", "Edik", "Sojasósa", "Þurrger", "Lyftiduft", "Matarlitir", "Vanilludropi", "Kanel"],
    descs: ["500g", "1kg", "400g", "Lífrænt", "Án glútens"],
    priceRange: [149, 999],
  },
  "Drykkir": {
    names: ["Appelsínusafi", "Epla­safi", "Mango­safi", "Ananas­safi", "Tómatsafi", "Vatn", "Gos­vatn", "Kók", "Sprite", "Fanta", "Rauðvín", "Hvítvín", "Bjór", "Kaffi", "Te", "Kakó", "Heitt súkkulaði", "Oat mjólk", "Soja mjólk", "Kókosmjólk drykkur", "Mandel mjólk", "Ísmjólk", "Redbull", "Monster", "Lemonade", "Jurtate"],
    descs: ["1L", "1.5L", "330ml", "500ml", "6 stk.", "Ferskt pressað"],
    priceRange: [149, 1999],
  },
  "Snyrtivörur": {
    names: ["Sjampó", "Hárnæring", "Handvökvi", "Líkamslótion", "Sápa", "Tannkrem", "Tannbursti", "Deodorant", "Ítarleg húðkrem", "Andlitsvökvi", "Sólarvörn", "Húðolía", "Bubblebath", "Rakvélar­blöð", "Rakfroða", "Ettarvatn"],
    descs: ["200ml", "250ml", "100ml", "Fyrir viðkvæma húð", "Náttúruleg innihaldsefni"],
    priceRange: [299, 2499],
  },
  "Hreinlætis­vörur": {
    names: ["Uppþvottaefni", "Þvottaefni", "Mjúkkari", "Skúringaefni", "Gólvþvottaefni", "Glerþurrka", "Strákar", "Handklæðapappír", "Salernís­pappír", "Kökuform", "Ruslapoki", "Svampur", "Uppþvottaborsti", "Eldfastir hanskarnir", "Þvottanet", "Frystipoki"],
    descs: ["1L", "2kg", "500ml", "30 stk.", "Umhverfisvænt"],
    priceRange: [199, 1499],
  },
  "Kælivörur": {
    names: ["Pylsur", "Kælt hakk", "Marinerað kjöt", "Sushi", "Hummus", "Guacamole", "Tzatziki", "Salsa", "Osta­spreað", "Tófu", "Tempeh", "Seitan", "Grillfat", "Forsteiktar ræmur", "Lax­filetar kæld", "Rækjusalat"],
    descs: ["Tilbúið til eldunar", "Kælt", "200g", "400g", "Beint í pönnu"],
    priceRange: [349, 2499],
  },
  "Frystivörur": {
    names: ["Fryst grænmeti", "Fryst blandað grænmeti", "Frystur lax", "Frystur þorskur", "Fiskipinnar", "Frosin pizza", "Frosnar fiskibollur", "Fryst kjúklingur", "Fryst pylsur", "Fryst kartöflur", "French fries", "Fryst blómkál", "Fryst brokkólí", "Fryst jarðarber", "Ís­rjómi", "Fryst pasta­réttur"],
    descs: ["1kg", "500g", "Fryst", "Beint í ofn", "Án viðbættra efna"],
    priceRange: [299, 1999],
  },
  "Nesti & snarl": {
    names: ["Skyr á dós", "Ávaxtaþvari", "Granola bar", "Muesli bar", "Nötukrem", "Möndlur", "Kasjúhnetur", "Valnetur", "Pistasíur", "Þurrkaðir ávextir", "Popcorn", "Kartöfluflögur", "Pretzels", "Rískakor", "Kex", "Súkkulaðikex"],
    descs: ["Hento í nestið", "100g", "200g", "Án sykurs", "Lífrænt"],
    priceRange: [199, 899],
  },
  "Sætur hlutir": {
    names: ["Súkkulaði", "Mjólkursúkkulaði", "Dökkt súkkulaði", "Hvítt súkkulaði", "Nammi", "Gúmmíbjörn", "Lakriss", "Karamellur", "Marsipan", "Kex", "Kaka", "Brownies", "Muffins", "Smákökur", "Marensbotnar", "Skyr­kaka"],
    descs: ["100g", "200g", "Til gjafar", "Íslenskt", "Nýtt"],
    priceRange: [199, 1499],
  },
};

// ── Generator ─────────────────────────────────────────────────────────────────

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function seededRand(seed: number, min: number, max: number) {
  const x = Math.sin(seed) * 10000;
  return min + Math.floor((x - Math.floor(x)) * (max - min + 1));
}

function generateProducts(): Product[] {
  const products: Product[] = [];
  let id = 1;

  const categories = Object.keys(SEED);
  const targetTotal = 3000;
  const perCategory = Math.ceil(targetTotal / categories.length);

  for (const category of categories) {
    const { names, descs, priceRange } = SEED[category];

    for (let i = 0; i < perCategory && products.length < targetTotal; i++) {
      const baseName = names[i % names.length];
      const desc = descs[i % descs.length];
      const seed = id * 7 + i * 13;

      // Create variety: add size/brand/variant suffix every few items
      const variants = ["", " Premium", " Lífrænt", " Án glútens", " Létt", " Extra", " Original", " Classic", " Íslenskt", " Nýtt", " Sérvalið"];
      const variant = i < names.length ? "" : variants[i % variants.length];
      const name = `${baseName}${variant}`;

      const price = seededRand(seed, priceRange[0], priceRange[1]);
      // Round to nearest 49 or 99 for realistic pricing
      const roundedPrice = Math.round(price / 50) * 50 - 1;

      const stockSeed = seededRand(seed + 1, 0, 100);
      const stock =
        stockSeed < 5 ? 0 :
        stockSeed < 15 ? seededRand(seed + 2, 1, 3) :
        stockSeed < 30 ? seededRand(seed + 3, 4, 8) :
        seededRand(seed + 4, 9, 40);

      products.push({
        id: String(id),
        name,
        description: `${desc} — ${category.toLowerCase()}`,
        price: Math.max(99, roundedPrice),
        category,
        stock,
      });

      id++;
    }
  }

  return products;
}

export const mockProducts: Product[] = generateProducts();

// IDs of popular products (shown in the "Vinsælar vörur" section)
export const POPULAR_IDS = ["5", "14", "24", "1", "6", "17"];
