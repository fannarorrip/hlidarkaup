"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";
import type { PORow, LowStockRow } from "@/lib/purchase-orders";

interface DraftLine { product_number: string | null; name: string; qty: number; unit_cost_est: number }
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Drög", cls: "bg-gray-100 text-gray-600" },
  sent: { label: "Send", cls: "bg-blue-100 text-blue-800" },
  received: { label: "Móttekin", cls: "bg-green-100 text-green-800" },
  cancelled: { label: "Afturkölluð", cls: "bg-gray-100 text-gray-400" },
};

export default function PurchaseOrders({ orders, lowStock, suppliers }: { orders: PORow[]; lowStock: LowStockRow[]; suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; price: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const note4 = (m: string) => { setToast(m); setTimeout(() => setToast(""), 4000); };
  const total = lines.reduce((s, l) => s + l.qty * l.unit_cost_est, 0);

  async function search(v: string) {
    setQ(v); if (v.trim().length < 2) { setResults([]); return; }
    const r = await fetch(`/api/kassi/search?q=${encodeURIComponent(v.trim())}`);
    setResults((await r.json()).products ?? []);
  }
  const addLine = (p: { id: string; name: string; price: number }) => {
    setLines((ls) => ls.some((l) => l.product_number === p.id) ? ls : [...ls, { product_number: p.id, name: p.name, qty: 1, unit_cost_est: 0 }]);
    setQ(""); setResults([]);
  };
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));

  function openBlank() { setSupplierId(""); setNote(""); setLines([]); setErr(""); setCreating(true); }
  function openFromSupplier(sid: string | null, name: string | null) {
    const group = lowStock.filter((p) => (p.preferred_supplier_id ?? "") === (sid ?? ""));
    setSupplierId(sid ?? "");
    setNote("");
    setLines(group.map((p) => ({ product_number: p.product_number, name: p.name, qty: Math.max(1, Math.round(Number(p.suggested_qty) || Number(p.reorder_qty) || Number(p.reorder_point) || 1)), unit_cost_est: Math.round(Number(p.cost_price) || 0) })));
    setErr(""); setCreating(true);
  }

  async function create() {
    if (!lines.length) { setErr("Engar línur"); return; }
    setBusy(true); setErr("");
    const supplier = suppliers.find((s) => s.id === supplierId);
    const r = await fetch("/api/innkaup/po", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supplierId: supplierId || null, supplierName: supplier?.name ?? null, note, lines }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setErr(d.error ?? "Villa"); return; }
    setCreating(false); note4(`Pöntun ${d.po_number} búin til`); router.refresh();
  }
  async function send(po: PORow, via: "email" | "inexchange") {
    const r = await fetch(`/api/innkaup/po/${po.id}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ via }) });
    const d = await r.json().catch(() => ({}));
    note4(d.ok ? `Pöntun send (${via})` : (d.error ?? "Villa við sendingu")); router.refresh();
  }
  async function cancel(po: PORow) {
    if (!confirm(`Afturkalla pöntun ${po.po_number}?`)) return;
    await fetch(`/api/innkaup/po/${po.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    router.refresh();
  }

  // group low-stock by preferred supplier
  const groups = new Map<string, { name: string | null; sid: string | null; items: LowStockRow[] }>();
  for (const p of lowStock) { const k = p.preferred_supplier_id ?? "—"; if (!groups.has(k)) groups.set(k, { name: p.supplier_name, sid: p.preferred_supplier_id, items: [] }); groups.get(k)!.items.push(p); }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={openBlank} className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700">+ Ný pöntun</button>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="font-semibold text-amber-900 mb-2">⚠ Vörur undir öryggisbirgðum ({lowStock.length})</p>
          <div className="space-y-3">
            {[...groups.values()].map((g, i) => (
              <div key={i} className="bg-white rounded-lg border border-amber-100 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{g.name ?? "Án valins birgja"}</span>
                  <button onClick={() => openFromSupplier(g.sid, g.name)} className="text-sm px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700">Búa til pöntun ({g.items.length})</button>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[480px]">
                  <thead className="text-gray-400 text-left">
                    <tr><th className="font-medium pb-1">Vara</th><th className="font-medium pb-1 text-right">Staða / öryggi</th><th className="font-medium pb-1 text-right">Selt ~/mán</th><th className="font-medium pb-1 text-right">Tillaga</th></tr>
                  </thead>
                  <tbody>
                    {g.items.map((p) => (
                      <tr key={p.product_number} className="border-t border-gray-50">
                        <td className="py-1 text-gray-700">{p.name}</td>
                        <td className="py-1 text-right text-gray-500 tabular-nums">{Math.round(Number(p.stock_quantity))} / {Math.round(Number(p.reorder_point))}</td>
                        <td className="py-1 text-right text-gray-500 tabular-nums">{p.monthly_demand > 0 ? `≈ ${p.monthly_demand}` : "—"}</td>
                        <td className="py-1 text-right font-semibold text-amber-800 tabular-nums">{p.suggested_qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-4 py-2 font-medium">Nr.</th><th className="px-4 py-2 font-medium">Birgir</th><th className="px-4 py-2 font-medium text-center">Línur</th><th className="px-4 py-2 font-medium text-right">Áætlað</th><th className="px-4 py-2 font-medium">Staða</th><th className="px-4 py-2 font-medium text-right">Aðgerðir</th></tr>
          </thead>
          <tbody>
            {orders.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Engar pantanir enn</td></tr> : orders.map((po) => (
              <tr key={po.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono">{po.po_number}</td>
                <td className="px-4 py-2">{po.supplier_name ?? "—"}</td>
                <td className="px-4 py-2 text-center text-gray-600">{po.line_count}</td>
                <td className="px-4 py-2 text-right">{kr(Number(po.total_est))}</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${STATUS[po.status]?.cls ?? "bg-gray-100"}`}>{STATUS[po.status]?.label ?? po.status}</span></td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <a href={`/api/innkaup/po/${po.id}/pdf`} target="_blank" rel="noopener" className="text-red-700 hover:underline mr-3">PDF</a>
                  {po.status !== "cancelled" && po.status !== "received" && <button onClick={() => send(po, "email")} className="text-blue-700 hover:underline mr-3">Senda</button>}
                  {po.status === "draft" && <button onClick={() => cancel(po)} className="text-gray-400 hover:text-rose-600">Afturkalla</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-16 p-4 overflow-y-auto" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-4">Ný innkaupapöntun</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Birgir</label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">— veldu birgja —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Athugasemd</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="relative mb-3">
              <input value={q} onChange={(e) => search(e.target.value)} placeholder="Leita að vöru til að bæta við…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" />
              {results.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow max-h-56 overflow-y-auto">
                  {results.map((p) => <button key={p.id} onClick={() => addLine(p)} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">{p.name}</button>)}
                </div>
              )}
            </div>

            <div className="border border-gray-200 rounded-lg overflow-x-auto mb-3">
              <table className="w-full text-sm min-w-[440px]">
                <thead className="bg-gray-50 text-gray-500 text-left"><tr><th className="px-3 py-1.5 font-medium">Vara</th><th className="px-3 py-1.5 font-medium w-20">Magn</th><th className="px-3 py-1.5 font-medium w-28">Áætl. verð</th><th></th></tr></thead>
                <tbody>
                  {lines.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Engar línur — leitaðu að vöru að ofan</td></tr> : lines.map((l, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-1.5">{l.name}</td>
                      <td className="px-3 py-1.5"><input inputMode="numeric" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} className="w-16 border border-gray-300 rounded px-2 py-1 text-right" /></td>
                      <td className="px-3 py-1.5"><input inputMode="numeric" value={l.unit_cost_est} onChange={(e) => setLine(i, { unit_cost_est: Number(e.target.value) || 0 })} className="w-24 border border-gray-300 rounded px-2 py-1 text-right" /></td>
                      <td className="px-3 py-1.5 text-right"><button onClick={() => removeLine(i)} className="text-gray-300 hover:text-rose-600">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mb-4"><span className="text-gray-500 text-sm">Áætlað samtals</span><span className="text-xl font-bold">{kr(total)}</span></div>
            {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">Hætta við</button>
              <button onClick={create} disabled={busy || !lines.length} className="px-5 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-40">{busy ? "Vista…" : "Stofna pöntun"}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm shadow-lg">{toast}</div>}
    </div>
  );
}
