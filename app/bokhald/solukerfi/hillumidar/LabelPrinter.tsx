"use client";
import { useEffect, useRef, useState } from "react";
import { ean13Svg } from "@/lib/ean13";

// Hillumiða-prentun á Zebra GK420d gegnum vafra + ZDesigner driver: hver miði = ein síða
// í nákvæmri miðastærð (@page). Útlitið speglar gömlu miðana: heiti efst, Verð/KG + vörunúmer,
// strikamerki neðst til vinstri, STÓRT verð til hægri.
interface P { product_number: string; name: string; price_gross: number; use_scale: boolean; unit_code: string | null; barcode: string | null }
interface Row extends P { copies: number }

const kr0 = (n: number) => Math.round(n).toLocaleString("is-IS");

// "720GR" / "0,5 L" / "800 G" / "2KG" úr vöruheiti → verð/kg (eða /l) reiknað af pakkaverði
function perUnitInfo(p: P): string | null {
  if (p.use_scale) return `Verð/KG ${kr0(p.price_gross)}`;
  const m = p.name.match(/(\d+(?:[.,]\d+)?)\s*(GR?|KG|ML|L)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!n) return null;
  const unit = m[2].toUpperCase();
  if (unit === "G" || unit === "GR") return `Verð/KG ${kr0(p.price_gross / (n / 1000))}`;
  if (unit === "KG") return `Verð/KG ${kr0(p.price_gross / n)}`;
  if (unit === "ML") return `Verð/L ${kr0(p.price_gross / (n / 1000))}`;
  if (unit === "L") return `Verð/L ${kr0(p.price_gross / n)}`;
  return null;
}

