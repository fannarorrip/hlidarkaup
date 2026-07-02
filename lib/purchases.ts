// Posts a purchase invoice (innkaupareikningur) to the ledger:
//   Debit  expense/asset accounts (net)
//   Debit  innskattur (input VAT)  9510 (24%) / 9512 (11%)
//   Credit Lánadrottnar 9300 (á reikning)  OR  a bank/cash account (greitt)
import { db } from "@/lib/db";
import { findBookedInvoice, recordSupplierInvoice } from "@/lib/invoice-dedup";
import { recordPayable } from "@/lib/payables";

const INPUT_VAT: Record<number, string> = { 24: "9510", 11: "9512" };
const PAYABLE = "9300"; // Lánadrottnar innlendir

export interface PurchaseLineInput { account: string; net: number; vatRate: number; description?: string; }
export interface PostPurchaseInput {
  supplierName: string;
  supplierId?: string;        // tag the voucher to a birgir (AP subledger)
  supplierInvoiceNo?: string;
  date?: string;
  lines: PurchaseLineInput[];
  payment: "credit" | "paid";
  payAccount?: string;
}

export class PurchaseError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function postPurchase(input: PostPurchaseInput): Promise<{ invoiceNumber: string; voucherNumber: string }> {
  const lines = (input.lines ?? []).filter((l) => l.account && Number(l.net) > 0);
  if (!lines.length) throw new PurchaseError("Engar gildar línur");
  if (!input.supplierName?.trim()) throw new PurchaseError("Vantar birgja");

  const client = await db.connect();
  try {
    await client.query("begin");

    // Duplicate-invoice hard block (by supplier kennitala + invoice number).
    const kt = input.supplierId
      ? (await client.query<{ kennitala: string | null }>(`select kennitala from acc.suppliers where id = $1`, [input.supplierId])).rows[0]?.kennitala ?? ""
      : "";
    if (input.supplierInvoiceNo && (await findBookedInvoice(kt, input.supplierInvoiceNo, client))) {
      throw new PurchaseError(`Reikningur nr. ${input.supplierInvoiceNo} frá þessum birgi er þegar bókaður (tvíbókun varin).`, 409);
    }

    const debitLines: { account: string; debit: number; credit: number; vat_code: string | null; description: string | null }[] = [];
    const vatByRate = new Map<number, number>();
    let totalGross = 0;

    for (const ln of lines) {
      const net = Math.round(Number(ln.net));
      const rate = Number(ln.vatRate);
      const vat = rate > 0 ? Math.round((net * rate) / 100) : 0;
      const code = rate === 24 ? "I24" : rate === 11 ? "I11" : "S00";
      debitLines.push({ account: ln.account, debit: net, credit: 0, vat_code: code, description: ln.description ?? null });
      if (vat > 0) vatByRate.set(rate, (vatByRate.get(rate) ?? 0) + vat);
      totalGross += net + vat;
    }
    for (const [rate, vat] of vatByRate) {
      const acc = INPUT_VAT[rate];
      if (!acc) continue;
      debitLines.push({ account: acc, debit: vat, credit: 0, vat_code: rate === 24 ? "I24" : "I11", description: `Innskattur ${rate}%` });
    }

    const creditAccount = input.payment === "paid" ? (input.payAccount || "7850") : PAYABLE;
    const allLines = [...debitLines, {
      account: creditAccount, debit: 0, credit: totalGross, vat_code: null,
      description: input.payment === "paid" ? "Greitt" : "Lánadrottnar",
    }];

    // validate referenced accounts exist
    const accs = [...new Set(allLines.map((l) => l.account))];
    const found = (await client.query<{ account_number: string }>(
      `select account_number from acc.accounts where account_number = any($1::text[])`, [accs])).rows.map((r: { account_number: string }) => r.account_number);
    const missing = accs.filter((a) => !found.includes(a));
    if (missing.length) throw new PurchaseError(`Lyklar finnast ekki: ${missing.join(", ")}`);

    const ref = input.supplierInvoiceNo || `INNK-${Date.now()}`;
    const date = input.date || new Date().toISOString().slice(0, 10);
    const v = (await client.query<{ id: string; voucher_number: string }>(
      `select id, voucher_number from acc.post_voucher($1,$2::date,$3,$4,$5,$6,$7::jsonb, p_supplier_id => $8::uuid)`,
      ["PURCHASE", date, "purchase", `Innkaup – ${input.supplierName.trim()}`, ref, "bokhald", JSON.stringify(allLines), input.supplierId || null])).rows[0];

    if (input.supplierInvoiceNo) await recordSupplierInvoice(client, kt, input.supplierInvoiceNo, v.id, input.supplierId || null, "manual");

    // Register the open payable (only when booked á reikning — a "paid" purchase has no debt).
    if (input.payment === "credit") {
      try {
        const terms = input.supplierId
          ? (await client.query<{ payment_terms_days: number | null }>(`select payment_terms_days from acc.suppliers where id = $1`, [input.supplierId])).rows[0]?.payment_terms_days ?? 0
          : 0;
        const due = new Date(date); due.setDate(due.getDate() + Number(terms || 0));
        await recordPayable(client, { voucherId: v.id, supplierId: input.supplierId, invoiceNumber: input.supplierInvoiceNo, invoiceDate: date, dueDate: due.toISOString().slice(0, 10), amount: totalGross });
      } catch (e) { console.error("recordPayable (purchase) failed:", e); }
    }

    await client.query("commit");
    return { invoiceNumber: `P-${String(v.voucher_number).padStart(6, "0")}`, voucherNumber: String(v.voucher_number) };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
