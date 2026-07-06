import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { extractProductLabel, hasAnthropicKey, type LabelPhoto } from "@/lib/product-info-extract";

// AI label reader: POST multipart photos of the packaging (front + back) → the
// mandatory EU 1169/2011 food information as JSON. Nothing is saved here — the
// form shows the extraction for review and the normal PATCH persists it.
// Gated stjornandi/bokari via middleware (/api/products/:path+).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // Opus vision á margar myndir getur tekið dágóða stund

const MAX_BYTES = 8 * 1024 * 1024;
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  if (!hasAnthropicKey()) return NextResponse.json({ error: "ANTHROPIC_API_KEY vantar í stillingar (.env.local)." }, { status: 501 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "Vantar mynd af umbúðum." }, { status: 400 });
  for (const f of files) {
    if (f.size > MAX_BYTES) return NextResponse.json({ error: "Mynd er of stór (hámark 8MB)." }, { status: 400 });
    if (!OK_TYPES.has(f.type)) return NextResponse.json({ error: "Aðeins JPG/PNG/WebP." }, { status: 400 });
  }

  const rows = await query<{ name: string }>(`select name from shop.products where product_number = $1`, [product]);
  if (!rows.length) return NextResponse.json({ error: "Vara fannst ekki." }, { status: 404 });

  const photos: LabelPhoto[] = await Promise.all(
    files.map(async (f) => ({ mime: f.type, data: Buffer.from(await f.arrayBuffer()).toString("base64") })),
  );

  try {
    const info = await extractProductLabel(photos, rows[0].name);
    if (!info.found) {
      return NextResponse.json({ error: "Engin læsileg innihaldslýsing eða næringargildistafla fannst á myndunum — prófaðu skarpari mynd af bakhlið umbúðanna." }, { status: 422 });
    }
    return NextResponse.json({ ok: true, info });
  } catch (e) {
    console.error("[Label] extraction failed:", e);
    const msg = e instanceof Error ? e.message : "Lestur mistókst";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
