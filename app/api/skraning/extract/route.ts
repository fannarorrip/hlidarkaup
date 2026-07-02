import { NextRequest, NextResponse } from "next/server";
import { extractInvoice, hasAnthropicKey, type ExtractFile } from "@/lib/invoice-extract";

// Read one or more documents (PDF / image / Excel) with Claude and produce a
// balanced dagbók entry. The user's free-text instructions + the company's chart
// of accounts guide which lyklar to book on. (Engine lives in lib/invoice-extract.)
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasAnthropicKey()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY vantar í stillingar (.env.local)." }, { status: 501 });
  }
  const body = await req.json();
  const instructions: string = (body.instructions ?? "").toString();
  let files: ExtractFile[] = Array.isArray(body.files) ? body.files : [];
  if (!files.length && body.pdf) files = [{ name: "skjal.pdf", mime: "application/pdf", data: body.pdf }];
  if (!files.length) return NextResponse.json({ error: "Vantar skjal" }, { status: 400 });

  try {
    const data = await extractInvoice({ instructions, files });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[Skraning extract]", err);
    return NextResponse.json({ error: "Tókst ekki að lesa skjalið: " + (err instanceof Error ? err.message : "") }, { status: 500 });
  }
}
