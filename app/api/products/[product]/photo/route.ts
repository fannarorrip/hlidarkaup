import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { uploadProductPhoto, deleteProductPhoto, productPhotosEnabled } from "@/lib/product-photos";

// Product photo for the till/self-checkout tiles. POST multipart → Supabase storage → image_url.
// DELETE clears it. Gated stjornandi/bokari via middleware (/api/products/:path+).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024;
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  if (!productPhotosEnabled()) return NextResponse.json({ error: "Myndageymsla ekki stillt (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 501 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Vantar mynd." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Myndin er of stór (hámark 6MB)." }, { status: 400 });
  if (!OK_TYPES.has(file.type)) return NextResponse.json({ error: "Aðeins JPG/PNG/WebP." }, { status: 400 });

  const exists = await query<{ image_url: string | null }>(`select image_url from shop.products where product_number = $1`, [product]);
  if (!exists.length) return NextResponse.json({ error: "Vara fannst ekki." }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const res = await uploadProductPhoto(product, bytes, file.type);
  if (!res.ok || !res.url) return NextResponse.json({ error: res.message || "Upphleðsla mistókst." }, { status: 502 });

  await query(`update shop.products set image_url = $1 where product_number = $2`, [res.url, product]);
  if (exists[0].image_url) await deleteProductPhoto(exists[0].image_url); // replace → clean the old file
  return NextResponse.json({ ok: true, image_url: res.url });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const rows = await query<{ image_url: string | null }>(`select image_url from shop.products where product_number = $1`, [product]);
  if (!rows.length) return NextResponse.json({ error: "Vara fannst ekki." }, { status: 404 });
  await query(`update shop.products set image_url = null where product_number = $1`, [product]);
  if (rows[0].image_url) await deleteProductPhoto(rows[0].image_url);
  return NextResponse.json({ ok: true });
}
