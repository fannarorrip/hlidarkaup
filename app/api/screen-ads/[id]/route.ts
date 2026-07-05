import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { deleteProductPhoto } from "@/lib/product-photos";

// Skjáauglýsing: toggle/reorder + delete. Gated stjornandi/bokari via middleware.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.isActive === "boolean") {
    await query(`update shop.screen_ads set is_active = $1 where id = $2`, [body.isActive, id]);
  }
  if (typeof body.sortOrder === "number") {
    await query(`update shop.screen_ads set sort_order = $1 where id = $2`, [Math.round(body.sortOrder), id]);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await query<{ image_url: string }>(`delete from shop.screen_ads where id = $1 returning image_url`, [id]);
  if (rows.length) await deleteProductPhoto(rows[0].image_url); // best-effort storage cleanup
  return NextResponse.json({ ok: true });
}
