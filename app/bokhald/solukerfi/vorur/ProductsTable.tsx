"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProductRow } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";
import { kbHealth, kbScanEvents } from "@/lib/kassabru";
import SupplierPicker from "@/app/bokhald/SupplierPicker";

export default function ProductsTable({ products, total }: { products: ProductRow[]; total: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductRow[] | null>(null); // null = no active search
  const [loading, setLoading] = useState(false);
  const [onlyNoSupplier, setOnlyNoSupplier] = useState(false);

  // multi-select + bulk birgi assignment
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSupplierId, setBulkSupplierId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [pickerKey, setPickerKey] = useState(0);

  async function fetchList(url: string) {
    setLoading(true);
    try { const r = await fetch(url); const d = await r.json(); setResults(d.products ?? []); }
    finally { setLoading(false); }
  }

  // "Án birgja" list (all products with no birgi yet).
  useEffect(() => {
    if (!onlyNoSupplier) return;
    setQ(""); fetchList("/api/products/search?nosupplier=1");
  }, [onlyNoSupplier]);

  // Server-side, accent-insensitive search over ALL products (debounced) — off while filtering by birgi.
  useEffect(() => {
    if (onlyNoSupplier) return;
    const term = q.trim();
    if (!term) { setResults(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => fetchList(`/api/products/search?q=${encodeURIComponent(term)}`), 250);
    return () => clearTimeout(t);
  }, [q, onlyNoSupplier]);

  // Physical barcode scanner (kassabrú): a scan drops the code into search.
  useEffect(() => {
    let stop = false; let cleanup: (() => void) | undefined;
    kbHealth().then((ok) => { if (!stop && ok) cleanup = kbScanEvents((code) => { setOnlyNoSupplier(false); setQ(code); }); });
    return () => { stop = true; cleanup?.(); };
  }, []);

  const filtered = (results ?? products).slice(0, 500);
  const allChecked = filtered.length > 0 && filtered.every((p) => selected.has(p.product_number));
  const toggle = (pn: string) => setSelected((s) => { const n = new Set(s); n.has(pn) ? n.delete(pn) : n.add(pn); return n; });
  const toggleAll = () => setSelected((s) => { const n = new Set(s); if (allChecked) filtered.forEach((p) => n.delete(p.product_number)); else filtered.forEach((p) => n.add(p.product_number)); return n; });

  async function assignBulk() {
    if (!bulkSupplierId || selected.size === 0) return;
    setBulkBusy(true); setBulkMsg("");
    try {
      const r = await fetch("/api/products/bulk-supplier", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ product_numbers: [...selected], supplier_id: bulkSupplierId }),
      });
      const d = await r.json();
      if (!r.ok) { setBulkMsg(d.error ?? "Mistókst"); return; }
      setBulkMsg(`✓ Birgi settur á ${d.updated} vörur`);
      setSelected(new Set()); setBulkSupplierId(null); setPickerKey((k) => k + 1);
      if (onlyNoSupplier) fetchList("/api/products/search?nosupplier=1"); else router.refresh();
    } catch { setBulkMsg("Samband rofnaði"); } finally { setBulkBusy(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => { setOnlyNoSupplier(false); setQ(e.target.value); }}
          placeholder="Leita að vöru, vörunúmeri eða strikamerki…"
          className="flex-1 min-w-[16rem] max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={onlyNoSupplier} onChange={(e) => setOnlyNoSupplier(e.target.checked)} className="w-4 h-4 accent-red-600" />
          Aðeins án birgja
        </label>
        <span className="text-xs text-gray-400 ml-auto">
          {loading ? "Leita…" : results ? `${(results).length} fundust` : `Sýni ${Math.min(products.length, 500)} af ${total} — leitaðu til að finna fleiri`}
        </span>
      </div>

      {/* Bulk birgi assignment — appears when rows are selected */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-[#E4F1F0] border border-[#2C687B]/20">
          <span className="text-sm font-medium text-[#21323A]">{selected.size} valdar</span>
          <span className="text-sm text-gray-500">→ Setja birgi:</span>
          <div className="min-w-[16rem]"><SupplierPicker key={pickerKey} onChange={(id) => setBulkSupplierId(id)} /></div>
          <button onClick={assignBulk} disabled={!bulkSupplierId || bulkBusy}
            className="px-4 py-2 rounded-lg bg-[#2C687B] text-white text-sm font-semibold hover:bg-[#22505f] disabled:opacity-50">
            {bulkBusy ? "Vista…" : `Setja á ${selected.size} vörur`}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500 hover:text-gray-800">Hætta við</button>
          {bulkMsg && <span className="text-sm text-[#2C687B]">{bulkMsg}</span>}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[920px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 accent-red-600" aria-label="Velja allar" /></th>
              <th className="px-4 py-2 font-medium">Nr.</th>
              <th className="px-4 py-2 font-medium">Heiti</th>
              <th className="px-4 py-2 font-medium">Birgi</th>
              <th className="px-4 py-2 font-medium">Flokkur</th>
              <th className="px-4 py-2 font-medium text-right">VSK</th>
              <th className="px-4 py-2 font-medium text-right">Verð</th>
              <th className="px-4 py-2 font-medium text-right">Birgðir</th>
              <th className="px-4 py-2 font-medium text-right">Strikam.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.product_number} className={`border-t border-gray-100 hover:bg-gray-50 ${selected.has(p.product_number) ? "bg-[#E4F1F0]/50" : ""}`}>
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(p.product_number)} onChange={() => toggle(p.product_number)} className="w-4 h-4 accent-red-600" /></td>
                <td className="px-4 py-2 font-mono">
                  <Link href={`/bokhald/solukerfi/vorur/${p.product_number}`} className="text-red-700 hover:underline">{p.product_number}</Link>
                </td>
                <td className="px-4 py-2">
                  <Link href={`/bokhald/solukerfi/vorur/${p.product_number}`} className="hover:underline">{p.name}</Link>
                </td>
                <td className="px-4 py-2">
                  {p.supplier_name
                    ? <span className="text-gray-700">{p.supplier_name}{p.supplier_item_no ? <span className="text-gray-400 text-xs"> · nr. {p.supplier_item_no}</span> : null}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2 text-gray-500">{p.product_group || "—"}</td>
                <td className="px-4 py-2 text-right text-gray-500">{Number(p.vat_rate)}%</td>
                <td className="px-4 py-2 text-right font-medium">{kr(p.price_gross)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{p.is_stock_controlled ? Math.floor(Number(p.stock_quantity)) : "—"}</td>
                <td className="px-4 py-2 text-right text-gray-400">{p.barcodes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(results ?? products).length > 500 && <p className="text-xs text-gray-400 mt-2">Sýni fyrstu 500 — þrengdu leitina.</p>}
    </div>
  );
}
