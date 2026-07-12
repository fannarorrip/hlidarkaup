"use client";
import { useEffect, useRef, useState } from "react";

// Afskriftaskráning — scan-first flow: skanni skrifar strikamerkið + Enter → vara valin →
// ástæða + magn → Skrá. Birgðir lækka; ókrediteraðar afskriftir safnast á birgjalista.
interface Hit { product_number: string; name: string; price_gross: number | null; cost_price: string | null; supplier_name: string | null }
interface Row {
  id: string; product_number: string | null; product_name: string; qty: string; unit_cost: string | null;
  reason: string; supplier_name: string | null; note: string | null; status: string; created_at: string;
}
interface Summary { supplier_name: string; items: number; total_qty: string; total_cost: string }

const kr = (n: number) => Math.round(n).toLocaleString("is-IS");
const REASONS = ["útrunnið", "skemmt", "rýrnun", "annað"] as const;

export default function Afskriftir({ initialRows, initialSummary }: { initialRows: Row[]; initialSummary: Summary[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [summary, setSummary] = useState<Summary[]>(initialSummary);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<string>("útrunnið");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  async function refresh() {
    const r = await fetch("/api/afskriftir");
    const j = await r.json();
    if (j.ok) { setRows(j.rows); setSummary(j.summary); }
  }

  function onSearch(v: string) {
    setQ(v); setPicked(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (v.trim().length < 2) { setHits([]); return; }
    debounce.current = setTimeout(async () => {
      const r = await fetch("/api/afskriftir?q=" + encodeURIComponent(v));
      const j = await r.json();
      if (j.ok) {
        setHits(j.hits);
        // scanner flow: exact barcode → single hit → auto-pick
        if (j.hits.length === 1 && v.replace(/\D/g, "").length >= 8) pick(j.hits[0]);
      }
    }, 200);
  }

  function pick(h: Hit) {
    setPicked(h); setHits([]); setQ(h.name); setQty("1");
  }

  async function record() {
    if (!picked || !(Number(qty) > 0)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/afskriftir", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ productNumber: picked.product_number, qty: Number(qty), reason, note }),
      });
      const j = await r.json();
      if (j.ok) {
        setMsg(`✓ ${picked.name} — ${qty} stk skráð (${reason}).`);
        setPicked(null); setQ(""); setQty("1"); setNote("");
        await refresh();
        searchRef.current?.focus();
      } else setMsg(j.message || "Mistókst.");
    } catch { setMsg("Villa."); }
    finally { setBusy(false); }
  }

  async function undo(row: Row) {
    if (!window.confirm(`Eyða afskrift: ${row.product_name} (${Number(row.qty)} stk)? Birgðir hækka aftur.`)) return;
    const r = await fetch("/api/afskriftir", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id }) });
    const j = await r.json();
    setMsg(j.ok ? "Afskrift eytt — birgðir leiðréttar." : (j.message || "Mistókst."));
    if (j.ok) await refresh();
  }

  async function credit(s: Summary) {
    if (!window.confirm(`Merkja ${s.items} afskriftir frá ${s.supplier_name} sem KREDITAÐAR? (kreditreikningur móttekinn)`)) return;
    const r = await fetch("/api/afskriftir", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "credit", supplier: s.supplier_name }) });
    const j = await r.json();
    setMsg(j.ok ? `✓ ${j.credited} færslur merktar kreditaðar.` : "Mistókst.");
    if (j.ok) await refresh();
  }

  return (
    <div className="space-y-5">
      {/* Skráning */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-3xl">
        <div className="relative">
          <input ref={searchRef} value={q} onChange={(e) => onSearch(e.target.value)}
            placeholder="📷 Skannaðu strikamerki eða leitaðu að vöru…"
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-red-400 outline-none" />
          {hits.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {hits.map((h) => (
                <button key={h.product_number} onClick={() => pick(h)}
                  className="w-full text-left px-4 py-2.5 hover:bg-red-50 border-b border-gray-50 last:border-0">
                  <span className="font-medium">{h.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{h.product_number}{h.supplier_name ? ` · ${h.supplier_name}` : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {picked && (
          <div className="mt-4 rounded-xl bg-red-50/50 border border-red-100 p-4">
            <p className="font-semibold">{picked.name}
              <span className="ml-2 text-xs font-normal text-gray-400">{picked.product_number}{picked.supplier_name ? ` · ${picked.supplier_name}` : ""}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Magn</label>
                <input type="number" min={0.1} step="any" value={qty} onChange={(e) => setQty(e.target.value)}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-center text-lg font-bold tabular-nums" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Ástæða</label>
                <div className="flex gap-1.5">
                  {REASONS.map((r) => (
                    <button key={r} onClick={() => setReason(r)}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold capitalize border
                        ${reason === r ? "bg-red-700 text-white border-red-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Athugasemd (valkvætt)"
                className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={record} disabled={busy || !(Number(qty) > 0)}
                className="px-6 py-2.5 rounded-xl bg-red-700 text-white font-bold hover:bg-red-800 disabled:opacity-40">
                {busy ? "Skrái…" : "Skrá afskrift"}
              </button>
            </div>
          </div>
        )}
        {msg && <p className="mt-3 text-sm text-gray-600">{msg}</p>}
      </div>

      {/* Kreditlisti birgja */}
      {summary.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-5 max-w-3xl">
          <p className="font-semibold text-sm mb-1">🤝 Kreditlisti birgja (ókrediterað)</p>
          <p className="text-xs text-gray-500 mb-3">Margir birgjar (Mata, Myllan, Ísfugl, Gæðabakstur…) kreditera afskriftir — sýndu þeim listann og merktu kreditað þegar kreditreikningurinn berst.</p>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="text-xs text-gray-400 text-left">
              <tr><th className="py-1.5 font-medium">Birgir</th><th className="py-1.5 font-medium text-center">Færslur</th><th className="py-1.5 font-medium text-right">Magn</th><th className="py-1.5 font-medium text-right">Kostnaður</th><th></th></tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.supplier_name} className="border-t border-gray-50">
                  <td className="py-2 font-medium">{s.supplier_name}</td>
                  <td className="py-2 text-center tabular-nums">{s.items}</td>
                  <td className="py-2 text-right tabular-nums">{Number(s.total_qty)}</td>
                  <td className="py-2 text-right tabular-nums font-semibold">{kr(Number(s.total_cost))} kr.</td>
                  <td className="py-2 text-right">
                    <button onClick={() => credit(s)} className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-50">Merkja kreditað</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Nýlegar afskriftir */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="font-semibold text-sm mb-3">Nýlegar afskriftir (30 dagar)</p>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400">Engar afskriftir skráðar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400 text-left">
                <tr><th className="py-1.5 font-medium">Dags.</th><th className="py-1.5 font-medium">Vara</th><th className="py-1.5 font-medium text-center">Magn</th><th className="py-1.5 font-medium">Ástæða</th><th className="py-1.5 font-medium">Birgir</th><th className="py-1.5 font-medium text-right">Kostn.</th><th className="py-1.5 font-medium">Staða</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50">
                    <td className="py-1.5 text-gray-500 text-xs whitespace-nowrap">{r.created_at.slice(0, 16).replace("T", " ")}</td>
                    <td className="py-1.5">{r.product_name}{r.note && <span className="block text-[11px] text-gray-400">{r.note}</span>}</td>
                    <td className="py-1.5 text-center tabular-nums">{Number(r.qty)}</td>
                    <td className="py-1.5 capitalize text-gray-600">{r.reason}</td>
                    <td className="py-1.5 text-gray-500 text-xs">{r.supplier_name || "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-500">{r.unit_cost ? kr(Number(r.unit_cost) * Number(r.qty)) : "—"}</td>
                    <td className="py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${r.status === "credited" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                        {r.status === "credited" ? "kreditað" : "ókrediterað"}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      {r.status === "recorded" && (
                        <button onClick={() => undo(r)} title="Eyða (birgðir hækka aftur)"
                          className="inline-flex items-center justify-center w-8 h-8 text-gray-300 hover:text-red-600 text-sm">×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
