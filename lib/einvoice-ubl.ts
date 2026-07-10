// Builds a UBL 2.1 / PEPPOL-BIS (TS-236) Invoice XML for an outgoing sölureikningur.
// This is the SEND counterpart to lib/peppol.ts (which only parses incoming invoices).
// The document we generate is round-trip-checked against parsePeppolInvoice in dev.
// Amounts are in whole krónur (ISK has no minor unit). Routing identifier = kennitala (scheme 0196 = IS:KT).
import { STORE } from "@/lib/store";
import type { SaleLine } from "@/lib/accounting-queries";

export interface EinvoiceParty {
  name: string;
  kennitala: string;            // 10 digits, no dash
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  vatId?: string | null;        // BT-31 VAT registration (VSK-nr). Set for the SELLER only; ISO-prefixed on output.
}
export interface EinvoiceInput {
  invoiceNumber: string;
  issueDate: string;            // YYYY-MM-DD
  dueDate?: string;             // YYYY-MM-DD
  currency?: string;            // default ISK
  note?: string;
  buyerReference?: string;      // BT-10; PEPPOL-EN16931-R003 requires it. Falls back to invoiceNumber.
  customer: EinvoiceParty;
  lines: SaleLine[];            // gross-based (unit_price_gross / line_total / vat_rate)
}

const ISO = "urn:oasis:names:specification:ubl:schema:xsd:";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kt = (s: string) => (s || "").replace(/\D/g, "");      // digits only
const round = (n: number) => Math.round(n);                   // whole ISK
const r2 = (n: number) => Math.round(n * 100) / 100;          // unit prices keep 2 dp

interface Computed { lineNo: number; name: string; sellerId: string; gtin: string; qty: number; unitCode: string; unitNet: number; net: number; vat: number; rate: number; gross: number }

function computeLines(lines: SaleLine[]): Computed[] {
  return lines.map((l, i) => {
    const qty = Number(l.quantity) || 0;
    const gross = Number(l.line_total) || 0;
    const rate = Number(l.vat_rate) || 0;
    const net = round(gross / (1 + rate / 100));
    const vat = gross - net;
    return {
      lineNo: l.line_no ?? i + 1,
      name: l.name || "Vara",
      sellerId: l.product_number || "",
      gtin: "",
      qty: qty || 1,
      unitCode: "EA",
      unitNet: r2(qty ? net / qty : net),
      net, vat, rate, gross,
    };
  });
}

function partyXml(tag: string, p: EinvoiceParty, currency: string): string {
  const id = kt(p.kennitala);
  // BT-31 seller VAT id: ISO 3166-1 alpha-2 prefixed (BR-CO-09). Distinct from the kennitala; no schemeID.
  const vat = p.vatId
    ? (/^IS/i.test(String(p.vatId)) ? String(p.vatId).toUpperCase().replace(/\s+/g, "") : "IS" + String(p.vatId).replace(/\D/g, ""))
    : "";
  return (
    `<cac:${tag}><cac:Party>` +
    (id ? `<cbc:EndpointID schemeID="0196">${esc(id)}</cbc:EndpointID>` : "") +
    (id ? `<cac:PartyIdentification><cbc:ID schemeID="0196">${esc(id)}</cbc:ID></cac:PartyIdentification>` : "") +
    `<cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName>` +
    `<cac:PostalAddress>` +
    (p.address ? `<cbc:StreetName>${esc(p.address)}</cbc:StreetName>` : "") +
    (p.city ? `<cbc:CityName>${esc(p.city)}</cbc:CityName>` : "") +
    (p.postalCode ? `<cbc:PostalZone>${esc(p.postalCode)}</cbc:PostalZone>` : "") +
    `<cac:Country><cbc:IdentificationCode>IS</cbc:IdentificationCode></cac:Country>` +
    `</cac:PostalAddress>` +
    // PartyTaxScheme sits after PostalAddress and before PartyLegalEntity in UBL PartyType order.
    (vat ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : "") +
    (id ? `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName><cbc:CompanyID schemeID="0196">${esc(id)}</cbc:CompanyID></cac:PartyLegalEntity>` : "") +
    `</cac:Party></cac:${tag}>`
  );
}

export interface BuiltInvoice { xml: string; totalNet: number; totalVat: number; totalGross: number }

