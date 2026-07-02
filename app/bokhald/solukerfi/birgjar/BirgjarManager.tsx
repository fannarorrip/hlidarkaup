"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupplierRow } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";

type Draft = Record<string, string | boolean>;
const NEW: Draft = {
  name: "", kennitala: "", supplier_number: "", address: "", postal_code: "", city: "",
  phone: "", email: "", payment_terms_days: "0", ap_account: "9300", is_active: true,
};
function toDraft(s: SupplierRow): Draft {
  const d: Draft = { ...NEW };
  for (const k of Object.keys(NEW)) { const v = (s as unknown as Record<string, unknown>)[k]; d[k] = typeof v === "boolean" ? v : v == null ? "" : String(v); }
  return d;
}
const inp = "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-red-400";
const lbl = "block text-xs font-medium text-gray-500 mb-1";

export default function BirgjarManager({ suppliers }: { suppliers: SupplierRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; d: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string | boolean) => setEditing((s) => (s ? { ...s, d: { ...s.d, [k]: v } } : s));
  const field = (k: string, label: string, type = "text") => (
    <div><label className={lbl}>{label}</label><input type={type} value={String(editing?.d[k] ?? "")} onChange={(e) => set(k, e.target.value)} className={inp} /></div>
  );

  const totalOwed = suppliers.reduce((a, s) => a + (Number(s.balance) > 0 ? Number(s.balance) : 0), 0);

  async function save() {
    if (!editing) return;
    setBusy(true); setErr("");
    const url = editing.id ? `/api/suppliers/${editing.id}` : "/api/suppliers";
    const r = await fetch(url, { method: editing.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editing.d) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Villa"); return; }
    setEditing(null); router.refresh();
  }

  async function moveToCustomer() {
    if (!editing?.id) return;
    if (!confirm("Færa þennan lánadrottin yfir í viðskiptamenn? Aðilinn hverfur úr lánadrottnalista (færslusaga varðveitist).")) return;
    setMoving(true); setErr("");
    const r = await fetch(`/api/suppliers/${editing.id}/move-to-customer`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setMoving(false);
    if (!r.ok) { setErr(j.error ?? "Færsla mistókst"); return; }
    setEditing(null); router.push("/bokhald/solukerfi/vidskiptamenn");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => setEditing({ id: null, d: { ...NEW } })} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">+ Nýr birgir</button>
        <div className="text-sm text-gray-600">Ógreitt samtals: <b>{kr(totalOwed)}</b></div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-4 py-2 font-semibold">Birgir</th><th className="px-4 py-2 font-semibold">Kennitala</th><th className="px-4 py-2 font-semibold text-center">Greiðslufrestur</th><th className="px-4 py-2 font-semibold text-right">Staða (ógreitt)</th><th className="px-4 py-2 font-semibold">Staða</th><th></th></tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Engir birgjar skráðir.</td></tr>}
            {suppliers.map((s) => (
              <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{s.name}{s.is_generic && <span className="text-gray-400 text-xs"> (safnliður)</span>}</td>
                <td className="px-4 py-2 text-gray-500">{s.kennitala || "—"}</td>
                <td className="px-4 py-2 text-center text-gray-600">{s.payment_terms_days ? `${s.payment_terms_days} d` : "staðgr."}</td>
                <td className="px-4 py-2 text-right font-medium">{Number(s.balance) ? kr(s.balance) : <span className="text-gray-300">0</span>}</td>
                <td className="px-4 py-2">{s.is_active ? <span className="text-green-700 text-xs">virkur</span> : <span className="text-gray-400 text-xs">óvirkur</span>}</td>
                <td className="px-4 py-2 text-right"><button onClick={() => setEditing({ id: s.id, d: toDraft(s) })} className="text-red-600 hover:text-red-700 text-sm">Breyta</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editing.id ? "Breyta birgi" : "Nýr birgir"}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {field("name", "Nafn")}
              {field("kennitala", "Kennitala")}
              {field("supplier_number", "Birgisnúmer")}
              {field("phone", "Sími")}
              {field("email", "Netfang")}
              {field("address", "Heimilisfang")}
              {field("postal_code", "Póstnúmer")}
              {field("city", "Staður")}
              {field("payment_terms_days", "Greiðslufrestur (dagar)", "number")}
              {field("ap_account", "Lánadrottnalykill")}
              <label className="flex items-center gap-2 text-sm mt-5"><input type="checkbox" checked={!!editing.d.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Virkur</label>
            </div>
            {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
            <div className="flex justify-between items-center gap-3 mt-5">
              {editing.id && !suppliers.find((x) => x.id === editing.id)?.is_generic ? (
                <button onClick={moveToCustomer} disabled={busy || moving}
                  className="px-4 py-2 rounded-lg border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50">
                  {moving ? "Færi…" : "← Færa í viðskiptamenn"}
                </button>
              ) : <span />}
              <div className="flex gap-3">
                <button onClick={() => !busy && setEditing(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Hætta við</button>
                <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">{busy ? "Vista…" : "Vista"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
