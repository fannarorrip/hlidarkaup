// Supplier product-data import: takes whatever Excel/CSV a birgir emails back and
// loads innihald / ofnæmisvaldar / næringargildi / nettómagn / uppruni onto our
// products. Claude maps the supplier's arbitrary column layout onto our fields
// (one call per file, headers + samples only); everything else is deterministic:
// normalise cells, match rows to products by strikamerki (barcode) — falling back
// to an exact name match — then update only the info fields (never price/stock).
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { db, query } from "@/lib/db";

export { hasAnthropicKey } from "@/lib/invoice-extract";

// Nutrition table columns, in reglugerð order, stored per 100 g/ml.
export const NUTRI_FIELDS = [
  "orka_kj", "orka_kcal", "fita", "mettadar_fitusyrur",
  "kolvetni", "sykrur", "trefjar", "protein", "salt",
] as const;
// Non-nutrition fields we try to pull from the supplier sheet.
const TEXT_FIELDS = ["ean", "supplier_item_no", "name", "innihald", "ofnaemisvaldar", "netto_magn", "uppruni"] as const;

export type NutritionBasis = "per_100g" | "per_serving" | "unknown";
export type ColumnMap = Record<(typeof TEXT_FIELDS)[number] | (typeof NUTRI_FIELDS)[number], string | null>;

// ── 1. Parse the uploaded workbook/CSV into headers + string rows ──────────────
export interface ParsedSheet { sheetName: string; headers: string[]; rows: Record<string, string>[] }

export function parseSupplierFile(buf: Buffer): ParsedSheet {
  const wb = XLSX.read(buf, { type: "buffer", raw: false }); // SheetJS auto-detects xlsx/xls/csv
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { sheetName: "", headers: [], rows: [] };
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
  if (!aoa.length) return { sheetName, headers: [], rows: [] };

  // The header is the first row within the first 10 with ≥2 non-empty cells
  // (skips title/blank rows that some exports put on top).
  let hi = 0;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    if ((aoa[i] ?? []).filter((c) => String(c).trim() !== "").length >= 2) { hi = i; break; }
  }
  const rawHeaders = (aoa[hi] ?? []).map((c, i) => String(c).trim() || `dálkur ${i + 1}`);
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const n = (seen.get(h) ?? 0) + 1; seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });

  const rows = aoa.slice(hi + 1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = String((r as unknown[])[i] ?? "").trim(); });
    return o;
  }).filter((o) => Object.values(o).some((v) => v !== ""));

  return { sheetName, headers, rows };
}

// ── 2. Claude maps the supplier's columns onto our fields ─────────────────────
const strOrNull = { anyOf: [{ type: "string" }, { type: "null" }] };
const MAP_SCHEMA = {
  type: "object", additionalProperties: false,
  required: [...TEXT_FIELDS, ...NUTRI_FIELDS, "nutrition_basis"],
  properties: {
    ...Object.fromEntries([...TEXT_FIELDS, ...NUTRI_FIELDS].map((f) => [f, strOrNull])),
    nutrition_basis: { type: "string", enum: ["per_100g", "per_serving", "unknown"] },
  },
} as const;

