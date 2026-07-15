// Routes a received e-invoice (inExchange / PEPPOL) into the Skráning Pósthólf as a draft,
// instead of the Móttaka goods-receipt screen. The draft pre-books a purchase entry
// (vörukaup + innskattur, credit lánadrottnar) for human review/approval in SkraningForm.
// Supplier tagging still happens at approval via the Pósthólf's SupplierPicker (by kennitala).
import { db } from "@/lib/db";
import { invoiceAlreadyKnown } from "@/lib/invoice-dedup";
import type { ParsedInvoice } from "@/lib/peppol";

// VAT rate → purchase (vörukaup) / input-VAT (innskattur) accounts. Mirrors the Skráning AI default.
const VORUKAUP: Record<number, string> = { 24: "2100", 11: "2101", 0: "2103" };
const INNSKATTUR: Record<number, string> = { 24: "9510", 11: "9512" };
const CREDIT_ACCOUNT = "9300"; // Lánadrottnar (á reikning)

interface DraftLine { account: string; description: string; vatRate: number; amount: number } // amount signed: + debet, − kredit

/** Build balanced purchase-booking draft lines from a parsed invoice. */
export function bookingLinesFromParsed(parsed: ParsedInvoice): DraftLine[] {
  const lines: DraftLine[] = [];
  const vatByRate = new Map<number, number>();

  for (const l of parsed.lines) {
    const rate = [24, 11, 0].includes(l.vatRate) ? l.vatRate : 0;
    const net = Math.round(l.lineNet || l.qty * l.unitPrice || 0);
    if (net === 0) continue;
    lines.push({ account: VORUKAUP[rate] ?? VORUKAUP[0], description: l.description || "Vörukaup", vatRate: rate, amount: net });
    if (rate > 0) vatByRate.set(rate, (vatByRate.get(rate) ?? 0) + net);
  }
  for (const [rate, net] of vatByRate) {
    const vat = Math.round((net * rate) / 100);
    // !== 0 (not > 0): a credit note has negative net → negative innskattur, which must still post.
    if (vat !== 0) lines.push({ account: INNSKATTUR[rate], description: `Innskattur ${rate}%`, vatRate: rate, amount: vat });
  }
  const totalDebet = lines.reduce((s, l) => s + l.amount, 0);
  if (totalDebet !== 0) {
    lines.push({
      account: CREDIT_ACCOUNT, vatRate: 0, amount: -totalDebet,
      description: `${parsed.supplierName || "Birgir"}${parsed.invoiceNumber ? " reikn. " + parsed.invoiceNumber : ""}`,
    });
  }
  return lines;
}

export interface InboundResult { created: boolean; id?: string; reason?: string }

/** Insert a received e-invoice as a pending Skráning draft. Dedupes by message_id = inexchange:<uuid>. */
export async function createSkraningDraftFromParsed(parsed: ParsedInvoice, ublXml: string, uuid: string): Promise<InboundResult> {
  const lines = bookingLinesFromParsed(parsed);
  if (lines.length < 2) return { created: false, reason: "no_lines" };

  // Duplicate hard block: skip if this invoice (supplier kt + nr) is already booked or pending.
  const known = await invoiceAlreadyKnown(parsed.supplierKennitala, parsed.invoiceNumber);
  if (known) return { created: false, reason: known === "booked" ? "already-booked" : "already-pending" };

  const extracted = {
    supplier: parsed.supplierName,
    supplierKennitala: parsed.supplierKennitala,
    invoiceNumber: parsed.invoiceNumber,
    date: parsed.issueDate,
    isCredit: parsed.isCredit,
    total: parsed.totalGross,   // signed — negative for a credit note (drives the list "Upphæð")
    lines,
    source: "inexchange",
  };
  const bytes = Buffer.from(ublXml, "utf8");
  // received_at = actual receipt time (now), not the invoice's issue date — the issue date lives in
  // extracted.date. (Storing a date string here rendered a spurious 23:00 time in the Pósthólf list.)
  const row = (await db.query<{ id: string }>(
    `insert into acc.email_invoices
       (message_id, received_at, from_address, from_name, subject, status, extracted,
        attachment_name, attachment_mime, attachment_size, attachment_bytes, processed_at)
     values ($1, now(), null, $2, $3, 'pending', $4::jsonb, $5, 'application/xml', $6, $7, now())
     on conflict (message_id) do nothing
     returning id`,
    [
      `inexchange:${uuid}`,
      parsed.supplierName || "inExchange",
      parsed.invoiceNumber || `inExchange ${uuid.slice(0, 8)}`,
      JSON.stringify(extracted),
      `inexchange-${parsed.invoiceNumber || uuid}.xml`,
      bytes.length,
      bytes,
    ],
  )).rows[0];

  return row ? { created: true, id: row.id } : { created: false, reason: "duplicate" };
}
