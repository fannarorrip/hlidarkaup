// Kreditreikningur: reverse a booked sölureikningur the accounting-correct way — the original
// invoice STAYS on record (gap-free numbering, audit trail); a credit note (KR series) offsets it
// (Cr viðskiptakröfur, Dr sala + útskattur), zeroing the customer's balance and reversing the VAT.
// Any open bank claim (krafa) for the original is cancelled at the same time.
import { query } from "@/lib/db";
import { postSale, type ExtraLine } from "@/lib/sales";
import { cancelClaim } from "@/lib/claims-bank";
import { SERIES_PREFIX } from "@/lib/format";

export interface CreditResult { ok: boolean; error?: string; creditVoucherId?: string; creditInvoiceNumber?: string; claimCancelled?: boolean }

const CREDITABLE = new Set(["account_sale", "sales_invoice"]);

export async function creditSalesInvoice(voucherId: string): Promise<CreditResult> {
  const v = (await query<{ id: string; voucher_type: string; series_code: string; voucher_number: string; status: string; customer_id: string | null }>(
    `select id, voucher_type, series_code, voucher_number::text as voucher_number, status, customer_id
       from acc.vouchers where id = $1`, [voucherId]))[0];
  if (!v) return { ok: false, error: "Reikningur fannst ekki." };
  if (v.voucher_type === "credit_note") return { ok: false, error: "Þetta er þegar kreditreikningur." };
  if (!CREDITABLE.has(v.voucher_type)) return { ok: false, error: "Aðeins reikninga á reikning má kreditera (ekki kassasölu)." };
  if (v.status === "reversed") return { ok: false, error: "Reikningurinn er bakfærður." };
  if (!v.customer_id) return { ok: false, error: "Enginn viðskiptamaður á reikningnum." };

  const prefix = SERIES_PREFIX[v.series_code] ?? v.series_code;
  const origNumber = `${prefix}-${String(v.voucher_number).padStart(6, "0")}`;

  // Guard against double-crediting (the credit note references the original's number).
  const already = (await query<{ id: string }>(
    `select id from acc.vouchers where voucher_type = 'credit_note' and external_reference = $1 limit 1`, [origNumber]))[0];
  if (already) return { ok: false, error: `Kreditreikningur er þegar til á móti ${origNumber}.` };

  const lines = await query<{ name: string; quantity: string; unit_price_gross: string; line_total: string; vat_rate: string }>(
    `select name, quantity, unit_price_gross, line_total, vat_rate from shop.sale_lines where voucher_id = $1 order by line_no`, [voucherId]);
  if (!lines.length) return { ok: false, error: "Engar línur á reikningnum til að kreditera." };

  const extraLines: ExtraLine[] = lines.map((l) => ({
    description: l.name,
    gross: Math.abs(Math.round(Number(l.line_total))),
    vat_rate: Number(l.vat_rate),
    quantity: Math.abs(Number(l.quantity)) || 1,
    unitPrice: Math.abs(Math.round(Number(l.unit_price_gross))),
  }));

  // kind:"return" + mode:"account" posts the mirror voucher (Cr AR / Dr sala+útskattur).
  const res = await postSale([], {
    mode: "account", kind: "return", series: "CREDIT", voucherType: "credit_note",
    customerId: v.customer_id, extraLines, decrementStock: false, ignoreStock: true,
    description: `Kreditreikningur á móti ${origNumber}`, reference: origNumber, skipBilling: true,
  });

  // Cancel any open claim for the original (the invoice is now nullified, don't collect it).
  let claimCancelled = false;
  const claim = (await query<{ id: string; status: string }>(
    `select id, status from acc.claims where voucher_id = $1 order by created_at desc limit 1`, [voucherId]))[0];
  if (claim && claim.status !== "paid" && claim.status !== "cancelled") {
    const c = await cancelClaim(claim.id).catch(() => ({ ok: false }));
    claimCancelled = c.ok;
  }

  return { ok: true, creditVoucherId: res.voucherId, creditInvoiceNumber: res.invoiceNumber, claimCancelled };
}
