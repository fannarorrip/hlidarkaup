import { NextRequest, NextResponse } from "next/server";
import { parsePeppolInvoice } from "@/lib/peppol";
import { createSkraningDraftFromParsed } from "@/lib/einvoice-inbound";
import { inexchangeWebhookSecret } from "@/lib/inexchange";

// Receives a pushed PEPPOL/UBL invoice from inExchange → creates a Skráning Pósthólf draft.
// Secret-gated (header x-inexchange-secret); intentionally OUTSIDE the auth middleware.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = inexchangeWebhookSecret();
  if (!secret) return NextResponse.json({ error: "INEXCHANGE_WEBHOOK_SECRET er ekki stillt." }, { status: 503 });
  const given = req.headers.get("x-inexchange-secret") || "";
  if (given.length !== secret.length || given !== secret) return NextResponse.json({ error: "Óheimilt" }, { status: 401 });
  try {
    const xml = await req.text();
    if (!xml.trim()) return NextResponse.json({ error: "Tómt skeyti" }, { status: 400 });
    const parsed = parsePeppolInvoice(xml);
    const dedupeKey = `${parsed.supplierKennitala || "push"}-${parsed.invoiceNumber || Date.now()}`;
    const res = await createSkraningDraftFromParsed(parsed, xml, dedupeKey);
    return NextResponse.json({ ok: true, created: res.created, id: res.id, reason: res.reason });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Villa við móttöku" }, { status: 400 });
  }
}
