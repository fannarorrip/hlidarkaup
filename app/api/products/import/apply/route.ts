import { NextRequest, NextResponse } from "next/server";
import { applyImport, NUTRI_FIELDS, type ApplyRow } from "@/lib/supplier-import";

// Write the reviewed rows onto shop.products (info fields only). Gated
// stjornandi/bokari via middleware (/api/products/:path+).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawRows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rawRows) return NextResponse.json({ error: "Vantar línur." }, { status: 400 });
  if (rawRows.length > 8000) return NextResponse.json({ error: "Of margar línur í einu (hámark 8000)." }, { status: 400 });

  // Re-coerce every field server-side — never trust the client shape.
  const rows: ApplyRow[] = [];
  for (const r of rawRows as Record<string, unknown>[]) {
    const pn = String(r?.product_number ?? "").trim();
    if (!pn) continue;
    let naeringargildi: Record<string, number | null> | null = null;
    const ng = r?.naeringargildi;
    if (ng && typeof ng === "object") {
      const clean: Record<string, number | null> = {};
      for (const f of NUTRI_FIELDS) {
        const v = (ng as Record<string, unknown>)[f];
        clean[f] = typeof v === "number" && Number.isFinite(v) ? v : null;
      }
      if (Object.values(clean).some((v) => v != null)) naeringargildi = clean;
    }
    rows.push({
      product_number: pn,
      innihald: r?.innihald != null ? String(r.innihald) : "",
      ofnaemisvaldar: r?.ofnaemisvaldar != null ? String(r.ofnaemisvaldar) : "",
      netto_magn: r?.netto_magn != null ? String(r.netto_magn) : "",
      uppruni: r?.uppruni != null ? String(r.uppruni) : "",
      naeringargildi,
    });
  }
  if (!rows.length) return NextResponse.json({ error: "Engar gildar línur." }, { status: 400 });

  try {
    const { updated, missing } = await applyImport(rows, "supplier");
    return NextResponse.json({ ok: true, updated, missing: missing.length });
  } catch (e) {
    console.error("[Import] apply failed:", e);
    return NextResponse.json({ error: "Vistun mistókst." }, { status: 500 });
  }
}
