import { NextRequest, NextResponse } from "next/server";
import { createPoFromTemplate } from "@/lib/heartbeat";

// Create a draft purchase order from an order template (one-click pöntun).
// Gated via middleware (/api/innkaup).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await createPoFromTemplate(id);
  if ("error" in res) return NextResponse.json({ ok: false, message: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, po: res });
}