export function buildInvoiceUbl(inp: EinvoiceInput): BuiltInvoice {
  const currency = inp.currency || "ISK";
  const cur = (_n: number) => `currencyID="${currency}"`;
  const lines = computeLines(inp.lines);

  const totalNet = lines.reduce((s, l) => s + l.net, 0);
  const totalVat = lines.reduce((s, l) => s + l.vat, 0);
  const totalGross = totalNet + totalVat;

  // VAT subtotals grouped by rate
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of lines) {
    const g = byRate.get(l.rate) ?? { taxable: 0, tax: 0 };
    g.taxable += l.net; g.tax += l.vat; byRate.set(l.rate, g);
  }
  const taxSubtotals = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, g]) =>
    `<cac:TaxSubtotal>` +
    `<cbc:TaxableAmount ${cur(g.taxable)}>${round(g.taxable)}</cbc:TaxableAmount>` +
    `<cbc:TaxAmount ${cur(g.tax)}>${round(g.tax)}</cbc:TaxAmount>` +
    `<cac:TaxCategory><cbc:ID>${rate > 0 ? "S" : "Z"}</cbc:ID><cbc:Percent>${rate}</cbc:Percent>` +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`
  ).join("");

  const lineXml = lines.map((l) =>
    `<cac:InvoiceLine>` +
    `<cbc:ID>${l.lineNo}</cbc:ID>` +
    `<cbc:InvoicedQuantity unitCode="${esc(l.unitCode)}">${l.qty}</cbc:InvoicedQuantity>` +
    `<cbc:LineExtensionAmount ${cur(l.net)}>${l.net}</cbc:LineExtensionAmount>` +
    `<cac:Item><cbc:Name>${esc(l.name)}</cbc:Name>` +
    (l.sellerId ? `<cac:SellersItemIdentification><cbc:ID>${esc(l.sellerId)}</cbc:ID></cac:SellersItemIdentification>` : "") +
    `<cac:ClassifiedTaxCategory><cbc:ID>${l.rate > 0 ? "S" : "Z"}</cbc:ID><cbc:Percent>${l.rate}</cbc:Percent>` +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>` +
    // Price per BaseQuantity: PriceAmount = whole-ISK line net, BaseQuantity = qty, so
    // InvoicedQuantity × PriceAmount ÷ BaseQuantity == LineExtensionAmount exactly (PEPPOL-EN16931-R120,
    // no rounding drift on multi-quantity lines).
    `<cac:Price><cbc:PriceAmount ${cur(l.net)}>${l.net}</cbc:PriceAmount><cbc:BaseQuantity unitCode="${esc(l.unitCode)}">${l.qty}</cbc:BaseQuantity></cac:Price>` +
    `</cac:InvoiceLine>`
  ).join("");

  const supplier: EinvoiceParty = {
    name: STORE.name, kennitala: STORE.kennitala,
    address: STORE.address, postalCode: STORE.postal.split(" ")[0], city: STORE.postal.split(" ").slice(1).join(" "),
    vatId: STORE.vskNr,   // BT-31 seller VAT id (VSK-nr) — required for standard-rated ('S') lines (BR-S-02)
  };

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Invoice xmlns="${ISO}Invoice-2" ` +
    `xmlns:cac="${ISO}CommonAggregateComponents-2" ` +
    `xmlns:cbc="${ISO}CommonBasicComponents-2">` +
    `<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>` +
    `<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>` +
    `<cbc:ID>${esc(inp.invoiceNumber)}</cbc:ID>` +
    `<cbc:IssueDate>${esc(inp.issueDate)}</cbc:IssueDate>` +
    // DueDate always present (defaults to IssueDate) so a missing due date can never trip BR-CO-25.
    `<cbc:DueDate>${esc(inp.dueDate || inp.issueDate)}</cbc:DueDate>` +
    `<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>` +
    (inp.note ? `<cbc:Note>${esc(inp.note)}</cbc:Note>` : "") +
    `<cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>` +
    // BuyerReference (BT-10) — mandatory under PEPPOL-EN16931-R003. Slot: after DocumentCurrencyCode,
    // before AccountingSupplierParty. Non-empty fallback to the invoice number (an empty element still fails R003).
    `<cbc:BuyerReference>${esc(inp.buyerReference || inp.invoiceNumber)}</cbc:BuyerReference>` +
    partyXml("AccountingSupplierParty", supplier, currency) +
    partyXml("AccountingCustomerParty", inp.customer, currency) +
    `<cac:TaxTotal><cbc:TaxAmount ${cur(totalVat)}>${round(totalVat)}</cbc:TaxAmount>${taxSubtotals}</cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal>` +
    `<cbc:LineExtensionAmount ${cur(totalNet)}>${round(totalNet)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxExclusiveAmount ${cur(totalNet)}>${round(totalNet)}</cbc:TaxExclusiveAmount>` +
    `<cbc:TaxInclusiveAmount ${cur(totalGross)}>${round(totalGross)}</cbc:TaxInclusiveAmount>` +
    `<cbc:PayableAmount ${cur(totalGross)}>${round(totalGross)}</cbc:PayableAmount>` +
    `</cac:LegalMonetaryTotal>` +
    lineXml +
    `</Invoice>`;

  return { xml, totalNet, totalVat, totalGross };
}
