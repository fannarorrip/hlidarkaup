// Shared invoice-reading engine. Reads one or more documents (PDF / image /
// Excel / CSV) with Claude against the company's chart of accounts and returns a
// balanced dagbók entry. Used by both the manual "Lesa skjal" reader
// (app/api/skraning/extract) and the email inbox poller (lib/email-invoices).
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { getPostableAccounts } from "@/lib/accounting-queries";
import type { ParsedInvoice } from "@/lib/peppol";

const ICELANDIC_NUMBER_RULE =
  '- ÍSLENSKT TÖLUSNIÐ: punktur (.) er ÞÚSUNDASKIL, komma (,) er aukastafir. "37.576,88" = 37576.88; "253.744" = 253744. Ruglaðu ALDREI saman.\n' +
  '- Giskaðu ALDREI á tölur — ef tala er óljós, hafðu hana 0.\n';

export interface ExtractFile { name: string; mime: string; data: string } // data = base64 or data-url
export interface ExtractLine { account: string; description: string; vatRate: number; amount: number }
export interface ExtractResult {
  supplier: string;
  supplierKennitala: string;   // seller's kennitala (digits only), "" if not visible
  invoiceNumber: string;
  date: string;            // YYYY-MM-DD
  lines: ExtractLine[];    // signed amount: + = debet, − = kredit; sums to 0
  isInvoice?: boolean;     // only set when classify: true
  confidence?: number;     // 0..1, only set when classify: true
}

export function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const stripDataUrl = (d: string) => String(d).replace(/^data:.*?base64,/, "");

/** Build Anthropic content blocks from the supplied documents. */
function toContentBlocks(files: ExtractFile[]): Record<string, unknown>[] {
  const content: Record<string, unknown>[] = [];
  for (const f of files.slice(0, 10)) {
    const mime = (f.mime || "").toLowerCase();
    const b64 = stripDataUrl(f.data);
    if (mime.includes("pdf")) {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
    } else if (mime.startsWith("image/")) {
      content.push({ type: "image", source: { type: "base64", media_type: mime === "image/jpg" ? "image/jpeg" : mime, data: b64 } });
    } else if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv") || /\.(xlsx?|csv)$/i.test(f.name)) {
      try {
        const wb = XLSX.read(Buffer.from(b64, "base64"), { type: "buffer" });
        const csv = wb.SheetNames.map((s) => `# ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`).join("\n\n");
        content.push({ type: "text", text: `Excel/CSV skjal "${f.name}":\n${csv.slice(0, 20000)}` });
      } catch { content.push({ type: "text", text: `(Gat ekki lesið skjal ${f.name})` }); }
    } else {
      try { content.push({ type: "text", text: `Skjal "${f.name}":\n${Buffer.from(b64, "base64").toString("utf8").slice(0, 20000)}` }); } catch { /* skip */ }
    }
  }
  return content;
}

/**
 * Read documents and produce a balanced dagbók entry.
 * @throws if ANTHROPIC_API_KEY is missing, no usable files, or the model output can't be parsed.
 */
