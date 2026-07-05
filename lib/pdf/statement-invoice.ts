// Consolidated month-end invoice (yfirlitsreikningur) PDF — A4 portrait, grouped by shopping
// trip (each trip a dated sub-section with its lines + subtotal), then a VAT summary + grand total.
// A/B/C VAT letters as on the regular invoice. Built with pdf-lib.
import fs from "fs";
import path from "path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { STORE } from "@/lib/store";
import { MANUDIR } from "@/lib/format";

export interface StatementTripLine { name: string; quantity: number; line_total: number; vat_rate: number }
export interface StatementTrip { date: string; series_code?: string; voucher_number?: string; total: number; lines: StatementTripLine[] }
export interface StatementInvoiceData { invoice_number: string; customer_name: string | null; kennitala: string | null; period: string; total: number; trips: StatementTrip[] }

const isk = (n: number) => Math.round(n).toLocaleString("is-IS") + " kr.";
const vatLetter = (r: number) => (r === 24 ? "A" : r === 11 ? "B" : r === 0 ? "C" : "");
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };
const periodLabel = (p: string) => { const m = /^(\d{4})-(\d{2})$/.exec(p || ""); return m ? `${MANUDIR[+m[2] - 1]} ${m[1]}` : p; };
function safe(s: string) { return (s || "").replace(/[^ -ÿ€‘’“”–—•]/g, "?"); }

let _logo: Buffer | null | undefined;
function logo(): Buffer | null { if (_logo !== undefined) return _logo; try { _logo = fs.readFileSync(path.join(process.cwd(), "public", STORE.logoFile)); } catch { _logo = null; } return _logo; }

export async function renderStatementInvoicePdf(d: StatementInvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  const ink = rgb(0.11, 0.11, 0.11), muted = rgb(0.42, 0.45, 0.5), linec = rgb(0.88, 0.89, 0.9);
  let page = doc.addPage([W, H]);
  let y = H - M;
  const T = (s: string, x: number, sz: number, f: PDFFont = font, c = ink) => page.drawText(safe(s), { x, y, size: sz, font: f, color: c });
  const TR = (s: string, xr: number, sz: number, f: PDFFont = font, c = ink) => { const w = f.widthOfTextAtSize(safe(s), sz); page.drawText(safe(s), { x: xr - w, y, size: sz, font: f, color: c }); };
  const rule = (th = 0.4, col = linec) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: th, color: col });
  const ensure = (n: number) => { if (y < M + n) { page = doc.addPage([W, H]); y = H - M; } };
  const right = W - M;

  // Header
  let metaTop = y - 12;
  const lb = logo();
  if (lb) { try { const img = await doc.embedPng(lb); const s = Math.min(46 / img.height, 190 / img.width); page.drawImage(img, { x: M, y: y - img.height * s, width: img.width * s, height: img.height * s }); metaTop = y - img.height * s - 8; } catch { /* */ } }
  else { T(STORE.name, M, 16, bold); metaTop = y - 24; }
  TR("Yfirlitsreikningur", right, 15, bold);
  y = metaTop;
  T(STORE.name, M, 10, bold); y -= 12;
  for (const ln of [`Kt. ${STORE.kennitala} · VSK nr. ${STORE.vskNr}`, `${STORE.address} · ${STORE.postal}`]) { T(ln, M, 9, font, muted); y -= 12; }
  let dy = metaTop;
  const oldY = y;
  y = dy;
  TR(`Nr. ${d.invoice_number}`, right, 9, font, muted); y -= 12;
  TR(`Tímabil ${periodLabel(d.period)}`, right, 9, font, muted);
  y = Math.min(oldY, y) - 16;

  // Customer
  if (d.customer_name) {
    page.drawRectangle({ x: M, y: y - 32, width: right - M, height: 32, color: rgb(0.97, 0.98, 0.99) });
    T("VIÐSKIPTAMAÐUR", M + 8, 8, font, muted); y -= 12;
    T(d.customer_name, M + 8, 11, bold);
    if (d.kennitala) TR(`Kt. ${d.kennitala}`, right - 8, 9, font, muted);
    y -= 30;
  }

  // VAT accumulation across all trips
  const byRate = new Map<number, number>();

  // Trips
  for (const trip of d.trips) {
    ensure(48);
    rule(0.8, ink); y -= 13;
    T(`Úttekt ${fmtD(trip.date)}${trip.voucher_number ? `  ·  ${trip.series_code}-${trip.voucher_number}` : ""}`, M, 9.5, bold);
    TR(isk(trip.total), right, 9.5, bold); y -= 14;
    for (const l of trip.lines) {
      ensure(14);
      const name = l.name.length > 52 ? l.name.slice(0, 52) + "…" : l.name;
      T(name, M + 8, 9);
      T(vatLetter(l.vat_rate), M + 8 + 320, 9, bold);
      TR(`${l.quantity} ×`, right - 90, 9, font, muted);
      TR(isk(l.line_total), right, 9);
      y -= 12;
      const r = l.vat_rate;
      byRate.set(r, (byRate.get(r) ?? 0) + l.line_total);
    }
    y -= 4;
  }

  // VAT summary + grand total
  ensure(90);
  y -= 6; rule(1, ink); y -= 14;
  const vatRows = [...byRate.entries()].sort((a, b) => b[0] - a[0]);
  for (const [rate, gross] of vatRows) {
    const vat = rate > 0 ? Math.round((gross * rate) / (100 + rate)) : 0;
    T(`${vatLetter(rate)}  VSK ${rate}%`, M, 9, font, muted);
    TR(`Án VSK ${isk(gross - vat)}`, right - 150, 9, font, muted);
    TR(`VSK ${isk(vat)}`, right, 9, font, muted);
    y -= 13;
  }
  y -= 4; rule(1, ink); y -= 16;
  T("Samtals til greiðslu", M, 13, bold);
  TR(isk(d.total), right, 13, bold);
  y -= 22;
  T("A = 24% VSK · B = 11% VSK · C = 0% VSK", M, 7.5, font, muted);

  const cw = font.widthOfTextAtSize(safe(STORE.complianceNote), 7.5);
  page.drawText(safe(STORE.complianceNote), { x: (W - cw) / 2, y: 40, size: 7.5, font, color: muted });

  return doc.save();
}