export async function mapColumns(headers: string[], sampleRows: Record<string, string>[]): Promise<{ mapping: ColumnMap; nutritionBasis: NutritionBasis }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY vantar í stillingar (.env.local).");
  const tab = [headers.join("\t"), ...sampleRows.slice(0, 8).map((r) => headers.map((h) => r[h] ?? "").join("\t"))].join("\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.SUPPLIER_IMPORT_MODEL || "claude-opus-4-8";
  const msg = await client.messages.create({
    model, max_tokens: 6000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: MAP_SCHEMA as unknown as Record<string, unknown> } },
    system:
      "Þú kortleggur dálka í vörulista frá matvælabirgi yfir á staðlaða reiti. Dálkaheiti geta verið á íslensku eða ensku. " +
      "Fyrir hvern reit skaltu skila NÁKVÆMLEGA dálkheitinu (afritað orðrétt úr fyrstu línu) sem passar, eða null ef enginn passar. Ekki finna upp dálkheiti.",
    messages: [{
      role: "user",
      content:
        "Hér er vörulisti (fyrsta lína = dálkheiti, svo sýnishorn af línum, tab-aðskilið):\n\n" + tab + "\n\n" +
        "Kortleggðu á þessa reiti (skilaðu dálkheitinu eða null):\n" +
        "- ean: strikamerki vörunnar (EAN/GTIN/strikamerki/barcode) — LYKILL til að para við okkar vörur.\n" +
        "- supplier_item_no: vörunúmer birgjans sjálfs.\n" +
        "- name: vöruheiti.\n" +
        "- innihald: innihaldslýsing (ingredients).\n" +
        "- ofnaemisvaldar: ofnæmis-/óþolsvaldar ef í sérdálki (allergens).\n" +
        "- netto_magn: nettómagn / pakkastærð (net weight/quantity).\n" +
        "- uppruni: upprunaland (country of origin).\n" +
        "- orka_kj, orka_kcal, fita, mettadar_fitusyrur, kolvetni, sykrur, trefjar, protein, salt: næringargildi. " +
        "Kortleggðu EINGÖNGU næringardálka sem eru gefnir upp í 100 g / 100 ml. " +
        "Settu nutrition_basis = 'per_100g' ef taflan er per 100 g/ml, 'per_serving' ef hún er per skammt, annars 'unknown'.",
    }],
  });
  if (msg.stop_reason === "refusal") throw new Error("Gervigreindin hafnaði skránni.");
  const block = msg.content.find((c) => c.type === "text") as { text: string } | undefined;
  const d = JSON.parse(block?.text || "{}") as Record<string, unknown>;

  // Only accept a mapped value that is a real header — guards against hallucinated columns.
  const hset = new Set(headers);
  const mapping = {} as ColumnMap;
  for (const f of [...TEXT_FIELDS, ...NUTRI_FIELDS]) {
    const v = d[f];
    mapping[f] = typeof v === "string" && hset.has(v) ? v : null;
  }
  const basis = d.nutrition_basis;
  const nutritionBasis: NutritionBasis = basis === "per_100g" || basis === "per_serving" ? basis : "unknown";
  return { mapping, nutritionBasis };
}

// ── 3. Deterministic normalisation ────────────────────────────────────────────
/** Parse an Icelandic/European or plain number: comma = decimal, grouped dots = thousands. */
export function parseNum(raw: string): number | null {
  let s = String(raw ?? "").replace(/[^\d.,-]/g, ""); // strip units ("g", "kJ", spaces)
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");      // 1.234,56 → 1234.56 ; 2,5 → 2.5
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");    // 1.966 → 1966 (grouped thousands)
  const n = Number(s);                                                   // else dot stays decimal (2.5)
  return Number.isFinite(n) ? n : null;
}

export interface NormRow {
  ean: string; supplierItemNo: string; supplierName: string;
  innihald: string; ofnaemisvaldar: string; netto_magn: string; uppruni: string;
  naeringargildi: Record<string, number | null> | null;
  hasData: boolean;
}

export function normalizeRows(rows: Record<string, string>[], mapping: ColumnMap, nutritionBasis: NutritionBasis): NormRow[] {
  const pick = (row: Record<string, string>, field: keyof ColumnMap) => {
    const col = mapping[field];
    return col ? String(row[col] ?? "").trim().replace(/\s+/g, " ") : "";
  };
  return rows.map((row) => {
    const innihald = pick(row, "innihald");
    const ofnaemisvaldar = pick(row, "ofnaemisvaldar");
    const netto_magn = pick(row, "netto_magn");
    const uppruni = pick(row, "uppruni");

    let naeringargildi: Record<string, number | null> | null = null;
    if (nutritionBasis !== "per_serving") { // never import per-serving values without the serving size
      const ng: Record<string, number | null> = {}; let any = false;
      for (const f of NUTRI_FIELDS) { const v = parseNum(pick(row, f)); ng[f] = v; if (v != null) any = true; }
      if (any) naeringargildi = ng;
    }
    return {
      ean: pick(row, "ean").replace(/\D/g, ""),
      supplierItemNo: pick(row, "supplier_item_no"),
      supplierName: pick(row, "name"),
      innihald, ofnaemisvaldar, netto_magn, uppruni, naeringargildi,
      hasData: !!(innihald || ofnaemisvaldar || netto_magn || uppruni || naeringargildi),
    };
  });
}

// ── 4. Match rows to our products (batched: 2 queries total) ──────────────────
function barcodeVariants(ean: string): string[] {
  if (!ean) return [];
  const v = new Set<string>([ean]);
  if (/^\d{12}$/.test(ean)) v.add("0" + ean);      // UPC-A ↔ EAN-13 (leading zero)
  if (/^0\d{12}$/.test(ean)) v.add(ean.slice(1));
  return [...v];
}

export interface MatchedRow extends NormRow { product_number: string; matchedName: string; matchType: "barcode" | "name" }
export interface UnmatchedRow { supplierName: string; ean: string; reason: "no_match" | "no_data" }
export interface MatchResult { matched: MatchedRow[]; unmatched: UnmatchedRow[] }

