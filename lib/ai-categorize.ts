// AI-VÖRUFLOKKUN: gefur óflokkuðum vörum vefflokk út frá heitinu — sama Claude-uppsetning
// og reikningslesturinn (SKRANING_MODEL, sjálfgefið haiku). Keyrt í lotum (~120 vörur á kall)
// af /api/products/ai-flokkun; aðeins vörur með web_category = null fá gildi (handvirk
// flokkun er aldrei yfirskrifuð).
import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";

export interface CatOption { slug: string; label: string }

export async function getCategoryOptions(): Promise<CatOption[]> {
  const rows = await query<{ slug: string; name: string; parent_slug: string | null }>(
    `select slug, name, parent_slug from shop.web_categories order by parent_slug nulls first, sort`);
  const mains = new Map(rows.filter((r) => !r.parent_slug).map((r) => [r.slug, r.name]));
  return rows.map((r) => ({ slug: r.slug, label: r.parent_slug ? `${mains.get(r.parent_slug)} → ${r.name}` : r.name }));
}

function parseJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text); } catch { /* salvage */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* fellur */ } }
  throw new Error("Svar gervigreindar var ekki gilt JSON");
}

/** Flokkar eina lotu af vörum. Skilar map vörunúmer → slug (aðeins gild slug). */
export async function categorizeBatch(products: { product_number: string; name: string }[], options: CatOption[]): Promise<Record<string, string>> {
  if (!products.length) return {};
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.SKRANING_MODEL || "claude-haiku-4-5-20251001";
  const valid = new Set(options.map((o) => o.slug));

  const msg = await client.messages.create({
    model, max_tokens: 8192,
    system: "Þú flokkar vörur íslenskrar matvöruverslunar í vefflokka. Svaraðu AÐEINS með hráu JSON, engum öðrum texta.",
    messages: [{
      role: "user",
      content: `Vefflokkarnir (slug → heiti):\n${options.map((o) => `${o.slug} = ${o.label}`).join("\n")}\n\nVörurnar (vörunúmer<TAB>heiti):\n${products.map((p) => `${p.product_number}\t${p.name}`).join("\n")}\n\nVeldu BESTA flokkinn fyrir hverja vöru — notaðu undirflokk (slug með "--") þegar hann passar, annars yfirflokkinn. Íslensk vöruheiti eru oft stytt ("UNDANR.MJÓLK" = undanrenna → mjólk). Sérðu alls ekki hvað varan er, slepptu henni. EKKI nota "vinsaelar-vorur" (sá flokkur er handvalinn). Svaraðu með JSON: {"vörunúmer":"slug", ...}`,
    }],
  });
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const raw = parseJson(text);
  const out: Record<string, string> = {};
  const known = new Set(products.map((p) => p.product_number));
  for (const [pn, slug] of Object.entries(raw)) {
    if (known.has(pn) && typeof slug === "string" && valid.has(slug) && slug !== "vinsaelar-vorur") out[pn] = slug;
  }
  return out;
}
