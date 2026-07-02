import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Discard a held sale (called after it's recalled into the till, or to delete it).
export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Ógilt auðkenni" }, { status: 400 });
  await query(`delete from shop.held_sales where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
