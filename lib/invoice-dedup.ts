// Duplicate-invoice guard: the SAME supplier invoice can never be booked twice.
// Identity key ladder (strongest available wins):
//   1. supplier kennitala          — canonical
//   2. SID:<supplier_id>           — registered supplier without a kennitala
//   3. NAFN:<normalized name>      — free-typed supplier (no register entry)
// Posting paths record into acc.supplier_invoices inside their transaction; the partial
// unique index is the hard block. A REVERSED voucher releases its registry row, so the
// correct rebook-after-bakfærsla workflow still works.
import { db } from "@/lib/db";

export class DuplicateInvoiceError extends Error {
  readonly status = 409;
  constructor(public invoiceNumber: string) {
    super(`Reikningur nr. ${invoiceNumber} frá þessum birgi er þegar bókaður (tvíbókun varin).`);
  }
}

export const normKt = (s?: string | null) => (s || "").replace(/\D/g, "");
/** Invoice numbers compare case-insensitively with collapsed whitespace. */
export const normInv = (s?: string | null) => (s || "").trim().replace(/\s+/g, " ").toUpperCase();

/** Strongest available identity for the supplier side of the dedup key. */
export function dedupKey(kt?: string | null, supplierId?: string | null, supplierName?: string | null): string {
  const k = normKt(kt);
  if (k) return k;
  if (supplierId) return `SID:${supplierId}`;
  const n = (supplierName || "").trim().replace(/\s+/g, " ").toUpperCase();
  return n ? `NAFN:${n}` : "";
}

interface Q { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }> }

/** The existing registry row if this invoice is already booked on a LIVE (non-reversed)
 *  voucher; reversed vouchers don't count — rebooking after bakfærsla is legitimate. */
export async function findBookedInvoice(key: string, invNo: string, client: Q = db): Promise<{ voucher_id: string | null } | null> {
  const k = (key || "").trim(), n = normInv(invNo);
  if (!k || !n) return null;
  return (await client.query<{ voucher_id: string | null }>(
    `select si.voucher_id
       from acc.supplier_invoices si
       left join acc.vouchers v on v.id = si.voucher_id
      where si.supplier_kennitala = $1 and si.invoice_number = $2
        and (si.voucher_id is null or v.status <> 'reversed')
      limit 1`, [k, n])).rows[0] ?? null;
}

/** Record a booked supplier invoice (call inside the posting txn). Throws DuplicateInvoiceError
 *  if the invoice is already registered on a live voucher; takes over the registry row when the
 *  previous booking was reversed. No-ops only when there is no identity or no invoice number. */
export async function recordSupplierInvoice(client: Q, key: string, invNo: string, voucherId: string, supplierId: string | null, source: string): Promise<void> {
  const k = (key || "").trim(), n = normInv(invNo);
  if (!k || !n) return;
  const res = await client.query<{ id: string }>(
    `insert into acc.supplier_invoices (supplier_kennitala, invoice_number, voucher_id, supplier_id, source)
     values ($1,$2,$3,$4,$5)
     on conflict (supplier_kennitala, invoice_number) where supplier_kennitala <> '' and invoice_number <> ''
     do nothing
     returning id`,
    [k, n, voucherId, supplierId, source]);
  if (res.rows.length) return; // fresh registration

  // Conflict: allowed ONLY if the earlier booking was reversed — then the row moves to us.
  const upd = await client.query<{ id: string }>(
    `update acc.supplier_invoices si
        set voucher_id = $3, supplier_id = coalesce($4, si.supplier_id), source = $5, created_at = now()
      where si.supplier_kennitala = $1 and si.invoice_number = $2
        and si.voucher_id is not null
        and exists (select 1 from acc.vouchers v where v.id = si.voucher_id and v.status = 'reversed')
      returning si.id`,
    [k, n, voucherId, supplierId, source]);
  if (!upd.rows.length) throw new DuplicateInvoiceError(n);
}

/** Backstop across ALL entry doors: a live (non-reversed) voucher already carrying this
 *  reference/invoice number — compared case-insensitively with collapsed whitespace. */
export async function findVoucherByReference(ref: string, client: Q = db): Promise<{ id: string; series_code: string; voucher_number: string; supplier_id: string | null } | null> {
  const n = normInv(ref);
  if (!n) return null;
  return (await client.query<{ id: string; series_code: string; voucher_number: string; supplier_id: string | null }>(
    `select id, series_code, voucher_number::text as voucher_number, supplier_id
       from acc.vouchers
      where upper(regexp_replace(btrim(coalesce(external_reference, '')), '\\s+', ' ', 'g')) = $1
        and status <> 'reversed'
      limit 1`, [n])).rows[0] ?? null;
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
         and upper(btrim(coalesce(extracted->>'invoiceNumber', ''))) = $2
       limit 1`, [k, n])).rows[0];
  return pending ? "pending" : null;
}
