import { NextRequest, NextResponse } from "next/server";
import { addTemplateLine, deleteTemplateLine, setLineDefaults } from "@/lib/heartbeat";

// Edit template lines. Gated via middleware (/api/innkaup).
//   POST   { name, vnr?, unit?, defaultQty? }      -> add a line
//   DELETE { lineNo }                              -> remove a line
//   PATCH  { defaults: { [line_no]: qty|null } }   -> persist standing quantities
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, message: "Vantar vöruheiti." }, { status: 400 });
  const line = await addTemplateLine(id, {
    name, vnr: String(body.vnr || "").trim() || undefined,
    unit: String(body.unit || "").trim() || undefined,
    defaultQty: Number(body.defaultQty) || undefined,
  });
  return NextResponse.json({ ok: true, line });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const lineNo = Number(body.lineNo);
  if (!lineNo) return NextResponse.json({ ok: false, message: "Vantar línunúmer." }, { status: 400 });
  const ok = await deleteTemplateLine(id, lineNo);
  return NextResponse.json({ ok });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body?.defaults || typeof body.defaults !== "object") {
    return NextResponse.json({ ok: false, message: "Vantar defaults." }, { status: 400 });
  }
  const defaults = Object.fromEntries(
    Object.entries(body.defaults as Record<string, unknown>).map(([k, v]) => {
      const n = Number(v);
      return [Number(k), Number.isFinite(n) && n > 0 ? n : null];
    }),
  );
  const updated = await setLineDefaults(id, defaults);
  return NextResponse.json({ ok: true, updated });
}
