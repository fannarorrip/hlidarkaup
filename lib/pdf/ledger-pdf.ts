// Hreyfingar / Aðalbók PDF — A4 portrait. Each lykill is its own section, fully expanded:
// opening balance, every transaction (date, fylgiskjal, skýring, debet, kredit) with a
// running balance, and a closing total. Mirrors lib/pdf/trial-balance-pdf.ts.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { STORE } from "@/lib/store";
import type { LedgerAccount } from "@/lib/ledger-report";

const isk = (n: number) => Math.round(Number(n)).toLocaleString("is-IS");
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };
function safe(s: string) { return (s || "").replace(/[^ -ÿ€‘’“”–—•]/g, "?"); }

export async function renderLedgerPdf(accounts: LedgerAccount[], from: string, to: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 36;
  const ink = rgb(0.11, 0.11, 0.11), muted = rgb(0.42, 0.45, 0.5), red = rgb(0.8, 0.1, 0.1), linec = rgb(0.85, 0.86, 0.88);
  const c = { dateX: M, vchX: 92, descX: 165, debetR: 380, kreditR: 460, stadaR: W - M };

  let page = doc.addPage([W, H]);
  let y = H - M;
  const T = (s: string, x: number, sz: number, f: PDFFont = font, col = ink) => page.drawText(safe(s), { x, y, size: sz, font: f, color: col });
  const TR = (s: string, xr: number, sz: number, f: PDFFont = font, col = ink) => { const w = f.widthOfTextAtSize(safe(s), sz); page.drawText(safe(s), { x: xr - w, y, size: sz, font: f, color: col }); };
  const amt = (v: number, xr: number, f: PDFFont = font) => v ? TR(isk(v), xr, 8, f, v < -0.005 ? red : ink) : undefined;
  const rule = (th = 0.4, col = linec) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: th, color: col });
  const ensure = (n: number) => { if (y < M + n) { page = doc.addPage([W, H]); y = H - M; } };

  // Header
  T(STORE.name, M, 11, bold);
  TR("Hreyfingar — Aðalbók", W - M, 13, bold);
  y -= 14;
  T(`Kt. ${STORE.kennitala}`, M, 8, font, muted);
  TR(`Tímabil: ${fmtD(from)} – ${fmtD(to)}  ·  Fjöldi lykla: ${accounts.length}`, W - M, 8, font, muted);
  y -= 18;

  if (accounts.length === 0) { T("Engar hreyfingar á tímabilinu.", M, 9, font, muted); return doc.save(); }

  for (const a of accounts) {
    ensure(60);
    rule(1, ink); y -= 12;
    T(`${a.account_number}  ${a.name}`, M, 9.5, bold);
    TR(`Staða í upphafi: ${isk(a.opening)}`, W - M, 8, font, muted);
    y -= 13;
    // column header
    T("Dags.", c.dateX, 7.5, bold, muted);
    T("Fylgiskjal", c.vchX, 7.5, bold, muted);
    T("Skýring", c.descX, 7.5, bold, muted);
    TR("Debet", c.debetR, 7.5, bold, muted);
    TR("Kredit", c.kreditR, 7.5, bold, muted);
    TR("Staða", c.stadaR, 7.5, bold, muted);
    y -= 3; rule(0.5); y -= 11;

    for (const l of a.lines) {
      ensure(16);
      T(fmtD(l.voucher_date), c.dateX, 8);
      T(`${l.series_code}-${l.voucher_number}`, c.vchX, 8, font, muted);
      const desc = l.description ?? "";
      T(desc.length > 34 ? desc.slice(0, 34) + "…" : desc, c.descX, 8, font, muted);
      amt(l.debit, c.debetR); amt(l.credit, c.kreditR);
      TR(isk(l.running), c.stadaR, 8, font, l.running < -0.005 ? red : ink);
      y -= 4; rule(); y -= 11;
    }
    ensure(16);
    T(`Samtals  (D ${isk(a.total_debit)} / K ${isk(a.total_credit)})`, c.dateX, 8, bold, muted);
    TR(`Staða í lok: ${isk(a.closing)}`, c.stadaR, 8.5, bold, a.closing < -0.005 ? red : ink);
    y -= 20;
  }

  return doc.save();
}
