// Ársreikningur PDF — A4 portrait: forsíða, then Rekstrarreikningur and Efnahagsreikningur, each
// with a current-year and prior-year amount column.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { STORE } from "@/lib/store";
import type { AnnualReport, CmpRow, Pair } from "@/lib/annual-report";

const isk = (n: number) => Math.round(Number(n)).toLocaleString("is-IS");
function safe(s: string) { return s.replace(/[^ -ÿ€‘’“”–—•]/g, "?"); }

export async function renderAnnualReportPdf(rep: AnnualReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48;
  const ink = rgb(0.11, 0.11, 0.11), muted = rgb(0.42, 0.45, 0.5), red = rgb(0.8, 0.1, 0.1), green = rgb(0.1, 0.5, 0.2), linec = rgb(0.85, 0.86, 0.88);
  const prevR = W - M, curR = W - M - 95;
  const prev = rep.year - 1;

  let page = doc.addPage([W, H]);
  let y = H - M;
  const T = (s: string, x: number, sz: number, f: PDFFont = font, col = ink) => page.drawText(safe(s), { x, y, size: sz, font: f, color: col });
  const TRx = (s: string, xr: number, sz: number, f: PDFFont = font, col = ink) => { const w = f.widthOfTextAtSize(safe(s), sz); page.drawText(safe(s), { x: xr - w, y, size: sz, font: f, color: col }); };
  const rule = (th = 0.4, col = linec) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: th, color: col });
  const ensure = (n: number) => { if (y < M + n) { page = doc.addPage([W, H]); y = H - M; colHeader(); } };

  function colHeader() {
    TRx(String(rep.year), curR, 8, bold, muted);
    TRx(String(prev), prevR, 8, bold, muted);
    y -= 4; rule(0.5); y -= 12;
  }
  const lines = (rows: CmpRow[], signed = false) => {
    if (!rows.length) { ensure(14); T("—", M + 44, 9, font, muted); y -= 13; return; }
    for (const r of rows) {
      ensure(14);
      T(r.account_number, M, 8, bold, muted);
      T(r.name.length > 40 ? r.name.slice(0, 40) + "…" : r.name, M + 44, 9);
      TRx(isk(r.amount), curR, 9, font, signed && r.amount < 0 ? red : ink);
      TRx(isk(r.prev), prevR, 9, font, muted);
      y -= 13;
    }
  };
  const total = (label: string, p: Pair, strong = false) => {
    ensure(16); rule(strong ? 1 : 0.5, strong ? ink : linec); y -= 12;
    T(label, M, strong ? 10 : 9, bold, strong ? ink : muted);
    TRx(isk(p.cur), curR, strong ? 10 : 9, bold, p.cur < 0 ? red : ink);
    TRx(isk(p.prev), prevR, strong ? 10 : 9, bold, muted);
    y -= strong ? 16 : 14;
  };
  const heading = (s: string) => { ensure(22); y -= 4; T(s, M, 11, bold); y -= 14; colHeader(); };
  const sub = (s: string) => { ensure(15); T(s, M, 9, bold, muted); y -= 13; };

  // ── Forsíða ────────────────────────────────────────────────
  y = H - 200;
  TRx("", prevR, 8); // no-op keep font warm
  { const s = "Ársreikningur"; const w = bold.widthOfTextAtSize(s, 26); page.drawText(s, { x: (W - w) / 2, y, size: 26, font: bold, color: ink }); }
  y -= 34; { const s = String(rep.year); const w = bold.widthOfTextAtSize(s, 22); page.drawText(s, { x: (W - w) / 2, y, size: 22, font: bold, color: red }); }
  y -= 60; { const w = bold.widthOfTextAtSize(STORE.name, 14); page.drawText(STORE.name, { x: (W - w) / 2, y, size: 14, font: bold, color: ink }); }
  y -= 18; { const s = `Kt. ${STORE.kennitala}`; const w = font.widthOfTextAtSize(s, 10); page.drawText(s, { x: (W - w) / 2, y, size: 10, font, color: muted }); }

  // ── Rekstrarreikningur ─────────────────────────────────────
  page = doc.addPage([W, H]); y = H - M;
  T(STORE.name, M, 11, bold); TRx("Rekstrarreikningur", W - M, 13, bold); y -= 16; rule(1, ink); y -= 16;
  const is = rep.income;
  heading("Rekstrartekjur"); lines(is.revenue); total("Samtals tekjur", is.revTotal);
  y -= 6; heading("Rekstrargjöld"); lines(is.expense); total("Samtals gjöld", is.expTotal);
  total("Rekstrarniðurstaða", is.operatingResult);
  if (is.financial.length) { y -= 6; heading("Fjármunatekjur og (fjármagnsgjöld)"); lines(is.financial, true); total("Fjármagnsliðir, nettó", is.finNet); }
  if (is.tax.length) { y -= 6; heading("Tekjuskattur og opinber gjöld"); lines(is.tax); total("Samtals skattur", is.taxTotal); }
  y -= 4; total(is.result.cur >= 0 ? "Hagnaður ársins" : "Tap ársins", is.result, true);

  // ── Efnahagsreikningur ─────────────────────────────────────
  page = doc.addPage([W, H]); y = H - M;
  T(STORE.name, M, 11, bold); TRx("Efnahagsreikningur", W - M, 13, bold); y -= 14;
  T(`Staða 31.12.${rep.year}`, M, 8, font, muted); y -= 14; rule(1, ink); y -= 16;
  const bs = rep.balance;
  heading("Eignir"); lines(bs.assets); total("Eignir samtals", bs.assetTotal, true);
  y -= 8; heading("Skuldir og eigið fé");
  sub("Skuldir"); lines(bs.liab); total("Skuldir samtals", bs.liabTotal);
  sub("Eigið fé"); lines(bs.equity); total("Afkoma tímabilsins", bs.result);
  total("Skuldir og eigið fé samtals", bs.rightTotal, true);
  ensure(18); y -= 2; T(bs.balanced ? "Efnahagur stemmir" : "Efnahagur stemmir EKKI", M, 9, bold, bs.balanced ? green : red);

  return doc.save();
}
