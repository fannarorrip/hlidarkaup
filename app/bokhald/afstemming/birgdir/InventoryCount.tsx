"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { kr } from "@/lib/format";

interface Prod { product_number: string; name: string; stock_quantity: string; price_gross: number; product_group: string | null; }

export default function InventoryCount({ products }: { products: Prod[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const setCount = (pn: string, v: string) => setCounts((p) => ({ ...p, [pn]: v.replace(/[^\d.-]/g, "") }));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? products.filter((p) => p.name.toLowerCase().includes(s) || p.product_number.includes(s)) : products;
  }, [q, products]);

  // Only products that were actually counted (input filled).
  const counted = products.map((p) => {
    const raw = counts[p.product_number];
    if (raw === undefined || raw === "") return null;
    const c = Number(raw) || 0;
    const rec = Number(p.stock_quantity) || 0;
    const diff = c - rec;
    return { p, counted: c, recorded: rec, diff, value: diff * Number(p.price_gross) };
  }).filter(Boolean) as { p: Prod; counted: number; recorded: number; diff: number; value: number }[];

  const withDiff = counted.filter((c) => Math.round(c.diff) !== 0);
  const valueDiff = counted.reduce((s, c) => s + c.value, 0);

  async function save() {
    if (!counted.length) { setMsg("Sláðu inn talningu fyrst"); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/afstemming/inventory", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ counts: counted.map((c) => ({ product_number: c.p.product_number, counted: c.counted })) }),
    });
    setBusy(false);
    if (!r.ok) { setMsg("Villa við vistun"); return; }
    setMsg(`Lager uppfærður fyrir ${counted.length} vörur ✓`);
    setCounts({});
    router.refresh();
  }

  return (
    <div>
      <Link href="/bokhald/afstemming" className="text-sm text-gray-500 hover:underline">← Afstemming</Link>
      <h1 className="text-2xl font-bold mb-1 mt-1 flex items-center gap-2">📦 Birgðaafstemming</h1>
      <p className="text-sm text-gray-500 mb-5">Sláðu inn talningu og berðu saman við skráðan lager. Vistun uppfærir lagerstöðuna.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Vörur með lager</p><p className="text-2xl font-bold mt-1">{products.length}</p></div>
        <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Talið</p><p className="text-2xl font-bold mt-1">{counted.length}</p></div>
        <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Mismunur (vörur)</p><p className={`text-2xl font-bold mt-1 ${withDiff.length ? "text-amber-600" : ""}`}>{withDiff.length}</p></div>
        <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Virði mismunar</p><p className={`text-2xl font-bold mt-1 ${Math.round(valueDiff) ? (valueDiff < 0 ? "text-red-600" : "text-green-700") : ""}`}>{kr(valueDiff)}</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Leita að vöru…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 outline-none focus:border-red-400" />
        <div className="flex-1" />
        <button onClick={save} disabled={busy || !counted.length} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">{busy ? "Vista…" : "Vista talningu"}</button>
        {msg && <span className="text-sm text-green-700">{msg}</span>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Vara</th>
              <th className="px-4 py-2 font-medium text-right">Skráð</th>
              <th className="px-4 py-2 font-medium text-right w-32">Talið</th>
              <th className="px-4 py-2 font-medium text-right">Mismunur</th>
              <th className="px-4 py-2 font-medium text-right">Virði</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 400).map((p) => {
              const raw = counts[p.product_number];
              const has = raw !== undefined && raw !== "";
              const c = Number(raw) || 0;
              const diff = has ? c - (Number(p.stock_quantity) || 0) : 0;
              return (
                <tr key={p.product_number} className="border-t border-gray-100">
                  <td className="px-4 py-2"><span className="font-mono text-xs text-gray-400">{p.product_number}</span> {p.name}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{Number(p.stock_quantity).toLocaleString("is-IS")}</td>
                  <td className="px-4 py-2 text-right">
                    <input value={raw ?? ""} onChange={(e) => setCount(p.product_number, e.target.value)} inputMode="numeric" placeholder="—"
                      className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right outline-none focus:border-red-400" />
                  </td>
                  <td className={`px-4 py-2 text-right font-medium ${has && Math.round(diff) ? (diff < 0 ? "text-red-600" : "text-green-700") : "text-gray-300"}`}>{has ? diff.toLocaleString("is-IS") : "—"}</td>
                  <td className={`px-4 py-2 text-right ${has && Math.round(diff) ? "text-gray-600" : "text-gray-300"}`}>{has && Math.round(diff) ? kr(diff * Number(p.price_gross)) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 400 && <p className="px-4 py-2 text-xs text-gray-400">Sýni 400 af {filtered.length} — leitaðu til að þrengja.</p>}
      </div>
    </div>
  );
}
