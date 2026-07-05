// A4 launaseðill (payslip) — styled to match the reference Sýn/Tímon-style payslip:
// blue page border, logo top-left, LAUNASEÐILL title + employer kt, employee block +
// light-blue info box, a column-header band (Nr | Texti | Einingar | Taxti | Laun |
// Frádráttur), the line grid with a "Færslur launamanns" subsection, right-aligned
// totals, and a gray "SAMTALS FRÁ ÁRAMÓTUM" grid. pdf-lib (no React), like invoice.ts.
import fs from "fs";
import path from "path";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { STORE } from "@/lib/store";
import { dags } from "@/lib/format";
import type { Breakdown, BreakdownItem } from "@/lib/payroll";

// Logo read once (undefined = not tried, null = unavailable).
let _logo: Buffer | null | undefined;
function logoBytes(): Buffer | null {
  if (_logo !== undefined) return _logo;
  try { _logo = fs.readFileSync(path.join(process.cwd(), "public", STORE.logoFile)); }
  catch { _logo = null; }
  return _logo;
}

export interface PayslipYtd {
  gross: number; income_tax: number; pension_employee: number; pension_employer: number;
  union_dues: number; union_employer: number; vacation_accrual: number; net_pay: number;
}
export interface PayslipData {
  employee_name: string; kennitala: string | null; starfsheiti: string | null; deild: string | null;
  employment_ratio: number | null; bank_account: string | null;
  period: string; pay_date: string;
  breakdown: Breakdown;
  net_pay: number;
  ytd: PayslipYtd | null;
}

const MONTHS = ["", "Janúar", "Febrúar", "Mars", "Apríl", "Maí", "Júní", "Júlí", "Ágúst", "September", "Október", "Nóvember", "Desember"];
const fmt = (n: number) => Math.round(n).toLocaleString("is-IS");
const num2 = (n: number) => n.toLocaleString("is-IS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function safe(s: string): string { return (s || "").replace(/[^ -ÿ]/g, "?"); }
function periodLabel(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p || "");
  return m ? `${MONTHS[+m[2]] || ""} ${m[1]}`.trim() : (p || "");
}

