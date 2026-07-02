// Prófjöfnuður (trial balance) PDF — A4 landscape, grouped by account type, with
// opening / debet / kredit / movement / closing columns and a bottom summary.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { STORE } from "@/lib/store";
import type { TrialBalance, TBSummary } from "@/lib/trial-balance";

const isk = (n: number) => Math.round(Number(n)).toLocaleString("is-IS");
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };
function safe(s: string) { return s.replace(/[^ -ÿ€‘’“”–—•]/g, "?"); }

export async function renderTrialBalancePdf(tb: TrialBalance, from: string, to: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 36;
  const ink = rgb(0.11, 0.11, 0.11), muted = rgb(0.42, 0.45, 0.5), red = rgb(0.8, 0.1, 0.1), green = rgb(0.1, 0.5, 0.2), linec = rgb(0.85, 0.86, 0.88);
  const c = { numX: M, nameX: M + 46, upphafR: 455, debetR: 545, kreditR: 635, hreyfR: 725, lokR: W - M };

  let page = doc.addPage([W, H]);
  let y = H - M;
  const T = (p: PDFPage, s: string, x: number, yy: number, sz: number, f: PDFFont = font, col = ink) => p.drawText(safe(s), { x, y: yy, size: sz, font: f, color: col });
  const TR = (p: PDFPage, s: string, xr: number, yy: number, sz: number, f: PDFFont = font, col = ink) => { const w = f.widthOfTextAtSize(safe(s), sz); p.drawText(safe(s), { x: xr - w, y: yy, size: sz, font: f, color: col }); };
  const amt = (v: number, xr: number, f: PDFFont = font) => TR(page, isk(v), xr, y, 8, f, v < -0.005 ? red : ink);
  const rule = (th = 0.4, col = linec) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: th, color: col });

  function colHeader() {
    rule(1, ink); y -= 11;
    T(page, "Lykill", c.numX, y, 8, bold, muted);
    TR(page, "Staða í upphafi", c.upphafR, y, 8, bold, muted);
    TR(page, "Debet", c.debetR, y, 8, bold, muted);
    TR(page, "Kredit", c.kreditR, y, 8, bold, muted);
    TR(page, "Hreyfing", c.hreyfR, y, 8, bold, muted);
    TR(page, "Staða í lok", c.lokR, y, 8, bold, muted);
    y -= 4; rule(0.5); y -= 12;
  }
  function ensure(n: number) { if (y < M + n) { page = doc.addPage([W, H]); y = H - M; colHeader(); } }

  // Header
  T(page, STORE.name, M, y, 11, bold);
  TR(page, "Prófjöfnuður", W - M, y, 13, bold);
  y -= 14;
  T(page, `Kt. ${STORE.kennitala}`, M, y, 8, font, muted);
  TR(page, `Tímabil: ${fmtD(from)} – ${fmtD(to)}  ·  Fjöldi lykla: ${tb.count}`, W - M, y, 8, font, muted);
  y -= 16; colHeader();

  for (const g of tb.groups) {
    ensure(40);
    T(page, `${g.label}  (${g.count} lyklar)`, M, y, 9, bold);
    TR(page, `Upphaf ${isk(g.opening)}    Hreyfing ${isk(g.movement)}    Lok ${isk(g.closing)}`, W - M, y, 8, font, muted);
    y -= 14;
    for (const a of g.accounts) {
      ensure(16);
      T(page, a.account_number, c.numX, y, 8, bold);
      T(page, a.name.length > 42 ? a.name.slice(0, 42) + "…" : a.name, c.nameX, y, 8, font, muted);
      amt(a.opening, c.upphafR); amt(a.period_debit, c.debetR); amt(a.period_credit, c.kreditR);
      amt(a.movement, c.hreyfR); amt(a.closing, c.lokR, bold);
      y -= 4; rule(); y -= 11;
    }
    ensure(16);
    T(page, `Samtals ${g.label}`, c.numX, y, 8, bold);
    amt(g.opening, c.upphafR, bold); amt(g.period_debit, c.debetR, bold); amt(g.period_credit, c.kreditR, bold);
    amt(g.movement, c.hreyfR, bold); amt(g.closing, c.lokR, bold);
    y -= 18;
  }

  // Bottom summary
  ensure(66);
  rule(1, ink); y -= 14;
  const sumLine = (label: string, s: TBSummary) => {
    T(page, label, M, y, 8, bold);
    TR(page, `Debet ${isk(s.debet)}`, 470, y, 8);
    TR(page, `Kredit ${isk(s.kredit)}`, 640, y, 8);
    TR(page, `Mismunur ${isk(s.diff)}`, W - M, y, 8, bold, Math.round(s.diff) === 0 ? green : red);
    y -= 14;
  };
  sumLine("Staða í upphafi", tb.opening);
  sumLine("Hreyfingar á tímabili", tb.period);
  sumLine("Staða í lok", tb.closing);

  return doc.save();
}
