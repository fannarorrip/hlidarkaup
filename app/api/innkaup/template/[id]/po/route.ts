import { NextRequest, NextResponse } from "next/server";
import { createPoFromTemplate } from "@/lib/heartbeat";

// Create a draft purchase order from an order template.
// Body (optional): { quantities: { [line_no]: qty } } from the order editor —
// only lines with qty > 0 are ordered. Without a body: default quantities.
// Gated via middleware (/api/innkaup).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as { quantities?: Record<string, number> }));
  const quantities = body?.quantities && typeof body.quantities === "object"
    ? Object.fromEntries(Object.entries(body.quantities).map(([k, v]) => [Number(k), Number(v)]))
    : undefined;
  const res = await createPoFromTemplate(id, quantities);
  if ("error" in res) return NextResponse.json({ ok: false, message: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, po: res });
}
