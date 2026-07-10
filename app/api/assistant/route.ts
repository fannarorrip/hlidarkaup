import { NextRequest, NextResponse } from "next/server";
import { chat, assistantEnabled } from "@/lib/assistant";

// Hjálpari (Claude). Gated stjórnandi/bókari via middleware (/api/assistant).
// POST { messages: [{role,content}...] } -> { reply }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ ok: true, enabled: assistantEnabled() });
}

export async function POST(req: NextRequest) {
  if (!assistantEnabled()) return NextResponse.json({ ok: false, message: "Hjálpari er ekki virkur (ANTHROPIC_API_KEY vantar)." }, { status: 501 });
  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const res = await chat(messages);
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, reply: res.reply, navigate: res.navigate ?? null });
}