export default function LabelPrinter() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<P[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [w, setW] = useState(57);   // mm — dæmigert Zebra-hillumiðarúllustærð
  const [h, setH] = useState(32);
  const [busy, setBusy] = useState(false);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("hillumidi_size") || "{}");
      if (saved.w > 20) setW(saved.w);
      if (saved.h > 15) setH(saved.h);
    } catch { /* fyrsta skipti */ }
  }, []);
  useEffect(() => { localStorage.setItem("hillumidi_size", JSON.stringify({ w, h })); }, [w, h]);

  // @page-stærðin verður að vera í <style> — hver miði er ein prentsíða í nákvæmri miðastærð.
  useEffect(() => {
    if (!styleRef.current) {
      styleRef.current = document.createElement("style");
      document.head.appendChild(styleRef.current);
    }
    styleRef.current.textContent = `
      @media print {
        @page { size: ${w}mm ${h}mm; margin: 0; }
        body * { visibility: hidden; }
        #labels, #labels * { visibility: visible; }
        #labels { position: absolute; left: 0; top: 0; }
        .label { page-break-after: always; }
      }`;
    return () => { /* style element lifir meðan síðan er opin */ };
  }, [w, h]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/products/labels?q=${encodeURIComponent(term)}`);
      const d = await r.json();
      setResults(d.products ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function add(p: P) {
    setRows((prev) => prev.some((r) => r.product_number === p.product_number)
      ? prev.map((r) => (r.product_number === p.product_number ? { ...r, copies: r.copies + 1 } : r))
      : [...prev, { ...p, copies: 1 }]);
    setQ(""); setResults([]);
  }
  async function addRecent() {
    setBusy(true);
    const r = await fetch("/api/products/labels?recent=1");
    const d = await r.json(); setBusy(false);
    const fresh: P[] = d.products ?? [];
    setRows((prev) => {
      const have = new Set(prev.map((x) => x.product_number));
      return [...prev, ...fresh.filter((p) => !have.has(p.product_number)).map((p) => ({ ...p, copies: 1 }))];
    });
  }

  const inp = "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400";
  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap mb-4 print:hidden">
        <div className="relative">
          <label className="block text-xs text-gray-500 mb-1">Leita að vöru</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Heiti, númer eða strikamerki…" className={`${inp} w-72`} />
          {results.length > 0 && (
            <div className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg w-full max-h-72 overflow-y-auto">
              {results.map((p) => (
                <button key={p.product_number} onClick={() => add(p)} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-gray-400 ml-2 text-xs">{p.product_number} · {kr0(p.price_gross)} kr.</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={addRecent} disabled={busy} className="px-4 py-2 rounded-lg bg-[#21323A] text-white text-sm font-semibold hover:bg-[#2C687B] disabled:opacity-50">
          {busy ? "Sæki…" : "+ Nýbreytt verð (48 klst)"}
        </button>
        <div><label className="block text-xs text-gray-500 mb-1">Breidd (mm)</label>
          <input type="number" value={w} onChange={(e) => setW(Number(e.target.value) || 57)} className={`${inp} w-20`} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Hæð (mm)</label>
          <input type="number" value={h} onChange={(e) => setH(Number(e.target.value) || 32)} className={`${inp} w-20`} /></div>
        <button onClick={() => window.print()} disabled={rows.length === 0}
          className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-40">
          🖨 Prenta {rows.reduce((a, r) => a + r.copies, 0) || ""} miða
        </button>
        {rows.length > 0 && <button onClick={() => setRows([])} className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-500">Hreinsa</button>}
      </div>

      {rows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6 print:hidden">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.product_number} className="border-t border-gray-100 first:border-t-0">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{r.product_number}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{kr0(r.price_gross)} kr.</td>
                  <td className="px-4 py-2 text-right w-36 whitespace-nowrap">
                    <button onClick={() => setRows((p) => p.map((x) => x.product_number === r.product_number ? { ...x, copies: Math.max(1, x.copies - 1) } : x))} className="w-7 h-7 rounded bg-gray-100">−</button>
                    <span className="inline-block w-8 text-center tabular-nums">{r.copies}</span>
                    <button onClick={() => setRows((p) => p.map((x) => x.product_number === r.product_number ? { ...x, copies: x.copies + 1 } : x))} className="w-7 h-7 rounded bg-gray-100">+</button>
                    <button onClick={() => setRows((p) => p.filter((x) => x.product_number !== r.product_number))} className="ml-2 text-gray-300 hover:text-red-600">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Miðarnir sjálfir — forskoðun á skjá, nákvæm stærð í prentun */}
      <div id="labels">
        {rows.flatMap((r) => Array.from({ length: r.copies }, (_, i) => (
          <div key={`${r.product_number}~${i}`} className="label bg-white border border-dashed border-gray-300 print:border-0 mb-2 print:mb-0 overflow-hidden"
            style={{ width: `${w}mm`, height: `${h}mm`, padding: "1.5mm 2mm", display: "flex", flexDirection: "column", fontFamily: "Arial, sans-serif", color: "#000" }}>
            <div style={{ fontWeight: 700, fontSize: "3.2mm", lineHeight: 1.15, textTransform: "uppercase", overflow: "hidden", maxHeight: "7.5mm" }}>{r.name}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "2.4mm", marginTop: "0.8mm" }}>
              <span style={{ fontWeight: 700 }}>{perUnitInfo(r) ?? ""}</span>
              <span>{r.product_number}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flex: 1, gap: "2mm" }}>
              <div style={{ width: "55%", height: "9mm" }}
                dangerouslySetInnerHTML={{ __html: (r.barcode && ean13Svg(r.barcode, { height: 34 })) || `<div style="font-size:2.4mm;color:#666">${r.barcode ?? ""}</div>` }} />
              <div style={{ fontWeight: 700, fontSize: "7mm", lineHeight: 1 }}>{kr0(r.price_gross)}</div>
            </div>
          </div>
        )))}
      </div>
      {rows.length === 0 && <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-10 text-center print:hidden">Engir miðar valdir — leitaðu að vöru eða sæktu nýbreytt verð.</p>}
    </div>
  );
}
