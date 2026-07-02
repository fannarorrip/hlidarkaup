// Efnahagsreikningur (balance sheet) PDF — A4 portrait: Eignir, then Skuldir + Eigið fé (incl.
// afkoma tímabilsins), with totals and the balance check.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { STORE } from "@/lib/store";
import type { BalanceSheet, BSRow } from "@/lib/balance-sheet";

const isk = (n: number) => Math.round(Number(n)).toLocaleString("is-IS");
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };
function safe(s: string) { return s.replace(/[^ -ÿ€‘’“”–—•]/g, "?"); }

export async function renderBalanceSheetPdf(bs: BalanceSheet, asOf: string): Promise<Uint8Array> {
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

  const rows = (items: BSRow[]) => {
    if (!items.length) { T("—", M + 44, 9, font, muted); y -= 14; return; }
    for (const r of items) {
      ensure(16);
      T(r.account_number, M, 8, bold, muted);
      T(r.name.length > 46 ? r.name.slice(0, 46) + "…" : r.name, M + 44, 9);
      TR(isk(r.val), 9, font, r.val < 0 ? red : ink);
      y -= 14;
    }
  };
  const heading = (s: string) => { ensure(20); T(s, M, 11, bold); y -= 16; };
  const total = (label: string, v: number) => { ensure(18); rule(1, ink); y -= 14; T(label, M, 10, bold); TR(isk(v), 11, bold); y -= 20; };
  const subhead = (s: string) => { ensure(16); T(s, M, 8, bold, muted); y -= 13; };

  // Header
  T(STORE.name, M, 12, bold);
  TR("Efnahagsreikningur", 14, bold);
  y -= 15;
  T(`Kt. ${STORE.kennitala}`, M, 8, font, muted);
  TR(`Staða þann ${fmtD(asOf)}`, 8, font, muted);
  y -= 16; rule(1, ink); y -= 18;

  heading("Eignir");
  rows(bs.assets);
  total("Eignir samtals", bs.assetTotal);

  y -= 6;
  heading("Skuldir og eigið fé");
  subhead("Skuldir");
  rows(bs.liab);
  y -= 4; subhead("Eigið fé");
  rows(bs.equity);
  ensure(16);
  T("Afkoma tímabilsins", M + 44, 9);
  TR(isk(bs.result), 9, font, bs.result < 0 ? red : ink);
  y -= 16;
  total("Skuldir og eigið fé samtals", bs.rightTotal);

  ensure(20);
  T(bs.balanced ? "Efnahagur stemmir" : "Efnahagur stemmir EKKI", M, 10, bold, bs.balanced ? green : red);

  return doc.save();
}
