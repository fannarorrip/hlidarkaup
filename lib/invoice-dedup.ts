// Duplicate-invoice guard. A supplier invoice is identified by (supplier kennitala, invoice
// number). Posting paths record into acc.supplier_invoices inside their transaction; the
// partial unique index is the hard block. Inbound channels (email/inExchange) skip an invoice
// that's already booked OR already pending. Dedup applies only when BOTH fields are known.
import { db } from "@/lib/db";

export class DuplicateInvoiceError extends Error {
  readonly status = 409;
  constructor(public invoiceNumber: string) {
    super(`Reikningur nr. ${invoiceNumber} frá þessum birgi er þegar bókaður (tvíbókun varin).`);
  }
}

export const normKt = (s?: string | null) => (s || "").replace(/\D/g, "");
export const normInv = (s?: string | null) => (s || "").trim();

interface Q { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }> }

/** Returns the existing registry row (with voucher_id) if this invoice is already booked, else null. */
export async function findBookedInvoice(kt: string, invNo: string, client: Q = db): Promise<{ voucher_id: string | null } | null> {
  const k = normKt(kt), n = normInv(invNo);
  if (!k || !n) return null;
  return (await client.query<{ voucher_id: string | null }>(
    `select voucher_id from acc.supplier_invoices where supplier_kennitala = $1 and invoice_number = $2 limit 1`, [k, n])).rows[0] ?? null;
}

/** Record a booked supplier invoice (call inside the posting txn). Throws DuplicateInvoiceError
 *  on the unique-index conflict — that rolls the posting back, guaranteeing no double-booking.
 *  No-ops when kennitala or invoice number is unknown (can't dedupe reliably). */
export async function recordSupplierInvoice(client: Q, kt: string, invNo: string, voucherId: string, supplierId: string | null, source: string): Promise<void> {
  const k = normKt(kt), n = normInv(invNo);
  if (!k || !n) return;
  try {
    await client.query(
      `insert into acc.supplier_invoices (supplier_kennitala, invoice_number, voucher_id, supplier_id, source) values ($1,$2,$3,$4,$5)`,
      [k, n, voucherId, supplierId, source]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new DuplicateInvoiceError(n);
    throw e;
  }
}

/** For inbound channels: is this invoice already booked or already a pending draft? */
export async function invoiceAlreadyKnown(kt: string, invNo: string): Promise<"booked" | "pending" | null> {
  const k = normKt(kt), n = normInv(invNo);
  if (!k || !n) return null;
  if (await findBookedInvoice(k, n)) return "booked";
  const pending = (await db.query(
    `select 1 from acc.email_invoices
       where status = 'pending'
         and regexp_replace(coalesce(extracted->>'supplierKennitala', ''), '\\D', '', 'g') = $1
         and btrim(coalesce(extracted->>'invoiceNumber', '')) = $2
       limit 1`, [k, n])).rows[0];
  return pending ? "pending" : null;
}
