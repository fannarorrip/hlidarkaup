// Rekstrarreikningur (income statement) PDF — A4 portrait, two columns (heiti | upphæð),
// sections for tekjur / gjöld / fjármagnsliðir / skattur with subtotals + final result.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { STORE } from "@/lib/store";
import type { IncomeStatement, ISRow } from "@/lib/income-statement";

const isk = (n: number) => Math.round(Number(n)).toLocaleString("is-IS");
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };
function safe(s: string) { return s.replace(/[^ -ÿ€‘’“”–—•]/g, "?"); }

export async function renderIncomeStatementPdf(is: IncomeStatement, from: string, to: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48;
  const ink = rgb(0.11, 0.11, 0.11), muted = rgb(0.42, 0.45, 0.5), red = rgb(0.8, 0.1, 0.1), green = rgb(0.1, 0.5, 0.2), linec = rgb(0.85, 0.86, 0.88);
  const amtR = W - M;

  let page = doc.addPage([W, H]);
  let y = H - M;
  const T = (s: string, x: number, sz: number, f: PDFFont = font, col = ink) => page.drawText(safe(s), { x, y, size: sz, font: f, color: col });
  const TR = (s: string, sz: number, f: PDFFont = font, col = ink) => { const w = f.widthOfTextAtSize(safe(s), sz); page.drawText(safe(s), { x: amtR - w, y, size: sz, font: f, color: col }); };
  const rule = (th = 0.4, col = linec) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: th, color: col });
  const ensure = (n: number) => { if (y < M + n) { page = doc.addPage([W, H]); y = H - M; } };

  // Header
  T(STORE.name, M, 12, bold);
  TR("Rekstrarreikningur", 14, bold);
  y -= 15;
  T(`Kt. ${STORE.kennitala}`, M, 8, font, muted);
  TR(`Tímabil: ${fmtD(from)} – ${fmtD(to)}`, 8, font, muted);
  y -= 16; rule(1, ink); y -= 16;

  const line = (r: ISRow, signed = false) => {
    ensure(16);
    T(`${r.account_number}`, M, 8, bold, muted);
    T(r.name.length > 46 ? r.name.slice(0, 46) + "…" : r.name, M + 44, 9);
    TR(isk(r.amount), 9, font, signed && r.amount < 0 ? red : ink);
    y -= 14;
  };
  const section = (title: string, rows: ISRow[], total: number, signed = false) => {
    ensure(24);
    T(title, M, 10, bold); y -= 15;
    if (!rows.length) { T("—", M + 44, 9, font, muted); y -= 14; }
    else rows.forEach((r) => line(r, signed));
    ensure(18);
    y -= 2; rule(); y -= 12;
    T(`Samtals ${title.toLowerCase()}`, M, 9, bold, muted);
    TR(isk(total), 9, bold, total < 0 ? red : ink);
    y -= 20;
  };
  const subtotal = (label: string, value: number, big = false) => {
    ensure(20);
    rule(0.8, ink); y -= 14;
    T(label, M, big ? 11 : 10, bold);
    TR(isk(value), big ? 12 : 10, bold, value < 0 ? red : ink);
    y -= 18;
  };

  section("Rekstrartekjur", is.revenue, is.revTotal);
  section("Rekstrargjöld", is.expense, is.expTotal);
  subtotal("Rekstrarniðurstaða", is.operatingResult);

  if (is.financial.length) {
    section("Fjármunatekjur og (fjármagnsgjöld)", is.financial, is.finNet, true);
    subtotal("Hagnaður fyrir skatt", is.profitBeforeTax);
  }
  if (is.tax.length) section("Tekjuskattur og opinber gjöld", is.tax, is.taxTotal);

  ensure(24);
  rule(1.2, ink); y -= 16;
  T(is.result >= 0 ? "Hagnaður" : "Tap", M, 12, bold);
  TR(isk(is.result), 13, bold, is.result >= 0 ? green : red);

  return doc.save();
}
