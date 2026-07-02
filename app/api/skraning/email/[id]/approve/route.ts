import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findBookedInvoice, recordSupplierInvoice } from "@/lib/invoice-dedup";

// Approve an emailed invoice draft: post the (possibly edited) dagbók entry to the
// ledger, attach the stored source document as the fylgiskjal, and mark the draft
// approved. Mirrors app/api/skraning/post — the human gate before the immutable ledger.
export const runtime = "nodejs";

interface InLine { account?: string; debit?: number; credit?: number; vat_code?: string | null; description?: string | null }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { date, description, reference, lines, supplier_id } = await req.json();

  const valid: InLine[] = (lines ?? []).filter((l: InLine) => l.account && (Number(l.debit) > 0 || Number(l.credit) > 0));
  if (valid.length < 2) return NextResponse.json({ error: "Færsla þarf a.m.k. tvær línur" }, { status: 400 });
  const jsonLines = valid.map((l) => ({
    account: String(l.account), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
    vat_code: l.vat_code || null, description: l.description || null,
  }));

  // Load the draft + its stored attachment.
  const draft = (await db.query<{ status: string; attachment_name: string | null; attachment_mime: string | null; attachment_bytes: Buffer | null; extracted: { supplierKennitala?: string; invoiceNumber?: string } | null }>(
    `select status, attachment_name, attachment_mime, attachment_bytes, extracted from acc.email_invoices where id = $1`, [id])).rows[0];
  if (!draft) return NextResponse.json({ error: "Drög fundust ekki" }, { status: 404 });
  if (draft.status === "approved") return NextResponse.json({ error: "Þegar bókað" }, { status: 409 });

  // Duplicate-invoice hard block (supplier kennitala + invoice number).
  const invNo = draft.extracted?.invoiceNumber ?? "";
  const kt = draft.extracted?.supplierKennitala ?? "";
  if (invNo && (await findBookedInvoice(kt, invNo))) {
    return NextResponse.json({ error: `Reikningur nr. ${invNo} frá þessum birgi er þegar bókaður (tvíbókun varin).` }, { status: 409 });
  }

  try {
    const r = await db.query<{ id: string; voucher_number: string }>(
      `select id, voucher_number from acc.post_voucher('JOURNAL',$1::date,'journal',$2,$3,'bokhald',$4::jsonb, p_supplier_id => $5::uuid)`,
      [date || new Date().toISOString().slice(0, 10), description || "Reikningur úr tölvupósti", reference || null, JSON.stringify(jsonLines), supplier_id || null]);
    const { id: voucherId, voucher_number: n } = r.rows[0];

    // Retain the source document (fylgiskjal — 7-yr retention), from the bytes already stored on the draft.
    if (draft.attachment_bytes && draft.attachment_bytes.length > 0) {
      try {
        await db.query(
          `insert into acc.documents (voucher_id, filename, mime, byte_size, bytes, created_by)
           values ($1,$2,$3,$4,$5,'bokhald')`,
          [voucherId, draft.attachment_name || `reikningur-${n}.pdf`, draft.attachment_mime || "application/pdf", draft.attachment_bytes.length, draft.attachment_bytes]);
      } catch (e) { console.warn("[Email approve] document store failed:", e); }
    }

    await db.query(`update acc.email_invoices set status='approved', voucher_id=$1, error=null, processed_at=now() where id=$2`, [voucherId, id]);
    if (invNo) { try { await recordSupplierInvoice(db, kt, invNo, voucherId, supplier_id || null, "email"); } catch { /* race only; pre-check guards the normal path */ } }
    return NextResponse.json({ ok: true, voucherId, voucherNumber: n, invoiceNumber: `J-${String(n).padStart(6, "0")}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const friendly = msg.includes("balance") ? "Debet og kredit stemma ekki"
      : msg.includes("debit/credit") ? "Hver lína verður að vera annaðhvort debet eða kredit"
        : "Villa við skráningu færslu";
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}
