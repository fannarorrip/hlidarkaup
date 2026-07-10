import { NextRequest, NextResponse } from "next/server";
import { getTemplateLines } from "@/lib/heartbeat";

// Template lines for the order editor (name, vnr, unit, default qty, cost, stock).
// Gated via middleware (/api/innkaup).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getTemplateLines(id);
  if (!res) return NextResponse.json({ ok: false, message: "Sniðmát fannst ekki." }, { status: 404 });
  return NextResponse.json({ ok: true, ...res });
}
