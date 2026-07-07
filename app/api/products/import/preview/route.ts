import { NextRequest, NextResponse } from "next/server";
import { hasAnthropicKey, parseSupplierFile, mapColumns, normalizeRows, matchProducts, NUTRI_FIELDS } from "@/lib/supplier-import";

// Read a supplier's Excel/CSV, AI-map its columns, normalise, and match rows to our
// products — returns a preview WITHOUT writing anything. Gated stjornandi/bokari
// via middleware (/api/products/:path+).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 8000;
const OK = /\.(xlsx?|csv)$/i;

export async function POST(req: NextRequest) {
  if (!hasAnthropicKey()) return NextResponse.json({ error: "ANTHROPIC_API_KEY vantar í stillingar (.env.local)." }, { status: 501 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Vantar skrá (Excel eða CSV)." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Skráin er of stór (hámark 20MB)." }, { status: 400 });
  if (!OK.test(file.name)) return NextResponse.json({ error: "Aðeins .xlsx, .xls eða .csv." }, { status: 400 });

  let sheet;
  try {
    sheet = parseSupplierFile(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    console.error("[Import] parse failed:", e);
    return NextResponse.json({ error: "Gat ekki lesið skrána." }, { status: 400 });
  }
  if (!sheet.rows.length) return NextResponse.json({ error: "Engin gögn fundust í skránni." }, { status: 400 });

  const warnings: string[] = [];
  let rows = sheet.rows;
  if (rows.length > MAX_ROWS) { warnings.push(`Skráin er með ${rows.length} línur — vinn fyrstu ${MAX_ROWS}.`); rows = rows.slice(0, MAX_ROWS); }

  try {
    const { mapping, nutritionBasis } = await mapColumns(sheet.headers, rows);
    const nutritionMapped = NUTRI_FIELDS.some((f) => mapping[f]);
    if (!mapping.ean && !mapping.name) warnings.push("Hvorki strikamerki né vöruheiti fannst í skránni — ekki hægt að para við vörur.");
    if (nutritionBasis === "per_serving" && nutritionMapped) warnings.push("Næringargildi virðast gefin per skammt (ekki per 100 g) — sleppt. Bættu við handvirkt ef þarf.");
    else if (nutritionBasis === "unknown" && nutritionMapped)
      warnings.push("Óviss um grunneiningu næringargildis — yfirfarðu að tölurnar séu per 100 g.");

    const norm = normalizeRows(rows, mapping, nutritionBasis);
    const { matched, unmatched } = await matchProducts(norm);

    return NextResponse.json({
      ok: true,
      filename: file.name,
      headers: sheet.headers,
      mapping,
      nutritionBasis,
      warnings,
      counts: { total: rows.length, matched: matched.length, unmatched: unmatched.length },
      matched,
      unmatched: unmatched.slice(0, 300),
      unmatchedTruncated: unmatched.length > 300,
    });
  } catch (e) {
    console.error("[Import] preview failed:", e);
    const msg = e instanceof Error ? e.message : "Úrvinnsla mistókst";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
