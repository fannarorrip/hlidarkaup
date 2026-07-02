import { NextRequest, NextResponse } from "next/server";
import { uploadMealPhoto, eldhusAdminEnabled } from "@/lib/eldhus-admin";

// Meal photo upload (multipart) → Supabase storage via service role. Staff-session gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  if (!eldhusAdminEnabled()) return NextResponse.json({ ok: false, message: "Bakvinnsla ekki stillt." });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const name = String(form?.get("name") || "");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: "Vantar mynd." });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, message: "Myndin er of stór (hámark 8MB)." });
  if (!OK_TYPES.has(file.type)) return NextResponse.json({ ok: false, message: "Aðeins JPG/PNG/WebP/GIF." });

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const base = (name || "mynd").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "mynd";
  const path = `${base}-${Date.now()}.${ext}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  const res = await uploadMealPhoto(path, bytes, file.type);
  return NextResponse.json(res);
}