export async function extractInvoice(opts: { instructions?: string; files: ExtractFile[]; classify?: boolean }): Promise<ExtractResult> {
  if (!hasAnthropicKey()) throw new Error("ANTHROPIC_API_KEY vantar í stillingar (.env.local).");
  const files = Array.isArray(opts.files) ? opts.files : [];
  if (!files.length) throw new Error("Vantar skjal");
  const instructions = (opts.instructions ?? "").toString().slice(0, 2000);
  const classify = !!opts.classify;

  const content = toContentBlocks(files);

  const accounts = await getPostableAccounts(["tekjur", "gjold", "eign", "skuld", "eigid_fe"]);
  const chart = accounts.map((a) => `${a.account_number}  ${a.name}`).join("\n");

  content.push({
    type: "text",
    text:
      (instructions ? `Leiðbeiningar frá notanda: ${instructions}\n\n` : "") +
      (classify
        ? "Þetta skjal kom sem viðhengi í tölvupósti. Metið FYRST hvort þetta sé í raun innkaupa-/sölureikningur (reikningur) sem á að bókfæra — EKKI fréttabréf, samningur, kvittun fyrir greiðslu, almennt bréf eða annað. Settu \"isInvoice\" satt/ósatt eftir því og \"confidence\" 0–1. Ef \"isInvoice\" er ósatt má \"lines\" vera tómt.\n\n"
        : "") +
      "Lestu meðfylgjandi skjöl og búðu til tvíhliða dagbókarfærslu. Skilaðu AÐEINS gildu JSON og engri skýringu:\n" +
      (classify
        ? '{"isInvoice": boolean, "confidence": number, "supplier": string, "supplierKennitala": string, "invoiceNumber": string, "date": "YYYY-MM-DD", "lines": [{"account": string, "description": string, "vatRate": 24|11|0, "amount": number}]}\n'
        : '{"supplier": string, "supplierKennitala": string, "invoiceNumber": string, "date": "YYYY-MM-DD", "lines": [{"account": string, "description": string, "vatRate": 24|11|0, "amount": number}]}\n') +
      '- "supplier" = nafn SELJANDA (útgefanda reiknings), EKKI kaupanda (Hlíðarkaup/Raðhús).\n' +
      '- "supplierKennitala" = kennitala SELJANDA (10 tölustafir, án bandstriks); tóm ef ekki sýnileg.\n' +
      '- "account" = lykilnúmer ÚR lyklaskránni að ofan (veldu réttu lyklana skv. leiðbeiningum).\n' +
      '- "amount" = heilar krónur; JÁKVÆÐ tala = DEBET, NEIKVÆÐ tala = KREDIT.\n' +
      '- "vatRate" = vsk-þrep línunnar (24, 11 eða 0); 0 ef ekkert vsk.\n' +
      '- "description" = stutt lýsing; fyrir vörulínur, heiti vörunnar.\n' +
      '- ÍSLENSKT TÖLUSNIÐ: punktur (.) er ÞÚSUNDASKIL, komma (,) er aukastafir. Dæmi: "37.576,88" = 37576.88; "253.744" = 253744 (EKKI 253,744). Ruglaðu þessu ALDREI saman.\n' +
      '- DAGSETNING: notaðu dagsetningu reikningsins sjálfs (t.d. „Dagsetning reiknings“ / útgáfudagur), EKKI prentdagsetningu eða tímastimpil efst á síðunni.\n' +
      '- UPPHÆÐIR: notaðu HEILDAR-nettóupphæð og heildar-VSK af reikningnum (t.d. „Nettóupphæð“ / „Virðisaukaskattur“ / „Samtala“), EKKI staka undirsamtölu eins og eitt vsk-þrep. Giskaðu ALDREI á tölur — ef tala er óljós, hafðu hana 0.\n' +
      '- Færslan VERÐUR að stemma: summa allra "amount" = 0.\n' +
      "Ef notandi gefur engar sérstakar leiðbeiningar, bókaðu innkaupareikning hefðbundið: vörukaup á gjaldalykla eftir vsk-þrepi (debet), innskattur á innskattslykla (debet) og mótfærsla á lánadrottna (kredit).",
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.SKRANING_MODEL || "claude-haiku-4-5-20251001";
  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    system:
      "Þú ert íslenskur bókari sem bókar fylgiskjöl í tvíhliða bókhald. Bókhaldslyklaskrá fyrirtækisins (lykilnúmer og heiti):\n" +
      chart + "\n\nNotaðu EINGÖNGU lykilnúmer úr þessari skrá.",
    messages: [{ role: "user", content: content as unknown as Anthropic.MessageParam["content"] }],
  });
  const block = msg.content.find((c) => c.type === "text") as { text: string } | undefined;
  const data = JSON.parse((block?.text || "").replace(/```json|```/g, "").trim());

  return {
    supplier: String(data.supplier ?? ""),
    supplierKennitala: String(data.supplierKennitala ?? "").replace(/\D/g, ""),
    invoiceNumber: String(data.invoiceNumber ?? ""),
    date: String(data.date ?? ""),
    lines: Array.isArray(data.lines) ? data.lines : [],
    ...(classify ? { isInvoice: data.isInvoice !== false, confidence: Number(data.confidence) || 0 } : {}),
  };
}

/**
 * Read a purchase invoice PDF/image and return its PRODUCT lines (for goods receipt),
 * normalized to the same shape as the PEPPOL parser. Lower confidence than PEPPOL → the
 * móttaka screen requires human confirmation of qty/product matches.
 */
