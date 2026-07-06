// Reads matvælamerkingar (innihaldslýsing + næringargildistafla) off photos of
// product packaging with Claude vision. Used by the "Lesa af mynd" button on the
// product form (app/api/products/[product]/label). Same infra as invoice-extract.
import Anthropic from "@anthropic-ai/sdk";

export { hasAnthropicKey } from "@/lib/invoice-extract";

export interface Naeringargildi {
  orka_kj: number | null;
  orka_kcal: number | null;
  fita: number | null;
  mettadar_fitusyrur: number | null;
  kolvetni: number | null;
  sykrur: number | null;
  trefjar: number | null;
  protein: number | null;
  salt: number | null;
}

export interface ProductLabelInfo {
  found: boolean;              // false = engin læsileg matvælamerking á myndunum
  innihald: string;            // innihaldslýsing orðrétt, ofnæmisvaldar í HÁSTÖFUM
  ofnaemisvaldar: string[];    // EU-ofnæmisvaldarnir 14, íslensk heiti
  naeringargildi: Naeringargildi;
  netto_magn: string;          // t.d. "500 g", "1 l"
  uppruni: string;             // upprunaland ef sýnilegt
}

export interface LabelPhoto { mime: string; data: string } // data = base64 or data-url

const NUM_OR_NULL = { anyOf: [{ type: "number" }, { type: "null" }] };

// Strict schema → the API guarantees the response parses to exactly this shape.
const LABEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "innihald", "ofnaemisvaldar", "naeringargildi", "netto_magn", "uppruni"],
  properties: {
    found: { type: "boolean" },
    innihald: { type: "string" },
    ofnaemisvaldar: { type: "array", items: { type: "string" } },
    naeringargildi: {
      type: "object",
      additionalProperties: false,
      required: ["orka_kj", "orka_kcal", "fita", "mettadar_fitusyrur", "kolvetni", "sykrur", "trefjar", "protein", "salt"],
      properties: {
        orka_kj: NUM_OR_NULL, orka_kcal: NUM_OR_NULL, fita: NUM_OR_NULL,
        mettadar_fitusyrur: NUM_OR_NULL, kolvetni: NUM_OR_NULL, sykrur: NUM_OR_NULL,
        trefjar: NUM_OR_NULL, protein: NUM_OR_NULL, salt: NUM_OR_NULL,
      },
    },
    netto_magn: { type: "string" },
    uppruni: { type: "string" },
  },
} as const;

const stripDataUrl = (d: string) => String(d).replace(/^data:.*?base64,/, "");

/**
 * Read food-label photos (front + back of the packaging) and return the mandatory
 * EU 1169/2011 information. Label reading needs to get small print and decimal
 * commas right, so this runs on Opus (override with PRODUCT_INFO_MODEL).
 * @throws if ANTHROPIC_API_KEY is missing or no usable photos were supplied.
 */
export async function extractProductLabel(photos: LabelPhoto[], productName?: string): Promise<ProductLabelInfo> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY vantar í stillingar (.env.local).");
  const imgs = (photos ?? []).filter((p) => (p.mime || "").startsWith("image/")).slice(0, 6);
  if (!imgs.length) throw new Error("Vantar mynd af umbúðum");

  const content: Anthropic.ContentBlockParam[] = imgs.map((p) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: (p.mime === "image/jpg" ? "image/jpeg" : p.mime) as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: stripDataUrl(p.data),
    },
  }));

  content.push({
    type: "text",
    text:
      (productName ? `Varan heitir: ${productName}\n\n` : "") +
      "Lestu matvælamerkingarnar af þessum myndum af umbúðum vöru og skilaðu þeim sem JSON.\n" +
      '- "innihald": innihaldslýsingin ORÐRÉTT eins og hún stendur á umbúðunum (íslenski límmiðinn/textinn ef hann er til, annars upprunamálið). Skrifaðu ofnæmisvalda í HÁSTÖFUM eins og reglur krefjast.\n' +
      '- "ofnaemisvaldar": listi yfir þá af 14 ofnæmis-/óþolsvöldum ESB sem koma fyrir, með íslenskum heitum: GLÚTEN (tilgreindu korntegund í sviga, t.d. "GLÚTEN (HVEITI)"), KRABBADÝR, EGG, FISKUR, JARÐHNETUR, SOJA, MJÓLK, HNETUR (tilgreindu tegund), SELLERÍ, SINNEP, SESAMFRÆ, BRENNISTEINSDÍOXÍÐ OG SÚLFÍT, LÚPÍNA, LINDÝR. Tómur listi ef engir.\n' +
      '- "naeringargildi": næringargildistaflan Í 100 g (eða 100 ml) — EKKI í skammt. Orka í kJ og kcal, fita, þar af mettaðar fitusýrur, kolvetni, þar af sykrur, trefjar, prótein, salt — allt í grömmum nema orkan. null fyrir gildi sem sést ekki eða er ólæsilegt.\n' +
      '- ÍSLENSKT/EVRÓPSKT TÖLUSNIÐ: komma (,) er aukastafir — "2,5 g" = 2.5. Giskaðu ALDREI á tölu; ef hún er óskýr, settu null.\n' +
      '- "netto_magn": nettómagn af umbúðunum, t.d. "500 g", "1 l", "6 x 33 cl". Tómt ef ekki sýnilegt.\n' +
      '- "uppruni": upprunaland ef það stendur á umbúðunum, annars tómt.\n' +
      '- "found": false ef myndirnar sýna EKKI læsilega innihaldslýsingu eða næringargildistöflu (þá mega hin svæðin vera tóm/null).',
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.PRODUCT_INFO_MODEL || "claude-opus-4-8";
  const msg = await client.messages.create({
    model,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system: "Þú lest matvælamerkingar (innihaldslýsingu, ofnæmisvalda og næringargildistöflu) af ljósmyndum af umbúðum, nákvæmlega og án ágiskana.",
    output_config: { format: { type: "json_schema", schema: LABEL_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content }],
  });

  if (msg.stop_reason === "refusal") throw new Error("Gervigreindin hafnaði myndinni — prófaðu aðra mynd.");
  const block = msg.content.find((c) => c.type === "text") as { text: string } | undefined;
  const d = JSON.parse(block?.text || "{}");

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const n = d.naeringargildi ?? {};
  return {
    found: d.found !== false,
    innihald: String(d.innihald ?? "").trim(),
    ofnaemisvaldar: (Array.isArray(d.ofnaemisvaldar) ? d.ofnaemisvaldar : []).map((s: unknown) => String(s).trim()).filter(Boolean),
    naeringargildi: {
      orka_kj: num(n.orka_kj), orka_kcal: num(n.orka_kcal), fita: num(n.fita),
      mettadar_fitusyrur: num(n.mettadar_fitusyrur), kolvetni: num(n.kolvetni), sykrur: num(n.sykrur),
      trefjar: num(n.trefjar), protein: num(n.protein), salt: num(n.salt),
    },
    netto_magn: String(d.netto_magn ?? "").trim(),
    uppruni: String(d.uppruni ?? "").trim(),
  };
}
