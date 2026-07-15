import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { renderInboundInvoiceHtml } from "@/lib/einvoice-render";

// Serve the stored email attachment for preview in the Pósthólf review screen.
// Session-gated by middleware (/api/skraning/:path*).
// UBL/PEPPOL e-invoices (application/xml) are rendered as a readable HTML invoice by default;
// ?raw=1 serves the original XML unchanged (it stays the fylgiskjal on approval).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = req.nextUrl.searchParams.get("raw") === "1";
  const rows = await query<{ attachment_name: string | null; attachment_mime: string | null; attachment_bytes: Buffer | null }>(
    `select attachment_name, attachment_mime, attachment_bytes from acc.email_invoices where id = $1`, [id]);
  const doc = rows[0];
  if (!doc?.attachment_bytes) return NextResponse.json({ error: "Ekkert skjal" }, { status: 404 });

  const isXml = (doc.attachment_mime || "").includes("xml") || doc.attachment_bytes.toString("utf8", 0, 64).trimStart().startsWith("<");
  if (isXml && !raw) {
    try {
      const html = renderInboundInvoiceHtml(doc.attachment_bytes.toString("utf8"));
      return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    } catch { /* not a parseable UBL invoice — fall through and serve raw */ }
  }

  return new NextResponse(new Uint8Array(doc.attachment_bytes), {
    headers: {
      "content-type": doc.attachment_mime || "application/octet-stream",
      "content-disposition": `inline; filename="${doc.attachment_name || "vidhengi"}"`,
      "cache-control": "no-store",
    },
  });
}
