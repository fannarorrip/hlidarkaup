import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Þolmarkafærslur: merkja yfirfarnar (mánaðaryfirferð endurskoðanda).
// Gated via middleware (/api/afstemming).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as { id?: string; reviewed?: boolean }));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Vantar id." }, { status: 400 });
  const reviewed = body.reviewed !== false;
  await query(
    `update acc.recon_adjustments set reviewed = $2, reviewed_at = case when $2 then now() else null end where id = $1`,
    [id, reviewed]);
  return NextResponse.json({ ok: true });
}
