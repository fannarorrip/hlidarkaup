import { NextRequest, NextResponse } from "next/server";
import { parsePeppolInvoice } from "@/lib/peppol";
import { extractReceiptLines, hasAnthropicKey } from "@/lib/invoice-extract";
import { createReceiptFromParsed } from "@/lib/goods-receipt";

// Ingest a supplier invoice into a goods-receipt draft. Accepts a PEPPOL/UBL XML
// (parsed directly) or a PDF/image (AI-read product lines). Gated by middleware.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { name, mime, data } = await req.json();
  if (!data) return NextResponse.json({ error: "Vantar skjal" }, { status: 400 });
  const b64 = String(data).replace(/^data:.*?base64,/, "");
  const buf = Buffer.from(b64, "base64");
  const head = buf.subarray(0, 300).toString("utf8").trimStart();
  const isXml = /xml/i.test(mime || "") || /\.xml$/i.test(name || "") || head.startsWith("<");

  try {
    let parsed;
    if (isXml) {
      parsed = parsePeppolInvoice(buf.toString("utf8"));
    } else {
      if (!hasAnthropicKey()) return NextResponse.json({ error: "ANTHROPIC_API_KEY vantar — get ekki lesið PDF." }, { status: 501 });
      parsed = await extractReceiptLines({ files: [{ name: name || "reikningur.pdf", mime: mime || "application/pdf", data: b64 }] });
    }
    if (!parsed.lines.length) return NextResponse.json({ error: "Engar vörulínur fundust á reikningnum" }, { status: 422 });
    const receiptId = await createReceiptFromParsed(parsed, { name: name || (isXml ? "reikningur.xml" : "reikningur.pdf"), mime: mime || (isXml ? "application/xml" : "application/pdf"), bytes: buf });
    return NextResponse.json({ ok: true, receiptId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Tókst ekki að lesa reikning" }, { status: 400 });
  }
}
