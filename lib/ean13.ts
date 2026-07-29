// EAN-13 strikamerki sem SVG — hrein útfærsla, engin söfn. Fyrir hillumiða (Zebra GK420d
// prentar síðuna gegnum ZDesigner Windows-driverinn eins og hvert annað prentverk).
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = L.map((p) => p.split("").map((b) => (b === "0" ? "1" : "0")).join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** 95-módúla bitastrengur EAN-13 (eða null ef inntak er ógilt). 12 stafir fá vartölu reiknaða. */
export function ean13Modules(code: string): { modules: string; digits: string } | null {
  let d = (code || "").replace(/\D/g, "");
  if (d.length === 12) d = d + ean13CheckDigit(d);
  if (d.length !== 13) return null;
  if (ean13CheckDigit(d.slice(0, 12)) !== Number(d[12])) return null;
  const parity = PARITY[Number(d[0])];
  let m = "101";
  for (let i = 1; i <= 6; i++) m += (parity[i - 1] === "L" ? L : G)[Number(d[i])];
  m += "01010";
  for (let i = 7; i <= 12; i++) m += R[Number(d[i])];
  m += "101";
  return { modules: m, digits: d };
}

/** SVG-strengur fyrir strikamerkið (breidd fyllir viewBox; hæð í einingum). */
export function ean13Svg(code: string, opts?: { height?: number; showDigits?: boolean }): string | null {
  const parsed = ean13Modules(code);
  if (!parsed) return null;
  const h = opts?.height ?? 40;
  const showDigits = opts?.showDigits !== false;
  const textH = showDigits ? 9 : 0;
  let bars = "";
  let run = 0;
  for (let i = 0; i <= parsed.modules.length; i++) {
    const bit = parsed.modules[i];
    if (bit === "1") run++;
    else if (run > 0) {
      // vörður (upphaf/miðja/endir) ná niður fyrir talnalínuna
      const guard = i - run < 3 || (i - run >= 45 && i < 50) || i - run >= 92;
      bars += `<rect x="${i - run}" y="0" width="${run}" height="${h + (guard && showDigits ? 5 : 0)}"/>`;
      run = 0;
    }
  }
  const text = showDigits
    ? `<text x="47.5" y="${h + textH}" font-family="Arial" font-size="9" text-anchor="middle" letter-spacing="2">${parsed.digits}</text>`
    : "";
  // width/height 100% + display:block er SKYLDA — SVG án stærðar fær sjálfgefna 300×150px
  // risastærð í vafra og málar strikin yfir allt fyrir neðan sig (t.d. talnalínuna á hillumiða).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 95 ${h + textH + 1}" width="100%" height="100%" style="display:block" preserveAspectRatio="none" shape-rendering="crispEdges">${bars}${text}</svg>`;
}
