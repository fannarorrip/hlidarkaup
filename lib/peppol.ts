// PEPPOL BIS 3.0 / UBL 2.1 Invoice parser. inExchange e-invoices arrive in this
// format; we parse the structured XML directly (no AI) into the same line shape the
// PDF/AI path produces, so the móttaka (goods-receipt) screen is channel-agnostic.
import { XMLParser } from "fast-xml-parser";

export interface ParsedLine {
  lineNo: number;
  description: string;
  supplierItemId: string;   // seller's item code
  gtin: string;             // GTIN/barcode (matches shop.product_barcodes)
  qty: number;
  unitCode: string;
  unitPrice: number;        // net unit price
  lineNet: number;
  vatRate: number;
}
export interface ParsedInvoice {
  format: "peppol" | "pdf";
  invoiceNumber: string;
  issueDate: string;        // YYYY-MM-DD
  dueDate: string;
  currency: string;
  supplierName: string;
  supplierKennitala: string;
  lines: ParsedLine[];
  totalNet: number;
  totalVat: number;
  totalGross: number;
}

// ── small helpers for the UBL shape (text-or-{#text,@attr}, single-or-array) ──
const txt = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") return String((v as Record<string, unknown>)["#text"] ?? "");
  return String(v);
};
const attr = (v: unknown, name: string): string | undefined =>
  v && typeof v === "object" ? (v as Record<string, unknown>)["@_" + name] as string | undefined : undefined;
const arr = <T>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const num = (v: unknown): number => { const n = Number(txt(v).replace(/\s/g, "")); return Number.isFinite(n) ? n : 0; };
const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

export function parsePeppolInvoice(xml: string): ParsedInvoice {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false, trimValues: true });
  const root = parser.parse(xml) as Record<string, unknown>;
  const inv = (root.Invoice ?? root.CreditNote) as Record<string, unknown> | undefined;
  if (!inv) throw new Error("Ekki gildur PEPPOL/UBL reikningur (vantar <Invoice>).");

  const supplierParty = ((inv.AccountingSupplierParty as Record<string, unknown>)?.Party ?? {}) as Record<string, unknown>;
  const supplierName =
    txt((supplierParty.PartyName as Record<string, unknown>)?.Name) ||
    txt((supplierParty.PartyLegalEntity as Record<string, unknown>)?.RegistrationName) || "";

  // kennitala = first 10-digit company id we find (PartyIdentification / PartyLegalEntity / PartyTaxScheme)
  const idCandidates: string[] = [];
  for (const pi of arr(supplierParty.PartyIdentification as unknown)) idCandidates.push(txt((pi as Record<string, unknown>).ID));
  idCandidates.push(txt((supplierParty.PartyLegalEntity as Record<string, unknown>)?.CompanyID));
  for (const ts of arr(supplierParty.PartyTaxScheme as unknown)) idCandidates.push(txt((ts as Record<string, unknown>).CompanyID));
  const supplierKennitala = idCandidates.map(onlyDigits).find((d) => d.length === 10) || "";

  const lines: ParsedLine[] = arr(inv.InvoiceLine ?? (inv.CreditNoteLine as unknown)).map((raw, i) => {
    const l = raw as Record<string, unknown>;
    const item = (l.Item ?? {}) as Record<string, unknown>;
    const taxCat = arr(item.ClassifiedTaxCategory as unknown)[0] as Record<string, unknown> | undefined;
    const qtyNode = l.InvoicedQuantity ?? l.CreditedQuantity;
    return {
      lineNo: i + 1,
      description: txt(item.Name) || txt(l.Note),
      supplierItemId: txt((item.SellersItemIdentification as Record<string, unknown>)?.ID),
      gtin: onlyDigits(txt((item.StandardItemIdentification as Record<string, unknown>)?.ID)),
      qty: num(qtyNode),
      unitCode: attr(qtyNode, "unitCode") || "",
      unitPrice: num((l.Price as Record<string, unknown>)?.PriceAmount),
      lineNet: num(l.LineExtensionAmount),
      vatRate: num(taxCat?.Percent),
    };
  });

  const tax = arr(inv.TaxTotal as unknown)[0] as Record<string, unknown> | undefined;
  const totals = (inv.LegalMonetaryTotal ?? {}) as Record<string, unknown>;
  return {
    format: "peppol",
    invoiceNumber: txt(inv.ID),
    issueDate: txt(inv.IssueDate),
    dueDate: txt(inv.DueDate),
    currency: txt(inv.DocumentCurrencyCode) || "ISK",
    supplierName,
    supplierKennitala,
    lines,
    totalNet: num(totals.TaxExclusiveAmount) || num(totals.LineExtensionAmount),
    totalVat: num(tax?.TaxAmount),
    totalGross: num(totals.TaxInclusiveAmount) || num(totals.PayableAmount),
  };
}
