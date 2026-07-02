// Innkaupapöntun (purchase order) PDF — A4 portrait. We are the buyer (Hlíðarkaup); the supplier
// is the recipient. Lists ordered products + quantities + estimated costs. Built with pdf-lib.
import fs from "fs";
import path from "path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { STORE } from "@/lib/store";
import type { POFull } from "@/lib/purchase-orders";

const isk = (n: number) => Math.round(n).toLocaleString("is-IS") + " kr.";
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };
function safe(s: string) { return (s || "").replace(/[^ -ÿ€‘’“”–—•]/g, "?"); }
let _logo: Buffer | null | undefined;
function logo(): Buffer | null { if (_logo !== undefined) return _logo; try { _logo = fs.readFileSync(path.join(process.cwd(), "public", STORE.logoFile)); } catch { _logo = null; } return _logo; }

export async function renderPurchaseOrderPdf(po: POFull): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  const ink = rgb(0.11, 0.11, 0.11), muted = rgb(0.42, 0.45, 0.5), linec = rgb(0.88, 0.89, 0.9);
  let page = doc.addPage([W, H]);
  let y = H - M;
  const right = W - M;
  const T = (s: string, x: number, sz: number, f: PDFFont = font, c = ink) => page.drawText(safe(s), { x, y, size: sz, font: f, color: c });
  const TR = (s: string, xr: number, sz: number, f: PDFFont = font, c = ink) => { const w = f.widthOfTextAtSize(safe(s), sz); page.drawText(safe(s), { x: xr - w, y, size: sz, font: f, color: c }); };
  const rule = (th = 0.4, col = linec) => page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: th, color: col });
  const ensure = (n: number) => { if (y < M + n) { page = doc.addPage([W, H]); y = H - M; } };

  let metaTop = y - 12;
  const lb = logo();
  if (lb) { try { const img = await doc.embedPng(lb); const s = Math.min(46 / img.height, 190 / img.width); page.drawImage(img, { x: M, y: y - img.height * s, width: img.width * s, height: img.height * s }); metaTop = y - img.height * s - 8; } catch { /* */ } }
  else { T(STORE.name, M, 16, bold); metaTop = y - 24; }
  TR("Innkaupapöntun", right, 15, bold);
  y = metaTop;
  T(STORE.name, M, 10, bold); y -= 12;
  for (const ln of [`Kt. ${STORE.kennitala}`, `${STORE.address} · ${STORE.postal}`, `${STORE.phone} · ${STORE.email}`]) { T(ln, M, 9, font, muted); y -= 12; }
  let dy = metaTop;
  page.drawText(safe(`Nr. ${po.po_number}`), { x: right - font.widthOfTextAtSize(`Nr. ${po.po_number}`, 9), y: dy, size: 9, font, color: muted }); dy -= 12;
  page.drawText(safe(`Dags. ${fmtD(po.created_at)}`), { x: right - font.widthOfTextAtSize(`Dags. ${fmtD(po.created_at)}`, 9), y: dy, size: 9, font, color: muted });
  y = Math.min(y, dy) - 16;

  page.drawRectangle({ x: M, y: y - 34, width: right - M, height: 34, color: rgb(0.97, 0.98, 0.99) });
  T("BIRGIR", M + 8, 8, font, muted); y -= 12;
  T(po.supplier_name || "—", M + 8, 11, bold);
  if (po.supplier_kennitala) TR(`Kt. ${po.supplier_kennitala}`, right - 8, 9, font, muted);
  y -= 34;

  const qtyR = right - 200, costR = right - 95, amtR = right;
  T("Vara", M, 9, bold, muted); TR("Magn", qtyR, 9, bold, muted); TR("Áætl. verð", costR, 9, bold, muted); TR("Áætl. upphæð", amtR, 9, bold, muted);
  y -= 5; rule(1, ink); y -= 14;
  let total = 0;
  for (const l of po.lines) {
    ensure(16);
    const qty = Number(l.qty), cost = Number(l.unit_cost_est), amt = qty * cost; total += amt;
    const nm = `${l.product_number ? l.product_number + "  " : ""}${l.name}`;
    T(nm.length > 52 ? nm.slice(0, 52) + "…" : nm, M, 10);
    TR(String(qty), qtyR, 10); TR(cost ? isk(cost) : "—", costR, 10); TR(amt ? isk(amt) : "—", amtR, 10);
    y -= 5; rule(); y -= 13;
  }
  y -= 4; rule(1, ink); y -= 16;
  T("Áætluð upphæð samtals", M, 12, bold); TR(isk(total), amtR, 12, bold);
  y -= 24;
  if (po.note) { T("Athugasemd:", M, 9, bold, muted); y -= 13; T(po.note.slice(0, 120), M, 9, font); }

  const f = "Innkaupapöntun frá Hlíðarkaupi. Vinsamlegast staðfestið afhendingu.";
  const fw = font.widthOfTextAtSize(safe(f), 8);
  page.drawText(safe(f), { x: (W - fw) / 2, y: 44, size: 8, font, color: muted });
  return doc.save();
}
