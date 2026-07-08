// A4 accounting-voucher (fylgiskjal) PDF for ANY voucher — sale, purchase, journal, payroll.
// Renders the double-entry lines (what the detail page shows) so every fylgiskjal is printable,
// including which register (kassi) rang a sale. pdf-lib (pure JS) — runs in Next route handlers.
import fs from "fs";
import path from "path";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { STORE } from "@/lib/store";
import { dags, vType, STATUS_LABEL } from "@/lib/format";
import { registerName } from "@/lib/registers";

let _logoBytes: Buffer | null | undefined;
function logoBytes(): Buffer | null {
  if (_logoBytes !== undefined) return _logoBytes;
  try { _logoBytes = fs.readFileSync(path.join(process.cwd(), "public", STORE.logoFile)); }
  catch { _logoBytes = null; }
  return _logoBytes;
}

export interface VoucherPdfLine {
  line_no: number; account_number: string; account_name: string;
  debit: string; credit: string; vat_code: string | null; description: string | null;
}
export interface VoucherPdfInput {
  voucher: {
    series_code: string; voucher_number: string; voucher_date: string; voucher_type: string;
    status: string; description: string | null; external_reference: string | null;
    source?: string | null; register_id?: string | null; supplier_name?: string | null;
    posted_by?: string | null; posted_at?: string | null;
  };
  lines: VoucherPdfLine[];
}

const isk = (n: number) => Math.round(n).toLocaleString("is-IS") + " kr.";
// eslint-disable-next-line no-control-regex
const safe = (s: string) => s.replace(/[^ -ÿ€‘’“”–—•]/g, "?");

export async function renderVoucherPdf({ voucher: v, lines }: VoucherPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const M = 40;
  const right = width - M;
  const ink = rgb(0.11, 0.11, 0.11);
  const muted = rgb(0.42, 0.45, 0.5);
  const lineCol = rgb(0.88, 0.89, 0.9);

  const text = (s: string, x: number, y: number, size: number, f: PDFFont = font, color = ink) =>
    page.drawText(safe(s), { x, y, size, font: f, color });
  const textR = (s: string, xRight: number, y: number, size: number, f: PDFFont = font, color = ink) =>
    page.drawText(safe(s), { x: xRight - f.widthOfTextAtSize(safe(s), size), y, size, font: f, color });
  const hline = (y: number, color = lineCol, thickness = 1) =>
    page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness, color });
  const clip = (s: string, size: number, max: number, f: PDFFont = font) => {
    s = safe(s);
    if (f.widthOfTextAtSize(s, size) <= max) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > max) s = s.slice(0, -1);
    return s + "…";
  };

  let y = height - M;

  // ── Header: logo + "Fylgiskjal" ───────────────────────────────────────────
  let metaTop = y - 14;
  const lb = logoBytes();
  let logoDrawn = false;
  if (lb) {
    try {
      const img = await doc.embedPng(lb);
      const maxH = 46, maxW = 190;
      let scale = maxH / img.height;
      if (img.width * scale > maxW) scale = maxW / img.width;
      page.drawImage(img, { x: M, y: y - img.height * scale, width: img.width * scale, height: img.height * scale });
      metaTop = y - img.height * scale - 8;
      logoDrawn = true;
    } catch { /* text fallback */ }
  }
  if (!logoDrawn) { text(STORE.name, M, y - 14, 18, bold); metaTop = y - 28; }
  textR("Fylgiskjal", right, y - 11, 15, bold);

  let my = metaTop;
  text(STORE.name, M, my, 10, bold); my -= 13;
  for (const ln of [`${STORE.address} · ${STORE.postal}`, `Kt. ${STORE.kennitala} · VSK nr. ${STORE.vskNr}`]) {
    text(ln, M, my, 9, font, muted); my -= 12;
  }

  const number = `${v.series_code}-${String(v.voucher_number).padStart(6, "0")}`;
  let dy = y - 28;
  for (const ln of [`Nr. ${number}`, `Dags. ${dags(v.voucher_date)}`, vType(v.voucher_type), STATUS_LABEL[v.status] ?? v.status]) {
    textR(ln, right, dy, 9, font, muted); dy -= 12;
  }

  y = Math.min(my, dy) - 12;

  // ── Meta strip (register / supplier / reference / posted) ─────────────────
  const meta: [string, string][] = [];
  const rn = registerName(v.register_id);
  if (rn) meta.push(["Kassi", rn]);
  if (v.supplier_name) meta.push(["Lánadrottinn", v.supplier_name]);
  if (v.external_reference) meta.push(["Reikningsnr.", v.external_reference]);
  if (v.description) meta.push(["Lýsing", v.description]);
  if (v.posted_by) meta.push(["Bókað af", v.posted_by + (v.posted_at ? ` · ${dags(v.posted_at)}` : "")]);
  for (const [label, value] of meta) {
    text(label, M, y, 8, bold, muted);
    text(clip(value, 10, right - M - 110, font), M + 105, y, 10);
    y -= 15;
  }
  y -= 6;

  // ── Ledger-entry table ────────────────────────────────────────────────────
  const debitR = right - 90;
  const creditR = right;
  const acctX = M;
  const nameX = M + 48;
  const vatX = right - 250;
  const nameMax = vatX - nameX - 8;

  text("Lykill", acctX, y, 9, bold, muted);
  text("Heiti / lýsing", nameX, y, 9, bold, muted);
  text("VSK", vatX, y, 9, bold, muted);
  textR("Debet", debitR, y, 9, bold, muted);
  textR("Kredit", creditR, y, 9, bold, muted);
  y -= 5;
  hline(y, ink, 1);
  y -= 14;

  let totalDebit = 0, totalCredit = 0;
  for (const l of lines) {
    const d = Number(l.debit), c = Number(l.credit);
    totalDebit += d; totalCredit += c;
    const label = l.description ? `${l.account_name} — ${l.description}` : l.account_name;
    text(l.account_number, acctX, y, 9, font);
    text(clip(label, 9, nameMax, font), nameX, y, 9);
    if (l.vat_code) text(l.vat_code, vatX, y, 9, font, muted);
    if (d) textR(isk(d), debitR, y, 9);
    if (c) textR(isk(c), creditR, y, 9);
    y -= 6;
    hline(y);
    y -= 14;
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  y -= 2;
  const balanced = Math.round(totalDebit) === Math.round(totalCredit);
  text(balanced ? "Í jafnvægi" : "EKKI í jafnvægi", M, y, 10, bold, balanced ? rgb(0.1, 0.5, 0.2) : rgb(0.8, 0.1, 0.1));
  textR(isk(totalDebit), debitR, y, 11, bold);
  textR(isk(totalCredit), creditR, y, 11, bold);

  // ── Footer ────────────────────────────────────────────────────────────────
  const cw = font.widthOfTextAtSize(safe(STORE.complianceNote), 7.5);
  page.drawText(safe(STORE.complianceNote), { x: (width - cw) / 2, y: 42, size: 7.5, font, color: muted });

  return doc.save();
}
