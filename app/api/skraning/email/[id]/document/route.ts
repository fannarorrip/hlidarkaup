import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Serve the stored email attachment for preview in the Pósthólf review screen.
// Session-gated by middleware (/api/skraning/:path*).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await query<{ attachment_name: string | null; attachment_mime: string | null; attachment_bytes: Buffer | null }>(
    `select attachment_name, attachment_mime, attachment_bytes from acc.email_invoices where id = $1`, [id]);
  const doc = rows[0];
  if (!doc?.attachment_bytes) return NextResponse.json({ error: "Ekkert skjal" }, { status: 404 });
  return new NextResponse(new Uint8Array(doc.attachment_bytes), {
    headers: {
      "content-type": doc.attachment_mime || "application/octet-stream",
      "content-disposition": `inline; filename="${doc.attachment_name || "vidhengi"}"`,
      "cache-control": "no-store",
    },
  });
}
