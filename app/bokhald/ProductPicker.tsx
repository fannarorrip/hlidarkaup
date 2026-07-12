"use client";
import { useEffect, useRef, useState } from "react";

// Compact product picker for the móttaka line-matching (search by number/barcode/name).
interface P { product_number: string; name: string }

export default function ProductPicker({ value, valueName, onChange }: {
  value: string | null; valueName?: string | null; onChange: (pn: string | null, name: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<P[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<{ pn: string; name: string } | null>(value ? { pn: value, name: valueName || value } : null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  async function search(t: string) {
    setQ(t); setOpen(true);
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
          {open && (
            <div className="absolute z-30 mt-1 w-[min(18rem,calc(100vw-2rem))] bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto text-xs">
              {res.map((p) => (
                <button key={p.product_number} onClick={() => pick(p)} className="block w-full text-left px-2 py-1.5 hover:bg-red-50">
                  {p.name} <span className="text-gray-400">{p.product_number}</span>
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
