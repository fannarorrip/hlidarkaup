import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Serve the stored source document (UBL XML / PDF) of a goods receipt.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await query<{ doc_name: string | null; doc_mime: string | null; doc_bytes: Buffer | null }>(
    `select doc_name, doc_mime, doc_bytes from acc.goods_receipts where id = $1`, [id]);
  const d = rows[0];
  if (!d?.doc_bytes) return NextResponse.json({ error: "Ekkert skjal" }, { status: 404 });
  return new NextResponse(new Uint8Array(d.doc_bytes), {
    headers: {
      "content-type": d.doc_mime || "application/octet-stream",
      "content-disposition": `inline; filename="${d.doc_name || "reikningur"}"`,
      "cache-control": "no-store",
    },
  });
}
