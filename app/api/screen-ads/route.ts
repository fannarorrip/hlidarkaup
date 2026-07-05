import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { uploadProductPhoto, productPhotosEnabled } from "@/lib/product-photos";

// Skjáauglýsingar admin: list + upload. Gated stjornandi/bokari via middleware.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET() {
  const ads = await query<{ id: number; image_url: string; sort_order: number; is_active: boolean }>(
    `select id, image_url, sort_order, is_active from shop.screen_ads order by sort_order, id`,
  );
  return NextResponse.json({ ads });
}

export async function POST(req: NextRequest) {
  if (!productPhotosEnabled()) {
    return NextResponse.json({ error: "Myndageymsla ekki stillt (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 501 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Vantar mynd." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Myndin er of stór (hámark 8MB)." }, { status: 400 });
  if (!OK_TYPES.has(file.type)) return NextResponse.json({ error: "Aðeins JPG/PNG/WebP." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const res = await uploadProductPhoto("skjar", bytes, file.type); // lands as skjar-<timestamp>.<ext>
  if (!res.ok || !res.url) return NextResponse.json({ error: res.message || "Upphleðsla mistókst." }, { status: 502 });

  const [row] = await query<{ id: number }>(
    `insert into shop.screen_ads (image_url, sort_order)
     values ($1, coalesce((select max(sort_order) + 1 from shop.screen_ads), 0))
     returning id`,
    [res.url],
  );
  return NextResponse.json({ ok: true, id: row.id, image_url: res.url });
}