export async function extractReceiptLines(opts: { files: ExtractFile[] }): Promise<ParsedInvoice> {
  if (!hasAnthropicKey()) throw new Error("ANTHROPIC_API_KEY vantar í stillingar (.env.local).");
  const files = Array.isArray(opts.files) ? opts.files : [];
  if (!files.length) throw new Error("Vantar skjal");
  const content = toContentBlocks(files);
  content.push({
    type: "text",
    text:
      "Lestu þennan innkaupareikning og skilaðu VÖRULÍNUM hans (ekki bókhaldslyklum). Skilaðu AÐEINS gildu JSON og engri skýringu:\n" +
      '{"supplier": string, "supplierKennitala": string, "invoiceNumber": string, "date": "YYYY-MM-DD", "currency": string, "lines": [{"description": string, "supplierItemId": string, "gtin": string, "qty": number, "unitCode": string, "unitPrice": number, "lineNet": number, "vatRate": 24|11|0}], "totalNet": number, "totalVat": number, "totalGross": number}\n' +
      '- EIN lína fyrir hverja vöru á reikningnum: heiti vöru, vörunúmer seljanda, strikamerki (GTIN/EAN) ef sýnilegt, MAGN (fjöldi eininga), einingaverð án vsk, línuupphæð án vsk, vsk-þrep (24/11/0).\n' +
      '- "supplier" = nafn SELJANDA; "supplierKennitala" = kennitala seljanda (10 tölustafir, án bandstriks).\n' +
      ICELANDIC_NUMBER_RULE,
  });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.SKRANING_MODEL || "claude-haiku-4-5-20251001";
  const msg = await client.messages.create({
    model, max_tokens: 4096,
    system: "Þú lest innkaupareikninga og skilar vörulínum nákvæmlega sem JSON.",
    messages: [{ role: "user", content: content as unknown as Anthropic.MessageParam["content"] }],
  });
  const block = msg.content.find((c) => c.type === "text") as { text: string } | undefined;
  const d = JSON.parse((block?.text || "").replace(/```json|```/g, "").trim());
  return {
    format: "pdf",
    invoiceNumber: String(d.invoiceNumber ?? ""), issueDate: String(d.date ?? ""), dueDate: "",
    currency: String(d.currency ?? "ISK"),
    supplierName: String(d.supplier ?? ""), supplierKennitala: String(d.supplierKennitala ?? "").replace(/\D/g, ""),
    lines: (Array.isArray(d.lines) ? d.lines : []).map((l: Record<string, unknown>, i: number) => ({
      lineNo: i + 1, description: String(l.description ?? ""), supplierItemId: String(l.supplierItemId ?? ""),
      gtin: String(l.gtin ?? "").replace(/\D/g, ""), qty: Number(l.qty) || 0, unitCode: String(l.unitCode ?? ""),
      unitPrice: Number(l.unitPrice) || 0, lineNet: Number(l.lineNet) || 0, vatRate: Number(l.vatRate) || 0,
    })),
    totalNet: Number(d.totalNet) || 0, totalVat: Number(d.totalVat) || 0, totalGross: Number(d.totalGross) || 0,
  };
}

export interface StatementLine { invoiceNumber: string; date: string; amount: number }
export interface StatementExtract { supplier: string; supplierKennitala: string; statementDate: string; closingBalance: number; lines: StatementLine[] }

/** Read a supplier reconciliation statement (afstemmingalisti) → the supplier's list of
 *  invoices to us (number, date, amount) + closing balance. For lánadrottna-afstemming. */
export async function extractStatement(opts: { files: ExtractFile[] }): Promise<StatementExtract> {
  if (!hasAnthropicKey()) throw new Error("ANTHROPIC_API_KEY vantar í stillingar (.env.local).");
  const files = Array.isArray(opts.files) ? opts.files : [];
  if (!files.length) throw new Error("Vantar skjal");
  const content = toContentBlocks(files);
  content.push({
    type: "text",
    text:
      "Þetta er AFSTEMMINGALISTI / yfirlit frá lánadrottni (birgi) — listi yfir reikninga sem hann hefur gefið út á OKKUR og stöðu. Skilaðu AÐEINS gildu JSON og engri skýringu:\n" +
      '{"supplier": string, "supplierKennitala": string, "statementDate": "YYYY-MM-DD", "closingBalance": number, "lines": [{"invoiceNumber": string, "date": "YYYY-MM-DD", "amount": number}]}\n' +
      '- "supplier" = nafn LÁNADROTTINS (útgefanda yfirlitsins); "supplierKennitala" = kennitala hans (10 tölustafir, án bandstriks).\n' +
      '- EIN lína fyrir hvern reikning á yfirlitinu: reikningsnúmer, dagsetning, heildarupphæð reikningsins með vsk.\n' +
      '- "closingBalance" = lokastaða / heildarskuld skv. yfirlitinu.\n' +
      ICELANDIC_NUMBER_RULE,
  });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.SKRANING_MODEL || "claude-haiku-4-5-20251001";
  const msg = await client.messages.create({
    model, max_tokens: 4096,
    system: "Þú lest afstemmingalista frá birgjum og skilar reikningalínum nákvæmlega sem JSON.",
    messages: [{ role: "user", content: content as unknown as Anthropic.MessageParam["content"] }],
  });
  const block = msg.content.find((c) => c.type === "text") as { text: string } | undefined;
  const d = JSON.parse((block?.text || "").replace(/```json|```/g, "").trim());
  return {
    supplier: String(d.supplier ?? ""),
    supplierKennitala: String(d.supplierKennitala ?? "").replace(/\D/g, ""),
    statementDate: String(d.statementDate ?? ""),
    closingBalance: Number(d.closingBalance) || 0,
    lines: (Array.isArray(d.lines) ? d.lines : []).map((l: Record<string, unknown>) => ({
      invoiceNumber: String(l.invoiceNumber ?? ""), date: String(l.date ?? ""), amount: Number(l.amount) || 0,
    })),
  };
}
