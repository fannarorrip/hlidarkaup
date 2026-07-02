"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import type { ProductRow } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";

export default function ProductsTable({ products, total }: { products: ProductRow[]; total: number }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductRow[] | null>(null); // null = no active search
  const [loading, setLoading] = useState(false);

  // Server-side, accent-insensitive search over ALL products (debounced).
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/products/search?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        setResults(d.products ?? []);
      } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = results ?? products;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Leita að vöru, vörunúmeri eða strikamerki…"
          className="flex-1 max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"
        />
        <span className="text-xs text-gray-400">
          {loading ? "Leita…" : results ? `${filtered.length} fundust` : `Sýni ${Math.min(products.length, 500)} af ${total} — leitaðu til að finna fleiri`}
        </span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nr.</th>
              <th className="px-4 py-2 font-medium">Heiti</th>
              <th className="px-4 py-2 font-medium">Flokkur</th>
              <th className="px-4 py-2 font-medium text-right">VSK</th>
              <th className="px-4 py-2 font-medium text-right">Verð</th>
              <th className="px-4 py-2 font-medium text-right">Birgðir</th>
              <th className="px-4 py-2 font-medium text-right">Strikam.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((p) => (
              <tr key={p.product_number} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono">
                  <Link href={`/bokhald/solukerfi/vorur/${p.product_number}`} className="text-red-700 hover:underline">{p.product_number}</Link>
                </td>
                <td className="px-4 py-2">
                  <Link href={`/bokhald/solukerfi/vorur/${p.product_number}`} className="hover:underline">{p.name}</Link>
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
      {filtered.length > 500 && <p className="text-xs text-gray-400 mt-2">Sýni fyrstu 500 — þrengdu leitina.</p>}
    </div>
  );
}
