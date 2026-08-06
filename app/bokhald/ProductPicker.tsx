"use client";
import { useEffect, useRef, useState } from "react";
import { groupLabel } from "@/lib/format";

// Compact product picker for the móttaka line-matching (search by number/barcode/name).
// Fellilistinn er FESTUR VIÐ GLUGGANN (position:fixed) — ekki absolute inni í töflunni —
// því overflow-x-auto utan um töfluna klippir líka lóðrétt yfirflæði: á neðstu línunum
// hvarf listinn og notandinn þurfti að skrolla langt til að sjá leitarniðurstöðurnar.
// Nálægt botni skjásins opnast hann UPP Á VIÐ.
interface P { product_number: string; name: string; product_group?: string | null }

const LIST_MAX = 224; // max-h-56

export default function ProductPicker({ value, valueName, onChange }: {
  value: string | null; valueName?: string | null; onChange: (pn: string | null, name: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<P[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<{ pn: string; name: string } | null>(value ? { pn: value, name: valueName || value } : null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  function measure() {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const spaceBelow = window.innerHeight - r.bottom;
    setPos(spaceBelow < LIST_MAX + 16
      ? { left: r.left, bottom: window.innerHeight - r.top + 4 }   // opnast upp á við
      : { left: r.left, top: r.bottom + 4 });                      // opnast niður á við
  }

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  // Skroll/stærðarbreyting á meðan listinn er opinn: endurmæla svo hann fylgi reitnum
  // (capture nær líka skrolli í yfirflæðis-ílátum inni á síðunni).
  useEffect(() => {
    if (!open) return;
    const f = () => measure();
    window.addEventListener("scroll", f, true);
    window.addEventListener("resize", f);
    return () => { window.removeEventListener("scroll", f, true); window.removeEventListener("resize", f); };
  }, [open]);

  async function search(t: string) {
    setQ(t); setOpen(true); measure();
    const r = await fetch(`/api/innkaup/products-search?q=${encodeURIComponent(t)}`);
    const d = await r.json(); setRes(d.products || []);
  }
  function pick(p: P) { setSel({ pn: p.product_number, name: p.name }); onChange(p.product_number, p.name); setOpen(false); }
  function clear() { setSel(null); onChange(null, null); setQ(""); setRes([]); }

  return (
    <div ref={box} className="relative">
      {sel ? (
        <div className="flex items-center gap-1 text-xs">
          <span className="font-medium truncate max-w-[12rem]">{sel.name}</span>
          <span className="text-gray-400">{sel.pn}</span>
          <button onClick={clear} className="text-red-600 hover:text-red-700 ml-1" title="Breyta">×</button>
        </div>
      ) : (
        <>
          <input value={q} onChange={(e) => search(e.target.value)} onFocus={() => search(q)} placeholder="Velja vöru…"
            className="w-full border border-amber-300 bg-amber-50/50 rounded px-2 py-1 text-xs outline-none focus:border-amber-500" />
          {open && pos && (
            <div style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom }}
              className="z-50 w-[min(18rem,calc(100vw-2rem))] bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto text-xs">
              {res.map((p) => (
                <button key={p.product_number} onClick={() => pick(p)} className="block w-full text-left px-2 py-1.5 hover:bg-red-50">
                  {p.name} <span className="text-gray-400">{p.product_number}</span>
                  {/* Vöruflokkurinn strax í leitinni — „bananar" sýnir í hvaða flokki þeir eru */}
                  {groupLabel(p.product_group) && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{groupLabel(p.product_group)}</span>}
                </button>
              ))}
              {!res.length && <div className="px-2 py-1.5 text-gray-400">Engin vara fannst</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
