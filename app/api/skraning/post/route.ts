import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findVoucherByReference } from "@/lib/invoice-dedup";
import { vNr } from "@/lib/format";

// Post a manual journal entry (handvirk dagbókarfærsla) to the ledger, and
// optionally retain the source PDF (fylgiskjal) linked to the voucher.
export async function POST(req: NextRequest) {
  const { date, description, reference, lines, pdf, filename, mime } = await req.json();
  const valid = (lines ?? []).filter((l: { account?: string; debit?: number; credit?: number }) =>
    l.account && (Number(l.debit) > 0 || Number(l.credit) > 0));
  if (valid.length < 2) return NextResponse.json({ error: "Færsla þarf a.m.k. tvær línur" }, { status: 400 });

  // Tvíbókunarvörn: the same tilvísun/reikningsnúmer may not exist on another live fylgiskjal —
  // whichever door it was booked through (innkaup, pósthólf, handvirkt).
  if (reference) {
    const dup = await findVoucherByReference(String(reference));
    if (dup) {
      return NextResponse.json(
        { error: `Tilvísunin „${reference}“ er þegar á fylgiskjali ${vNr(dup.series_code, dup.voucher_number)} (tvíbókun varin).` },
        { status: 409 });
    }
  }

  const jsonLines = valid.map((l: { account: string; debit?: number; credit?: number; vat_code?: string; description?: string }) => ({
    account: String(l.account),
    debit: Number(l.debit) || 0,
    credit: Number(l.credit) || 0,
    vat_code: l.vat_code || null,
    description: l.description || null,
  }));

  try {
    const r = await db.query<{ id: string; voucher_number: string }>(
      `select id, voucher_number from acc.post_voucher('JOURNAL',$1::date,'journal',$2,$3,'bokhald',$4::jsonb)`,
      [date || new Date().toISOString().slice(0, 10), description || "Handvirk færsla", reference || null, JSON.stringify(jsonLines)]);
    const { id, voucher_number: n } = r.rows[0];

    // Retain the source document, if one was supplied (fylgiskjal — 7-yr retention).
    if (pdf) {
      try {
        const b64 = String(pdf).replace(/^data:.*?base64,/, "");
        const buf = Buffer.from(b64, "base64");
        if (buf.length > 0) {
          await db.query(
            `insert into acc.documents (voucher_id, filename, mime, byte_size, bytes, created_by)
             values ($1,$2,$3,$4,$5,'bokhald')`,
            [id, filename || `reikningur-${n}.pdf`, mime || "application/pdf", buf.length, buf]);
        }
      } catch (e) { console.warn("[Skraning] document store failed:", e); }
    }

    return NextResponse.json({ ok: true, voucherId: id, voucherNumber: n, invoiceNumber: `J-${String(n).padStart(6, "0")}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const friendly = msg.includes("balance")
      ? "Debet og kredit stemma ekki"
      : msg.includes("debit/credit")
        ? "Hver lína verður að vera annaðhvort debet eða kredit"
        : "Villa við skráningu færslu";
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}
