import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { renderInboundInvoiceHtml } from "@/lib/einvoice-render";

// Serve the stored source document (UBL XML / PDF) of a goods receipt.
// XML renders as a readable invoice (?raw=1 returns the untouched original).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = new URL(req.url).searchParams.get("raw") === "1";
  const rows = await query<{ doc_name: string | null; doc_mime: string | null; doc_bytes: Buffer | null }>(
    `select doc_name, doc_mime, doc_bytes from acc.goods_receipts where id = $1`, [id]);
  const d = rows[0];
  if (!d?.doc_bytes) return NextResponse.json({ error: "Ekkert skjal" }, { status: 404 });

  const looksXml = (d.doc_mime || "").includes("xml") || d.doc_bytes.subarray(0, 64).toString("utf8").trimStart().startsWith("<");
  if (looksXml && !raw) {
    try {
      const html = renderInboundInvoiceHtml(d.doc_bytes.toString("utf8"));
      return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    } catch { /* ógilt/óþekkt XML — hrá bæti í staðinn */ }
  }
  return new NextResponse(new Uint8Array(d.doc_bytes), {
    headers: {
      "content-type": d.doc_mime || "application/octet-stream",
      "content-disposition": `inline; filename="${d.doc_name || "reikningur"}"`,
      "cache-control": "no-store",
    },
  });
}
