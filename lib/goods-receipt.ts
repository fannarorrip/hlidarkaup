// Goods receipt (móttaka) engine: turn a parsed supplier invoice (PEPPOL XML or
// AI-read PDF) into a receipt with product-matched lines, and on confirm raise stock
// (logged in stock_movements) + book the invoice (supplier-tagged) + store the fylgiskjal.
import { db } from "@/lib/db";
import { findSupplierByKennitala } from "@/lib/accounting-queries";
import { findBookedInvoice, recordSupplierInvoice, DuplicateInvoiceError, dedupKey } from "@/lib/invoice-dedup";
import { recordPayable } from "@/lib/payables";
import { recordCostChanges } from "@/lib/price-suggestions";
import type { ParsedInvoice, ParsedLine } from "@/lib/peppol";

const r2 = (n: number) => Math.round(n * 100) / 100;
const VORUKAUP: Record<number, string> = { 24: "2100", 11: "2101", 0: "2103" };
const INNSKATTUR: Record<number, string> = { 24: "9510", 11: "9512" };

export class ReceiptError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

interface Queryable { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }> }

/** Resolve a parsed line to a catalog product_number: GTIN → learned map → fuzzy name. */
export async function matchLine(client: Queryable, supplierId: string | null, line: ParsedLine): Promise<{ productNumber: string | null; packQty: number | null }> {
  // Learned pack size rides with the supplier-item mapping (t.d. Lífland: 1 grind = 144 stk).
  if (supplierId) {
    const key = line.gtin || line.supplierItemId;
    if (key) {
      const m = (await client.query<{ product_number: string; pack_qty: string | null }>(
        `select product_number, pack_qty::text from acc.supplier_items where supplier_id = $1 and match_key = $2 limit 1`, [supplierId, key])).rows[0];
      if (m) return { productNumber: m.product_number, packQty: m.pack_qty ? Number(m.pack_qty) : null };
    }
  }
  // Prefill pack size from the description when unlearned: "(144 stk)" / "(36 stk / bakkar)".
  const packHint = line.description?.match(/\((\d+)\s*stk/i);
  const packQty = packHint ? Number(packHint[1]) : null;
  if (line.gtin) {
    const b = (await client.query<{ product_number: string }>(`select product_number from shop.product_barcodes where barcode = $1 limit 1`, [line.gtin])).rows[0];
    if (b) return { productNumber: b.product_number, packQty };
  }
  if (line.description && line.description.length >= 3) {
    const n = (await client.query<{ product_number: string }>(
      `select product_number from shop.products where name % $1 order by similarity(name,$1) desc limit 1`, [line.description])).rows[0];
    if (n) return { productNumber: n.product_number, packQty };
  }
  return { productNumber: null, packQty };
}

/** Create a draft goods_receipt + lines from a parsed invoice. `inexchangeUuid` (when
 *  the invoice came from inExchange) dedupes re-fetches: an existing receipt is returned. */
/** Normalize parsed invoice lines so line_net is ALWAYS: eftir afslátt, án vsk.
 *  Suppliers print this three ways — detected against the invoice's own totals (2% tolerance):
 *   (a) lines already ex-VAT after discount (Σlínur ≈ totalNet)          → unchanged
 *   (b) lines INCLUDE VAT (Σlínur ≈ totalGross)                          → divide each by (1+rate)
 *   (c) invoice-level afsláttur only in totals (Σlínur > totalNet)       → scale lines proportionally
 *  unitPrice follows the same correction so the editor shows real cost per unit. */
export function normalizeParsedInvoice(parsed: ParsedInvoice): ParsedInvoice {
  const lines = parsed.lines ?? [];
  const sum = lines.reduce((a, l) => a + (Number(l.lineNet) || 0), 0);
  const totalNet = Number(parsed.totalNet) || 0;
  const totalGross = Number(parsed.totalGross) || 0;
  const totalVat = Number(parsed.totalVat) || 0;
  const close = (a: number, b: number) => b > 0 && Math.abs(a - b) / b <= 0.02;
  if (sum <= 0 || close(sum, totalNet)) return parsed;                       // (a) or nothing to check

  if (totalVat > 0 && close(sum, totalGross)) {                              // (b) lines carry VAT
    return {
      ...parsed,
      lines: lines.map((l) => {
        const f = 1 + (Number(l.vatRate) || 0) / 100;
        return { ...l, lineNet: (Number(l.lineNet) || 0) / f, unitPrice: (Number(l.unitPrice) || 0) / f };
      }),
    };
  }
  if (totalNet > 0 && sum > totalNet) {                                      // (c) afsláttur only in totals
    const f = totalNet / sum;
    if (f >= 0.5 && f < 1) {
      return { ...parsed, lines: lines.map((l) => ({ ...l, lineNet: (Number(l.lineNet) || 0) * f, unitPrice: (Number(l.unitPrice) || 0) * f })) };
    }
  }
  return parsed;
}

export async function createReceiptFromParsed(parsedRaw: ParsedInvoice, doc?: { name: string; mime: string; bytes: Buffer }, inexchangeUuid?: string, opts?: { bookInvoice?: boolean }): Promise<string> {
  const parsed = normalizeParsedInvoice(parsedRaw);
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
         total_net, total_vat, total_gross, doc_name, doc_mime, doc_bytes, inexchange_uuid, book_invoice, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'bokhald') returning id`,
      [supplier?.id ?? null, parsed.supplierName || null, parsed.invoiceNumber || null,
       parsed.issueDate || null, parsed.dueDate || null, parsed.format, parsed.currency || "ISK",
       parsed.totalNet || null, parsed.totalVat || null, parsed.totalGross || null,
       doc?.name ?? null, doc?.mime ?? null, doc?.bytes ?? null, inexchangeUuid ?? null,
       opts?.bookInvoice !== false])).rows[0];

    for (const l of parsed.lines) {
      const { productNumber: matched, packQty } = await matchLine(client, supplier?.id ?? null, l);
      await client.query(
        `insert into acc.goods_receipt_lines
          (receipt_id, line_no, supplier_item_id, gtin, description, invoiced_qty, unit_code,
           unit_price, line_net, vat_rate, matched_product_number, received_qty, pack_qty)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$6,$12)`,   // received_qty defaults to invoiced_qty
        [rec.id, l.lineNo, l.supplierItemId || null, l.gtin || null, l.description || null,
         l.qty, l.unitCode || null, l.unitPrice || null, l.lineNet || null, l.vatRate || 0, matched, packQty]);
    }
    await client.query("commit");
    return rec.id;
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}

interface RecLine { id: string; line_no: number; description: string | null; vat_rate: string; line_net: string; unit_price: string | null; matched_product_number: string | null; received_qty: string | null; invoiced_qty: string; pack_qty: string | null; unit_cost_override: string | null }

/** Beita verðbreytingum STRAX af drögum ("Vista drög" = verðin keyrast inn): sama
 *  kostnaðarútreikning og staðfestingin (override > línuupphæð÷(magn×pakki) > einingaverð)
 *  en snertir HVORKI birgðir né bókhald — recordCostChanges sér um verðin + rekjanleikann.
 *  Endurkeyrsla við bókun verður nær alltaf no-op (1% suð-vörnin grípur óbreytt verð). */
export async function applyDraftPrices(receiptId: string): Promise<number> {
  const rec = (await db.query<{ supplier_id: string | null; supplier_name: string | null; status: string }>(
    `select supplier_id, supplier_name, status from acc.goods_receipts where id = $1`, [receiptId])).rows[0];
  if (!rec || rec.status === "booked") return 0;
  const lines = (await db.query<RecLine>(
    `select id, line_no, description, vat_rate, line_net, unit_price, matched_product_number, received_qty, invoiced_qty, pack_qty, unit_cost_override
       from acc.goods_receipt_lines where receipt_id = $1 order by line_no`, [receiptId])).rows;
  const costChanges: { product_number: string; old_cost: number | null; new_cost: number }[] = [];
  for (const l of lines) {
    if (!l.matched_product_number) continue;
    const invQty = Number(l.invoiced_qty) || 0;
    const pack = Number(l.pack_qty) > 0 ? Number(l.pack_qty) : 1;
    const override = l.unit_cost_override == null ? null : Number(l.unit_cost_override);
    const lineNet = l.line_net == null ? null : Number(l.line_net);
    const cost = override != null && override > 0 ? override
      : lineNet != null && lineNet > 0 && invQty > 0
        ? Math.round((lineNet / (invQty * pack)) * 100) / 100
        : l.unit_price == null ? null : Number(l.unit_price);
    if (cost == null || cost <= 0) continue;
    const prev = (await db.query<{ cost_price: string | null }>(
      `select cost_price::text from shop.products where product_number = $1`, [l.matched_product_number])).rows[0];
    costChanges.push({ product_number: l.matched_product_number, old_cost: prev?.cost_price != null ? Number(prev.cost_price) : null, new_cost: cost });
  }
  return recordCostChanges(costChanges, { receiptId, supplierId: rec.supplier_id, supplierName: rec.supplier_name });
}

/**
 * Confirm a receipt: raise stock for matched lines (+ movement log), book the full
 * invoice (vörukaup + innskattur + lánadrottna, supplier-tagged) and attach the doc.
 * Stock = what was RECEIVED; the booking = what was INVOICED (variance handled later).
 */
export async function confirmReceipt(receiptId: string): Promise<{ voucherId: string; voucherNumber: string }> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const rec = (await client.query<{ id: string; supplier_id: string | null; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; due_date: string | null; status: string; book_invoice: boolean; doc_name: string | null; doc_mime: string | null; doc_bytes: Buffer | null }>(
      `select id, supplier_id, supplier_name, invoice_number, invoice_date, due_date::text as due_date, status, book_invoice, doc_name, doc_mime, doc_bytes
         from acc.goods_receipts where id = $1 for update`, [receiptId])).rows[0];
    if (!rec) throw new ReceiptError("Móttaka fannst ekki", 404);
    if (rec.status === "booked") throw new ReceiptError("Þegar bókað", 409);

    // Duplicate-invoice hard block (supplier kennitala + invoice number). Skipped for
    // book_invoice=false receipts — the invoice IS booked elsewhere by design (pósthólfið).
    const kt = rec.supplier_id
      ? (await client.query<{ kennitala: string | null }>(`select kennitala from acc.suppliers where id = $1`, [rec.supplier_id])).rows[0]?.kennitala ?? ""
      : "";
    if (rec.book_invoice && rec.invoice_number && (await findBookedInvoice(dedupKey(kt, rec.supplier_id, rec.supplier_name), rec.invoice_number, client))) {
      throw new ReceiptError(`Reikningur nr. ${rec.invoice_number} frá þessum birgi er þegar bókaður (tvíbókun varin).`, 409);
    }

    const lines = (await client.query<RecLine>(
      `select id, line_no, description, vat_rate, line_net, unit_price, matched_product_number, received_qty, invoiced_qty, pack_qty, unit_cost_override
         from acc.goods_receipt_lines where receipt_id = $1 order by line_no`, [receiptId])).rows;
    if (!lines.length) throw new ReceiptError("Engar línur í móttöku");

    // 1) Stock movements for matched lines (by RECEIVED qty) — capturing the previous cost
    //    so price suggestions can react to cost changes after commit.
    const costChanges: { product_number: string; old_cost: number | null; new_cost: number }[] = [];
    for (const l of lines) {
      const qty = l.received_qty == null ? 0 : Number(l.received_qty);
      if (!l.matched_product_number || qty === 0) continue;
      // Raunkostnaður á SÖLUVÖRU. Forgangur:
      //  1) unit_cost_override — handslegið Ein.verð í móttökunni (einskiptis leiðrétting)
      //  2) línuupphæð (eftir afslátt, án vsk) ÷ (magn á reikningi × pakkastærð) — pakkastærðin
      //     dekkar kassa/grindur (Lífland: 1 grind = 144 stk → 84.815/144 = 589 kr/stk)
      //  3) prentað einingaverð (síðasta hálmstrá — oft listaverð án afsláttar)
      const invQty = Number(l.invoiced_qty) || 0;
      const pack = Number(l.pack_qty) > 0 ? Number(l.pack_qty) : 1;
      const override = l.unit_cost_override == null ? null : Number(l.unit_cost_override);
      const lineNet = l.line_net == null ? null : Number(l.line_net);
      const cost = override != null && override > 0 ? override
        : lineNet != null && lineNet > 0 && invQty > 0
          ? Math.round((lineNet / (invQty * pack)) * 100) / 100
          : l.unit_price == null ? null : Number(l.unit_price);
      // Birgðir hækka í SÖLUVÖRUM: móttekið magn (reikningseiningar) × pakkastærð.
      const stockQty = qty * pack;
      if (cost != null && cost > 0) {
        const prev = (await client.query<{ cost_price: string | null }>(
          `select cost_price::text from shop.products where product_number = $1`, [l.matched_product_number])).rows[0];
        costChanges.push({ product_number: l.matched_product_number, old_cost: prev?.cost_price != null ? Number(prev.cost_price) : null, new_cost: cost });
      }
      await client.query(`update shop.products set stock_quantity = stock_quantity + $1, cost_price = coalesce($2, cost_price) where product_number = $3`,
        [stockQty, cost, l.matched_product_number]);
      await client.query(`insert into shop.stock_movements (product_number, qty_delta, type, cost_basis, ref_type, ref_id, created_by) values ($1,$2,'receipt',$3,'receipt',$4,'bokhald')`,
        [l.matched_product_number, stockQty, cost, receiptId]);
    }

    // 1b) Tie received products to this birgi when they have none yet — so pantanir group by
    //     supplier and the reorder list can order from the right birgi automatically.
    if (rec.supplier_id) {
      const receivedPns = lines.filter((l: RecLine) => l.matched_product_number && Number(l.received_qty) > 0).map((l: RecLine) => l.matched_product_number);
      if (receivedPns.length)
        await client.query(`update shop.products set preferred_supplier_id = $1 where product_number = any($2::text[]) and preferred_supplier_id is null`, [rec.supplier_id, receivedPns]);
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

    // book_invoice=false: reikningurinn er ÞEGAR bókaður (t.d. um pósthólfið) — staðfestingin
    // uppfærir aðeins birgðir (þegar gert að ofan) + verð (á eftir). Engin bókun, ekkert fylgiskjal.
    if (!rec.book_invoice) {
      await client.query(`update acc.goods_receipts set status='booked', total_gross=$1 where id=$2`, [totalGross, receiptId]);
      await client.query("commit");
      await recordCostChanges(costChanges, { receiptId, supplierId: rec.supplier_id, supplierName: rec.supplier_name });
      return { voucherId: "", voucherNumber: "" };
    }

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
    // Verðbreytingatillögur: react to changed costs AFTER the booking is safely committed
    // (best-effort — a suggestion failure must never affect the receipt).
    await recordCostChanges(costChanges, { receiptId, supplierId: rec.supplier_id, supplierName: rec.supplier_name });
    return { voucherId: v.id, voucherNumber: String(v.voucher_number) };
  } catch (e) {
    await client.query("rollback");
    if (e instanceof ReceiptError) throw e;
    if (e instanceof DuplicateInvoiceError) throw new ReceiptError(e.message, 409);
    const msg = e instanceof Error ? e.message : "";
    throw new ReceiptError(msg.includes("balance") ? "Færslan stemmir ekki" : "Villa við bókun móttöku", 400);
  } finally { client.release(); }
}
