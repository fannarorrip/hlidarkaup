import { NextRequest, NextResponse } from "next/server";
import { listPendingSuggestions, applySuggestion, dismissSuggestion } from "@/lib/price-suggestions";

// Verðbreytingatillögur (from móttaka cost changes). Gated stjornandi/bokari via
// middleware (/api/products/:path+). GET = pending list; POST { id, action: apply|dismiss }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, suggestions: await listPendingSuggestions() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!id) return NextResponse.json({ ok: false, message: "Vantar id." }, { status: 400 });
  if (action === "apply") {
    const res = await applySuggestion(id);
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  if (action === "dismiss") {
    const ok = await dismissSuggestion(id);
    return NextResponse.json({ ok });
  }
  return NextResponse.json({ ok: false, message: "Óþekkt aðgerð." }, { status: 400 });
}
