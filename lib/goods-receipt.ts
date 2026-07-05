// Goods receipt (móttaka) engine: turn a parsed supplier invoice (PEPPOL XML or
// AI-read PDF) into a receipt with product-matched lines, and on confirm raise stock
// (logged in stock_movements) + book the invoice (supplier-tagged) + store the fylgiskjal.
import { db } from "@/lib/db";
import { findSupplierByKennitala } from "@/lib/accounting-queries";
import { findBookedInvoice, recordSupplierInvoice, DuplicateInvoiceError, dedupKey } from "@/lib/invoice-dedup";
import { recordPayable } from "@/lib/payables";
import type { ParsedInvoice, ParsedLine } from "@/lib/peppol";

const r2 = (n: number) => Math.round(n * 100) / 100;
const VORUKAUP: Record<number, string> = { 24: "2100", 11: "2101", 0: "2103" };
const INNSKATTUR: Record<number, string> = { 24: "9510", 11: "9512" };

export class ReceiptError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

interface Queryable { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }> }

/** Resolve a parsed line to a catalog product_number: GTIN → learned map → fuzzy name. */
export async function matchLine(client: Queryable, supplierId: string | null, line: ParsedLine): Promise<string | null> {
  if (line.gtin) {
    const b = (await client.query<{ product_number: string }>(`select product_number from shop.product_barcodes where barcode = $1 limit 1`, [line.gtin])).rows[0];
    if (b) return b.product_number;
  }
  if (supplierId) {
    const key = line.gtin || line.supplierItemId;
    if (key) {
      const m = (await client.query<{ product_number: string }>(`select product_number from acc.supplier_items where supplier_id = $1 and match_key = $2 limit 1`, [supplierId, key])).rows[0];
      if (m) return m.product_number;
    }
  }
  if (line.description && line.description.length >= 3) {
    const n = (await client.query<{ product_number: string }>(
      `select product_number from shop.products where name % $1 order by similarity(name,$1) desc limit 1`, [line.description])).rows[0];
    if (n) return n.product_number;
  }
  return null;
}

/** Create a draft goods_receipt + lines from a parsed invoice. `inexchangeUuid` (when
 *  the invoice came from inExchange) dedupes re-fetches: an existing receipt is returned. */