export async function renderPayslipPdf(d: PayslipData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pageW = 595.28, pageH = 841.89;
  const page = doc.addPage([pageW, pageH]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const blue = rgb(0.20, 0.33, 0.58);
  const blueDk = rgb(0.16, 0.27, 0.50);
  const infoBg = rgb(0.88, 0.915, 0.97);
  const ytdBg = rgb(0.92, 0.92, 0.93);
  const dark = rgb(0.12, 0.12, 0.12);
  const gray = rgb(0.45, 0.45, 0.45);
  const lineCol = rgb(0.78, 0.81, 0.88);

  const M = 38, R = pageW - 38;
  const T = (s: string, x: number, y: number, f = font, sz = 9, c = dark) => page.drawText(safe(s), { x, y, size: sz, font: f, color: c });
  const RT = (s: string, xr: number, y: number, f = font, sz = 9, c = dark) => { const w = f.widthOfTextAtSize(safe(s), sz); page.drawText(safe(s), { x: xr - w, y, size: sz, font: f, color: c }); };
  const CT = (s: string, cx: number, y: number, f = font, sz = 9, c = dark) => { const w = f.widthOfTextAtSize(safe(s), sz); page.drawText(safe(s), { x: cx - w / 2, y, size: sz, font: f, color: c }); };
  const fill = (x: number, y: number, w: number, h: number, c: ReturnType<typeof rgb>) => page.drawRectangle({ x, y, width: w, height: h, color: c });
  const hr = (y: number, c = lineCol, t = 0.6) => page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: t, color: c });
  const clip = (s: string, sz: number, max: number, f = font) => { s = safe(s); if (f.widthOfTextAtSize(s, sz) <= max) return s; while (s.length > 1 && f.widthOfTextAtSize(s + "…", sz) > max) s = s.slice(0, -1); return s + "…"; };

  // Page border
  page.drawRectangle({ x: 20, y: 20, width: pageW - 40, height: pageH - 40, borderColor: blue, borderWidth: 1 });

  // ── Header: logo top-left + title + employer kennitala ──
  const yTop = pageH - 42;
  let logoBottom = yTop - 30;
  const lb = logoBytes();
  if (lb) {
    try {
      const img = await doc.embedPng(lb);
      const maxH = 46, maxW = 170; let sc = maxH / img.height; if (img.width * sc > maxW) sc = maxW / img.width;
      const w = img.width * sc, h = img.height * sc;
      page.drawImage(img, { x: M, y: yTop - h, width: w, height: h }); logoBottom = yTop - h;
    } catch { T(STORE.name, M, yTop - 16, bold, 16); logoBottom = yTop - 22; }
  } else { T(STORE.name, M, yTop - 16, bold, 16); logoBottom = yTop - 22; }

  T("LAUNASEÐILL", 250, yTop - 10, bold, 16, dark);
  T(`Kennitala launagreiðanda: ${STORE.kennitala}`, 250, yTop - 24, font, 8.5, gray);

  // Employee block (left)
  let ly = Math.min(logoBottom, yTop - 20) - 14;
  T(d.employee_name, M, ly, bold, 11, dark); ly -= 13;
  if (d.kennitala) { T(`kt. ${d.kennitala}`, M, ly, font, 8.5, gray); ly -= 11; }
  if (d.starfsheiti) { T(d.starfsheiti, M, ly, font, 8.5, gray); ly -= 11; }

  // Info box (right, light blue)
  const ibX = 320, ibTop = 766;
  const irows: [string, string][] = [["Útborgun", periodLabel(d.period)]];
  if (d.kennitala) irows.push(["Kennitala", d.kennitala]);
  irows.push(["Útb.dags", dags(d.pay_date)]);
  irows.push(["Greiðslumáti", "Lagt inn á reikning"]);
  if (d.bank_account) irows.push(["Reikningsnúmer", d.bank_account]);
  const ibRowH = 13, ibPad = 7;
  const ibH = irows.length * ibRowH + ibPad;
  fill(ibX, ibTop - ibH, R - ibX, ibH, infoBg);
  let iy = ibTop - 9;
  for (const [k, v] of irows) { T(k + ":", ibX + 8, iy, bold, 8.5, blueDk); T(clip(v, 8.5, R - (ibX + 112) - 6), ibX + 112, iy, font, 8.5, dark); iy -= ibRowH; }

  // ── Line table ──
  let y = Math.min(ly, ibTop - ibH) - 16;

  const cNr = M + 3, cTexti = M + 33, cEin = 362, cTaxti = 430, cLaun = 497, cFrad = R - 3;
  // Column header band
  fill(M, y - 11, R - M, 14, infoBg);
  const bb = y - 7;
  T("Nr.", cNr, bb, bold, 8, blueDk); T("Texti", cTexti, bb, bold, 8, blueDk);
  RT("Einingar", cEin, bb, bold, 8, blueDk); RT("Taxti", cTaxti, bb, bold, 8, blueDk);
  RT("Laun", cLaun, bb, bold, 8, blueDk); RT("Frádráttur", cFrad, bb, bold, 8, blueDk);
  y -= 19;

  // Meta line
  const meta = [d.starfsheiti ? `Starfsheiti: ${d.starfsheiti}` : "", d.deild ? `Deild: ${d.deild}` : "", d.employment_ratio != null ? `Ráðningarhlutfall: ${num2(d.employment_ratio)}%` : ""].filter(Boolean).join("     ");
  if (meta) { T(meta, cTexti, y, font, 8, gray); y -= 13; }

  // Defensive: tolerate older/empty breakdowns (runs posted before v2).
  const raw = (d.breakdown ?? {}) as Partial<Breakdown>;
  const b: Breakdown = {
    earnings: raw.earnings ?? [], pensionEmployee: raw.pensionEmployee ?? [], stadgreidsla: raw.stadgreidsla ?? [],
    personalCredit: raw.personalCredit ?? 0, unionEmployee: raw.unionEmployee ?? [], deductions: raw.deductions ?? [],
    employer: raw.employer ?? { pensionAlmennur: 0, pensionSereign: 0, tryggingagjald: 0, unionFunds: [] },
    orlofAccrual: raw.orlofAccrual ?? 0,
  };

  const rowH = 12.5;
  const row = (it: BreakdownItem, col: "laun" | "frad", signFlip = false) => {
    T(it.code, cNr, y, font, 7.5, gray);
    T(clip(it.label, 8.5, cEin - 52 - cTexti), cTexti, y, font, 8.5, dark);
    if (it.units != null) RT(num2(it.units), cEin, y, font, 8, gray);
    if (it.rate != null) RT(num2(it.rate), cTaxti, y, font, 8, gray);
    const amt = signFlip ? -it.amount : it.amount;
    RT(fmt(amt), col === "laun" ? cLaun : cFrad, y, font, 8.5, dark);
    y -= rowH;
  };

  b.earnings.forEach((e) => row(e, "laun"));
  b.pensionEmployee.forEach((p) => row(p, "frad"));
  b.unionEmployee.forEach((u) => row(u, "frad"));
  b.deductions.forEach((x) => row(x, "frad"));

  // "Færslur launamanns" subsection — tax brackets + personal credit
  if (b.stadgreidsla.length || b.personalCredit) {
    y -= 3; hr(y + 5); y -= 7;
    T("Færslur launamanns", cTexti, y, bold, 8, blueDk); y -= 13;
    b.stadgreidsla.forEach((s) => row(s, "frad"));
    if (b.personalCredit) row({ code: "9710", label: "Persónuafsláttur", amount: b.personalCredit }, "frad", true);
  }

  // ── Totals ──
  const grossSum = b.earnings.reduce((a, e) => a + e.amount, 0);
  const fradSum = b.pensionEmployee.reduce((a, x) => a + x.amount, 0) + b.unionEmployee.reduce((a, x) => a + x.amount, 0)
    + b.deductions.reduce((a, x) => a + x.amount, 0) + b.stadgreidsla.reduce((a, x) => a + x.amount, 0) - b.personalCredit;
  y -= 2; hr(y + 6, blue, 0.8); y -= 6;
  RT("Laun alls/frádráttur", 440, y, bold, 9.5, dark);
  RT(fmt(grossSum), cLaun, y, bold, 9.5, dark);
  RT(fmt(fradSum), cFrad, y, bold, 9.5, dark);
  y -= 17;
  RT("Samtals útborgað", 470, y, bold, 11.5, dark);
  RT(fmt(d.net_pay), cFrad, y, bold, 11.5, dark);
  y -= 22;

  // ── Employer contributions (informational) ──
  const er: [string, number][] = [
    ["Mótframlag í lífeyrissjóð", b.employer.pensionAlmennur],
    ["Mótframlag í séreign", b.employer.pensionSereign],
    ["Tryggingagjald", b.employer.tryggingagjald],
    ...b.employer.unionFunds.map((f) => [f.label, f.amount] as [string, number]),
    ["Áfallið orlof", b.orlofAccrual],
  ].filter(([, amt]) => amt) as [string, number][];
  if (er.length) {
    hr(y + 6); T("Framlag launagreiðanda (ekki dregið af launum)", cTexti, y, bold, 8, gray); y -= 13;
    for (const [label, amt] of er) { T(clip(label, 8, 300), cTexti, y, font, 8, gray); RT(fmt(amt), cFrad, y, font, 8, gray); y -= 11; }
    y -= 8;
  }

  // ── SAMTALS FRÁ ÁRAMÓTUM ──
  if (d.ytd) {
    const yt = d.ytd;
    T("SAMTALS FRÁ ÁRAMÓTUM", M, y, bold, 10, dark); y -= 8;
    const cells: [string, number][] = [
      ["Heildarlaun", yt.gross], ["Skattskyld laun", Math.max(0, yt.gross - yt.pension_employee)], ["Staðgreiðsla", yt.income_tax],
      ["Lífeyrissjóður", yt.pension_employee], ["Lífeyrissjóður mótfr", yt.pension_employer], ["Orlof", yt.vacation_accrual],
      ["Stéttarfélag", yt.union_dues], ["Stéttarfélag mótfr", yt.union_employer], ["Útborgað", yt.net_pay],
    ];
    const cols = 3, colW = (R - M) / cols, rowsN = Math.ceil(cells.length / cols), cellH = 30;
    const boxH = rowsN * cellH + 8;
    const boxTop = y;
    page.drawRectangle({ x: M, y: boxTop - boxH, width: R - M, height: boxH, color: ytdBg, borderColor: blue, borderWidth: 0.8 });
    cells.forEach(([label, val], i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const cx = M + c * colW + colW / 2;
      const cyLabel = boxTop - 8 - r * cellH - 9;
      CT(label, cx, cyLabel, font, 8, gray);
      CT(fmt(val), cx, cyLabel - 12, bold, 9.5, dark);
    });
    y = boxTop - boxH - 10;
  }

  // Compliance note (bottom)
  T(STORE.complianceNote.replace("Reikningur", "Launaseðill"), M, 32, font, 6.5, gray);
  return doc.save();
}
