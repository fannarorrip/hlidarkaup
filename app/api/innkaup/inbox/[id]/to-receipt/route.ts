import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePeppolInvoice } from "@/lib/peppol";
import { extractReceiptLines, hasAnthropicKey } from "@/lib/invoice-extract";
import { createReceiptFromParsed } from "@/lib/goods-receipt";

// "Í móttöku": pull a pósthólf invoice (inExchange UBL-XML or email PDF) straight into a
// goods-receipt draft — no manual upload. Links the pósthólf row to the receipt and marks a
// pending row 'skipped' so it can't ALSO be booked through the pósthólf approve (no double booking).
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = (await db.query<{
    id: string; status: string; receipt_id: string | null;
    attachment_name: string | null; attachment_mime: string | null; attachment_bytes: Buffer | null;
  }>(
    `select id, status, receipt_id, attachment_name, attachment_mime, attachment_bytes
       from acc.email_invoices where id = $1`, [id])).rows[0];
  if (!e) return NextResponse.json({ error: "Reikningur fannst ekki í pósthólfinu" }, { status: 404 });
  if (e.receipt_id) return NextResponse.json({ error: "Þegar kominn í móttöku", receiptId: e.receipt_id }, { status: 409 });
  if (!e.attachment_bytes) return NextResponse.json({ error: "Ekkert viðhengi vistað með þessum reikningi" }, { status: 422 });

  const buf = e.attachment_bytes;
  const head = buf.subarray(0, 300).toString("utf8").trimStart();
  const isXml = /xml/i.test(e.attachment_mime || "") || /\.xml$/i.test(e.attachment_name || "") || head.startsWith("<");
  try {
    let parsed;
    if (isXml) {
      parsed = parsePeppolInvoice(buf.toString("utf8"));
    } else {
      if (!hasAnthropicKey()) return NextResponse.json({ error: "ANTHROPIC_API_KEY vantar — get ekki lesið PDF." }, { status: 501 });
      parsed = await extractReceiptLines({ files: [{ name: e.attachment_name || "reikningur.pdf", mime: e.attachment_mime || "application/pdf", data: buf.toString("base64") }] });
    }
    if (!parsed.lines.length) return NextResponse.json({ error: "Engar vörulínur fundust á reikningnum" }, { status: 422 });

    const receiptId = await createReceiptFromParsed(parsed, {
      name: e.attachment_name || (isXml ? "reikningur.xml" : "reikningur.pdf"),
      mime: e.attachment_mime || (isXml ? "application/xml" : "application/pdf"),
      bytes: buf,
    });
    // Link + guard against double booking: a pending pósthólf row moves to 'skipped' — the
    // móttaka confirm books the invoice (with stock + price updates); the pósthólf must not too.
    await db.query(
      `update acc.email_invoices
          set receipt_id = $1,
              status = case when status = 'pending' then 'skipped' else status end,
              error = case when status = 'pending' then 'Flutt í móttöku' else error end
        where id = $2`, [receiptId, id]);
    return NextResponse.json({ ok: true, receiptId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Tókst ekki að lesa reikninginn" }, { status: 400 });
  }
}
