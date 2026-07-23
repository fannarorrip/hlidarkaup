import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { query } from "@/lib/db";
import { renderInboundInvoiceHtml } from "@/lib/einvoice-render";

// Serve the retained source document (fylgiskjal). PDFs are stamped with the
// skjalanúmer (red circle, top-right) on every page, like a paper voucher stamp.
// E-invoice XML (inExchange/UBL frumrit) renders as a readable invoice page —
// ?raw=1 still returns the untouched XML (the legally retained original).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function stampPdf(bytes: Buffer, label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const red = rgb(0.8, 0.1, 0.1);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const r = 26, cx = width - r - 30, cy = height - r - 30;
    page.drawCircle({ x: cx, y: cy, size: r, borderColor: red, borderWidth: 1.5 });
    const fs = label.length > 6 ? 9 : 11;
    const w = font.widthOfTextAtSize(label, fs);
    page.drawText(label, { x: cx - w / 2, y: cy - fs / 2 + 1, size: fs, font, color: red });
  }
  return doc.save();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ voucherId: string }> }) {
  const { voucherId } = await params;
  const raw = new URL(req.url).searchParams.get("raw") === "1";
  const rows = await query<{ filename: string | null; mime: string; bytes: Buffer; skjalanumer: string | null }>(
    `select filename, mime, bytes, skjalanumer from acc.documents where voucher_id = $1 order by created_at desc limit 1`,
    [voucherId]);
  if (!rows[0]) return NextResponse.json({ error: "Ekkert skjal" }, { status: 404 });
  const doc = rows[0];
  const label = doc.skjalanumer ? String(doc.skjalanumer).padStart(6, "0") : "";

  // Rafrænt frumrit (UBL/XML): birta sem læsilegan reikning, ekki hráan kóða.
  const looksXml = (doc.mime || "").includes("xml") || doc.bytes.subarray(0, 64).toString("utf8").trimStart().startsWith("<");
  if (looksXml && !raw) {
    try {
      const html = renderInboundInvoiceHtml(doc.bytes.toString("utf8"));
      return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    } catch { /* ógilt/óþekkt XML — fellur í gegn í hrá bæti */ }
  }

  let out: Uint8Array = new Uint8Array(doc.bytes);
  if ((doc.mime || "").includes("pdf") && label) {
    try { out = await stampPdf(doc.bytes, label); } catch (e) { console.warn("[document stamp] failed, serving original:", e); }
  }
  const ext = (doc.mime || "").includes("pdf") ? ".pdf" : looksXml ? ".xml" : "";
  return new NextResponse(Buffer.from(out), {
    headers: {
      "content-type": doc.mime || "application/pdf",
      "content-disposition": `inline; filename="${label ? `skjal-${label}` : doc.filename || "skjal"}${ext}"`,
      "cache-control": "no-store",
    },
  });
}
