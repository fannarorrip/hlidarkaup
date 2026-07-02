// Virðisaukaskattsskýrsla (VAT report) PDF — A4 portrait: skattskyld velta by rate, útskattur /
// innskattur / net, and the sundurliðun by account.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { STORE } from "@/lib/store";
import type { VatReport, VatLine } from "@/lib/vat-report";

const isk = (n: number) => Math.round(Number(n)).toLocaleString("is-IS");
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };
function safe(s: string) { return s.replace(/[^ -ÿ€‘’“”–—•]/g, "?"); }

export async function renderVatReportPdf(rep: VatReport, o: { label: string; from: string; to: string; due: string }): Promise<Uint8Array> {
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
  const row = (label: string, v: number, f = font, col = ink) => { ensure(16); T(label, M, 9, f, col === ink ? undefined : col); TR(isk(v), 9, f, col); y -= 14; };

  // Header
  T(STORE.name, M, 12, bold);
  TR("Virðisaukaskattsskýrsla", 13, bold);
  y -= 15;
  T(`Kt. ${STORE.kennitala}`, M, 8, font, muted);
  TR(`Tímabil: ${o.label}  ·  ${fmtD(o.from)} – ${fmtD(o.to)}  ·  Skiladagur ${fmtD(o.due)}`, 8, font, muted);
  y -= 16; rule(1, ink); y -= 16;

  T("Skattskyld velta (án VSK)", M, 10, bold); y -= 15;
  row("24% þrep", rep.v24);
  row("11% þrep", rep.v11);
  row("0% / undanþegin", rep.v0);
  y -= 2; rule(); y -= 12;
  row("Heildar skattskyld velta", rep.veltaTotal, bold);
  y -= 8;

  T("Útskattur (sala)", M, 10, bold); y -= 15;
  const lines = (items: VatLine[], empty: string) => {
    if (!items.filter((r) => r.amount !== 0).length) { T(empty, M + 4, 9, font, muted); y -= 14; return; }
    for (const r of items) { if (r.amount === 0) continue; ensure(16); T(`${r.account}`, M, 8, bold, muted); T(r.name.length > 42 ? r.name.slice(0, 42) + "…" : r.name, M + 40, 9); TR(isk(r.amount), 9); y -= 14; }
  };
  lines(rep.out, "Enginn útskattur");
  y -= 2; rule(); y -= 12; row("Útskattur samtals", rep.output, bold); y -= 8;

  T("Innskattur (kaup)", M, 10, bold); y -= 15;
  lines(rep.inn, "Enginn innskattur");
  y -= 2; rule(); y -= 12; row("Innskattur samtals", rep.input, bold); y -= 10;

  ensure(24);
  rule(1.2, ink); y -= 16;
  T(rep.net >= 0 ? "Skuld við ríkissjóð" : "Inneign", M, 12, bold);
  TR(isk(Math.abs(rep.net)), 13, bold, rep.net >= 0 ? red : green);

  return doc.save();
}
