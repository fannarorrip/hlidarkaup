// EPL2-smiður fyrir hillumiða á Zebra GK420d (203 dpi = 8 punktar/mm) — sama útlit og
// vafraprentunin: heiti, Verð/stk + Verð/KG, vörunúmer, EAN-13 (prentarinn teiknar strik +
// tölur sjálfur) og stórt verð. Sent hrátt á kassabrúna (/rawprint) — enginn prentgluggi.

// CP850-kóðun fyrir íslensku stafina (brúin sendir bætin óbreytt á prentarann).
const CP850: Record<string, number> = {
  "á": 0xA0, "Á": 0xB5, "é": 0x82, "É": 0x90, "í": 0xA1, "Í": 0xD6, "ó": 0xA2, "Ó": 0xE0,
  "ú": 0xA3, "Ú": 0xE9, "ý": 0xEC, "Ý": 0xED, "þ": 0xD7, "Þ": 0xE8, "æ": 0x91, "Æ": 0x92,
  "ö": 0x94, "Ö": 0x99, "ð": 0xD0, "Ð": 0xD1, "·": 0xFA,
};
export function cp850(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    if (ch in CP850) out.push(CP850[ch]);
    else { const c = ch.charCodeAt(0); out.push(c < 128 ? c : 0x2A); } // óþekkt → '*'
  }
  return out;
}

export interface LabelData { name: string; priceLine: string; bigPrice: string; productNo: string; barcode: string | null; copies: number }

/** EPL2-bæti fyrir bunka af miðum. widthMm/heightMm = miðastærðin á rúllunni. */
export function labelsToEpl2(labels: LabelData[], widthMm: number, heightMm: number): Uint8Array {
  const d = 8; // punktar/mm
  const w = Math.round(widthMm * d), h = Math.round(heightMm * d);
  const bytes: number[] = [];
  const line = (s: string) => { bytes.push(...cp850(s), 0x0A); };
  for (const l of labels) {
    line("N");
    line("I8,B,001");                                   // CP850
    line(`q${w}`);
    line(`Q${h},24`);
    line(`A8,8,0,3,1,1,N,"${l.name.slice(0, 34).replace(/"/g, "'")}"`);
    line(`A8,44,0,2,1,1,N,"${l.priceLine.replace(/"/g, "'")}"`);
    line(`A${w - 110},44,0,2,1,1,N,"${l.productNo}"`);
    const bc = (l.barcode ?? "").replace(/\D/g, "");
    if (bc.length === 13 || bc.length === 12) {
      line(`B8,70,0,E30,2,4,${Math.max(60, h - 150)},B,"${bc}"`);   // EAN-13, tölur undir (B)
    } else if (bc) {
      line(`A8,${h - 40},0,2,1,1,N,"${bc}"`);                        // ekki EAN → bara tölurnar
    }
    line(`A${w - 190},${h - 90},0,5,1,1,N,"${l.bigPrice}"`);
    line(`P${Math.max(1, l.copies)}`);
  }
  return new Uint8Array(bytes);
}
