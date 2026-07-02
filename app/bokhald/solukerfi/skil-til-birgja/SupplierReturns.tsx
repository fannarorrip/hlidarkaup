"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";
import type { SupplierReturnRow } from "@/lib/supplier-returns";

interface DraftLine { product_number: string | null; name: string; qty: number; unitCost: number; vatRate: number }

export default function SupplierReturns({ returns, suppliers }: { returns: SupplierReturnRow[]; suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; cost: number; vatPct: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const note4 = (m: string) => { setToast(m); setTimeout(() => setToast(""), 4000); };
  const net = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const vat = lines.reduce((s, l) => s + (l.vatRate > 0 ? Math.round((l.qty * l.unitCost * l.vatRate) / 100) : 0), 0);

  async function search(v: string) {
    setQ(v); if (v.trim().length < 2) { setResults([]); return; }
    const r = await fetch(`/api/innkaup/product-search?q=${encodeURIComponent(v.trim())}`);
    setResults((await r.json()).products ?? []);
  }
  const addLine = (p: { id: string; name: string; cost: number; vatPct: number }) => {
    setLines((ls) => ls.some((l) => l.product_number === p.id) ? ls : [...ls, { product_number: p.id, name: p.name, qty: 1, unitCost: p.cost, vatRate: p.vatPct }]);
    setQ(""); setResults([]);
  };
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));

  async function create() {
    if (!lines.length) { setErr("Engar línur"); return; }
    setBusy(true); setErr("");
    const supplier = suppliers.find((s) => s.id === supplierId);
    const r = await fetch("/api/innkaup/return", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supplierId: supplierId || null, supplierName: supplier?.name ?? null, note, lines }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setErr(d.error ?? "Villa"); return; }
    setCreating(false); setLines([]); setNote(""); setSupplierId(""); note4(`Skil ${d.return_number} bókuð`); router.refresh();
  }
  async function send(id: string) {
    const r = await fetch(`/api/innkaup/return/${id}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ via: "email" }) });
    const d = await r.json().catch(() => ({}));
    note4(d.ok ? "Skilanóta send" : (d.error ?? "Villa")); router.refresh();
  }

  return (
    <div className="space-y-6">
      <button onClick={() => { setSupplierId(""); setNote(""); setLines([]); setErr(""); setCreating(true); }} className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700">+ Ný skil</button>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-4 py-2 font-medium">Nr.</th><th className="px-4 py-2 font-medium">Birgir</th><th className="px-4 py-2 font-medium text-center">Línur</th><th className="px-4 py-2 font-medium text-right">Inneign</th><th className="px-4 py-2 font-medium">Dags.</th><th className="px-4 py-2 font-medium text-right">Aðgerðir</th></tr>
          </thead>
          <tbody>
            {returns.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Engin skil enn</td></tr> : returns.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono">{r.return_number}</td>
                <td className="px-4 py-2">{r.supplier_name ?? "—"}</td>
                <td className="px-4 py-2 text-center text-gray-600">{r.line_count}</td>
                <td className="px-4 py-2 text-right">{kr(Number(r.total))}</td>
                <td className="px-4 py-2 text-gray-500">{r.created_at?.slice(0, 10)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {r.voucher_id && <a href={`/bokhald/fylgiskjol/${r.voucher_id}`} className="text-gray-500 hover:underline mr-3">Færsla</a>}
                  <a href={`/api/innkaup/return/${r.id}/pdf`} target="_blank" rel="noopener" className="text-red-700 hover:underline mr-3">PDF</a>
                  <button onClick={() => send(r.id)} className="text-blue-700 hover:underline">Senda</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-16 p-4 overflow-y-auto" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-4">Ný skil til birgja</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Birgir</label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">— veldu birgja —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Athugasemd (t.d. ástæða)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="relative mb-3">
              <input value={q} onChange={(e) => search(e.target.value)} placeholder="Leita að vöru til að skila…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" />
              {results.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow max-h-56 overflow-y-auto">
                  {results.map((p) => <button key={p.id} onClick={() => addLine(p)} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex justify-between"><span>{p.name}</span><span className="text-gray-400">{kr(p.cost)}</span></button>)}
                </div>
              )}
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-left"><tr><th className="px-3 py-1.5 font-medium">Vara</th><th className="px-3 py-1.5 font-medium w-16">Magn</th><th className="px-3 py-1.5 font-medium w-28">Ein.verð (án VSK)</th><th className="px-3 py-1.5 font-medium w-16">VSK</th><th></th></tr></thead>
                <tbody>
                  {lines.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">Leitaðu að vöru að ofan</td></tr> : lines.map((l, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-1.5">{l.name}</td>
                      <td className="px-3 py-1.5"><input inputMode="numeric" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} className="w-14 border border-gray-300 rounded px-2 py-1 text-right" /></td>
                      <td className="px-3 py-1.5"><input inputMode="numeric" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: Number(e.target.value) || 0 })} className="w-24 border border-gray-300 rounded px-2 py-1 text-right" /></td>
                      <td className="px-3 py-1.5 text-gray-500">{l.vatRate}%</td>
                      <td className="px-3 py-1.5 text-right"><button onClick={() => removeLine(i)} className="text-gray-300 hover:text-rose-600">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-6 text-sm mb-4">
              <span className="text-gray-500">Án VSK: <b className="text-gray-800">{kr(net)}</b></span>
              <span className="text-gray-500">VSK: <b className="text-gray-800">{kr(vat)}</b></span>
              <span className="text-gray-500">Inneign: <b className="text-gray-900 text-base">{kr(net + vat)}</b></span>
            </div>
            {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">Hætta við</button>
              <button onClick={create} disabled={busy || !lines.length} className="px-5 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-40">{busy ? "Bóka…" : "Bóka skil"}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm shadow-lg">{toast}</div>}
    </div>
  );
}