export async function createReceiptFromParsed(parsed: ParsedInvoice, doc?: { name: string; mime: string; bytes: Buffer }, inexchangeUuid?: string): Promise<string> {
  if (inexchangeUuid) {
    const existing = (await db.query<{ id: string }>(`select id from acc.goods_receipts where inexchange_uuid = $1`, [inexchangeUuid])).rows[0];
    if (existing) return existing.id;
  }
  const supplier = parsed.supplierKennitala ? await findSupplierByKennitala(parsed.supplierKennitala) : null;
  const client = await db.connect();
  try {
    await client.query("begin");
    const rec = (await client.query<{ id: string }>(
      `insert into acc.goods_receipts
        (supplier_id, supplier_name, invoice_number, invoice_date, due_date, source, currency,
         total_net, total_vat, total_gross, doc_name, doc_mime, doc_bytes, inexchange_uuid, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'bokhald') returning id`,
      [supplier?.id ?? null, parsed.supplierName || null, parsed.invoiceNumber || null,
       parsed.issueDate || null, parsed.dueDate || null, parsed.format, parsed.currency || "ISK",
       parsed.totalNet || null, parsed.totalVat || null, parsed.totalGross || null,
       doc?.name ?? null, doc?.mime ?? null, doc?.bytes ?? null, inexchangeUuid ?? null])).rows[0];

    for (const l of parsed.lines) {
      const matched = await matchLine(client, supplier?.id ?? null, l);
      await client.query(
        `insert into acc.goods_receipt_lines
          (receipt_id, line_no, supplier_item_id, gtin, description, invoiced_qty, unit_code,
           unit_price, line_net, vat_rate, matched_product_number, received_qty)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$6)`,   // received_qty defaults to invoiced_qty
        [rec.id, l.lineNo, l.supplierItemId || null, l.gtin || null, l.description || null,
         l.qty, l.unitCode || null, l.unitPrice || null, l.lineNet || null, l.vatRate || 0, matched]);
    }
    await client.query("commit");
    return rec.id;
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}

interface RecLine { id: string; line_no: number; description: string | null; vat_rate: string; line_net: string; unit_price: string | null; matched_product_number: string | null; received_qty: string | null; invoiced_qty: string }

/**
 * Confirm a receipt: raise stock for matched lines (+ movement log), book the full
 * invoice (vörukaup + innskattur + lánadrottna, supplier-tagged) and attach the doc.
 * Stock = what was RECEIVED; the booking = what was INVOICED (variance handled later).
 */
export async function confirmReceipt(receiptId: string): Promise<{ voucherId: string; voucherNumber: string }> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const rec = (await client.query<{ id: string; supplier_id: string | null; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; due_date: string | null; status: string; doc_name: string | null; doc_mime: string | null; doc_bytes: Buffer | null }>(
      `select id, supplier_id, supplier_name, invoice_number, invoice_date, due_date::text as due_date, status, doc_name, doc_mime, doc_bytes
         from acc.goods_receipts where id = $1 for update`, [receiptId])).rows[0];
    if (!rec) throw new ReceiptError("Móttaka fannst ekki", 404);
    if (rec.status === "booked") throw new ReceiptError("Þegar bókað", 409);

    // Duplicate-invoice hard block (supplier kennitala + invoice number).
    const kt = rec.supplier_id
      ? (await client.query<{ kennitala: string | null }>(`select kennitala from acc.suppliers where id = $1`, [rec.supplier_id])).rows[0]?.kennitala ?? ""
      : "";
    if (rec.invoice_number && (await findBookedInvoice(dedupKey(kt, rec.supplier_id, rec.supplier_name), rec.invoice_number, client))) {
      throw new ReceiptError(`Reikningur nr. ${rec.invoice_number} frá þessum birgi er þegar bókaður (tvíbókun varin).`, 409);
    }

    const lines = (await client.query<RecLine>(
      `select id, line_no, description, vat_rate, line_net, unit_price, matched_product_number, received_qty, invoiced_qty
         from acc.goods_receipt_lines where receipt_id = $1 order by line_no`, [receiptId])).rows;
    if (!lines.length) throw new ReceiptError("Engar línur í móttöku");

    // 1) Stock movements for matched lines (by RECEIVED qty)
    for (const l of lines) {
      const qty = l.received_qty == null ? 0 : Number(l.received_qty);
      if (!l.matched_product_number || qty === 0) continue;
      const cost = l.unit_price == null ? null : Number(l.unit_price);
      await client.query(`update shop.products set stock_quantity = stock_quantity + $1, cost_price = coalesce($2, cost_price) where product_number = $3`,
        [qty, cost, l.matched_product_number]);
      await client.query(`insert into shop.stock_movements (product_number, qty_delta, type, cost_basis, ref_type, ref_id, created_by) values ($1,$2,'receipt',$3,'receipt',$4,'bokhald')`,
        [l.matched_product_number, qty, cost, receiptId]);
    }

    // 2) Build the accounting voucher from INVOICED amounts, grouped by VAT rate
    const netByRate = new Map<number, number>();
    for (const l of lines) netByRate.set(Number(l.vat_rate) || 0, r2((netByRate.get(Number(l.vat_rate) || 0) ?? 0) + (Number(l.line_net) || 0)));
    const vlines: { account: string; debit: number; credit: number; vat_code: string | null; description: string | null }[] = [];
    let totalGross = 0;
    for (const [rate, net] of netByRate) {
      if (net === 0) continue;
      vlines.push({ account: VORUKAUP[rate] ?? "2103", debit: r2(net), credit: 0, vat_code: rate === 24 ? "I24" : rate === 11 ? "I11" : "S00", description: `Vörukaup ${rate}%` });
      const vat = rate > 0 ? r2(net * rate / 100) : 0;
      if (vat > 0) vlines.push({ account: INNSKATTUR[rate], debit: vat, credit: 0, vat_code: rate === 24 ? "I24" : "I11", description: `Innskattur ${rate}%` });
      totalGross = r2(totalGross + net + vat);
    }
    if (totalGross <= 0) throw new ReceiptError("Engin upphæð til að bóka");
    vlines.push({ account: "9300", debit: 0, credit: totalGross, vat_code: null, description: `Lánadrottnar – ${rec.supplier_name ?? ""}` });

    const v = (await client.query<{ id: string; voucher_number: string }>(
      `select id, voucher_number from acc.post_voucher('PURCHASE',$1::date,'purchase',$2,$3,'bokhald',$4::jsonb, p_supplier_id => $5::uuid)`,
      [rec.invoice_date || new Date().toISOString().slice(0, 10), `Innkaup – ${rec.supplier_name ?? ""}`,
       rec.invoice_number || `MOT-${receiptId.slice(0, 8)}`, JSON.stringify(vlines), rec.supplier_id])).rows[0];

    if (rec.invoice_number) await recordSupplierInvoice(client, dedupKey(kt, rec.supplier_id, rec.supplier_name), rec.invoice_number, v.id, rec.supplier_id, "mottaka");

    // Register the open payable (móttaka always books á reikning → 9300). Due date from the receipt,
    // else invoice date + supplier terms.
    try {
      let due = rec.due_date;
      if (!due && rec.invoice_date) {
        const terms = rec.supplier_id
          ? (await client.query<{ payment_terms_days: number | null }>(`select payment_terms_days from acc.suppliers where id = $1`, [rec.supplier_id])).rows[0]?.payment_terms_days ?? 0
          : 0;
        const d = new Date(rec.invoice_date); d.setDate(d.getDate() + Number(terms || 0)); due = d.toISOString().slice(0, 10);
      }
      await recordPayable(client, { voucherId: v.id, supplierId: rec.supplier_id, invoiceNumber: rec.invoice_number, invoiceDate: rec.invoice_date, dueDate: due, amount: totalGross });
    } catch (e) { console.error("recordPayable (mottaka) failed:", e); }

    // 3) Fylgiskjal from the stored source document
    if (rec.doc_bytes && rec.doc_bytes.length > 0) {
      await client.query(`insert into acc.documents (voucher_id, filename, mime, byte_size, bytes, created_by) values ($1,$2,$3,$4,$5,'bokhald')`,
        [v.id, rec.doc_name || `reikningur-${v.voucher_number}`, rec.doc_mime || "application/octet-stream", rec.doc_bytes.length, rec.doc_bytes]);
    }

    await client.query(`update acc.goods_receipts set status='booked', voucher_id=$1, total_gross=$2 where id=$3`, [v.id, totalGross, receiptId]);
    await client.query("commit");
    return { voucherId: v.id, voucherNumber: String(v.voucher_number) };
  } catch (e) {
    await client.query("rollback");
    if (e instanceof ReceiptError) throw e;
    if (e instanceof DuplicateInvoiceError) throw new ReceiptError(e.message, 409);
    const msg = e instanceof Error ? e.message : "";
    throw new ReceiptError(msg.includes("balance") ? "Færslan stemmir ekki" : "Villa við bókun móttöku", 400);
  } finally { client.release(); }
}