export async function matchProducts(rows: NormRow[]): Promise<MatchResult> {
  // (a) barcode map for every variant present in the file
  const variants = new Set<string>();
  rows.forEach((r) => barcodeVariants(r.ean).forEach((v) => variants.add(v)));
  const bcMap = new Map<string, { product_number: string; name: string }>();
  if (variants.size) {
    const bc = await query<{ barcode: string; product_number: string; name: string }>(
      `select b.barcode, b.product_number, p.name
         from shop.product_barcodes b join shop.products p on p.product_number = b.product_number
        where p.is_active and b.barcode = any($1::text[])`, [[...variants]]);
    bc.forEach((r) => bcMap.set(r.barcode, { product_number: r.product_number, name: r.name }));
  }

  // (b) exact (accent-insensitive) name map — only used when no barcode match, and only
  //     when the name resolves to a SINGLE product (ambiguous names are left unmatched).
  const needName = [...new Set(rows.filter((r) => r.supplierName && !barcodeVariants(r.ean).some((v) => bcMap.has(v))).map((r) => r.supplierName))];
  const nameMap = new Map<string, { product_number: string; name: string } | "ambiguous">();
  if (needName.length) {
    const nm = await query<{ nm: string; product_number: string; name: string }>(
      `select t.nm, p.product_number, p.name
         from unnest($1::text[]) as t(nm)
         join shop.products p on p.is_active and lower(unaccent(p.name)) = lower(unaccent(t.nm))`, [needName]);
    for (const r of nm) {
      const cur = nameMap.get(r.nm);
      if (!cur) nameMap.set(r.nm, { product_number: r.product_number, name: r.name });
      else if (cur !== "ambiguous" && cur.product_number !== r.product_number) nameMap.set(r.nm, "ambiguous");
    }
  }

  const matched: MatchedRow[] = [];
  const unmatched: UnmatchedRow[] = [];
  for (const r of rows) {
    const hit = barcodeVariants(r.ean).map((v) => bcMap.get(v)).find(Boolean);
    const nameHit = !hit && r.supplierName ? nameMap.get(r.supplierName) : undefined;
    const prod = hit ?? (nameHit && nameHit !== "ambiguous" ? nameHit : undefined);
    if (!prod) { unmatched.push({ supplierName: r.supplierName || "(nafnlaus lína)", ean: r.ean, reason: "no_match" }); continue; }
    if (!r.hasData) { unmatched.push({ supplierName: r.supplierName || prod.name, ean: r.ean, reason: "no_data" }); continue; }
    matched.push({ ...r, product_number: prod.product_number, matchedName: prod.name, matchType: hit ? "barcode" : "name" });
  }
  // Collapse multiple file rows that resolve to the same product (first wins) — avoids a
  // duplicate React key in the preview and a redundant double-write on apply.
  const seenPn = new Set<string>();
  const deduped = matched.filter((m) => (seenPn.has(m.product_number) ? false : (seenPn.add(m.product_number), true)));
  return { matched: deduped, unmatched };
}

// ── 5. Apply — write ONLY the info fields, never blanking existing data ────────
export interface ApplyRow {
  product_number: string;
  innihald?: string; ofnaemisvaldar?: string; netto_magn?: string; uppruni?: string;
  naeringargildi?: Record<string, number | null> | null;
}

export async function applyImport(rows: ApplyRow[], source = "supplier"): Promise<{ updated: number; missing: string[] }> {
  const client = await db.connect();
  const missing: string[] = []; let updated = 0;
  try {
    await client.query("begin");
    for (const r of rows) {
      const pn = String(r.product_number || "").trim();
      if (!pn) continue;
      const ng = r.naeringargildi && Object.values(r.naeringargildi).some((v) => v != null) ? JSON.stringify(r.naeringargildi) : null;
      const res = await client.query(
        `update shop.products set
           innihald        = coalesce(nullif($2,''), innihald),
           ofnaemisvaldar  = coalesce(nullif($3,''), ofnaemisvaldar),
           netto_magn      = coalesce(nullif($4,''), netto_magn),
           uppruni         = coalesce(nullif($5,''), uppruni),
           naeringargildi  = case when $6::jsonb is not null then $6::jsonb else naeringargildi end,
           info_source     = $7,
           info_updated_at = now()
         where product_number = $1`,
        [pn, r.innihald || "", r.ofnaemisvaldar || "", r.netto_magn || "", r.uppruni || "", ng, source]);
      if (res.rowCount) updated++; else missing.push(pn);
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
  return { updated, missing };
}
