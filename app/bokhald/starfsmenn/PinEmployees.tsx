"use client";
import { useCallback, useEffect, useState } from "react";

// Afgreiðslustarfsmenn með PIN — engin innskráning, ekkert netfang/lykilorð. PIN-inn opnar
// kassana, stimplar inn/út og merkir sölur viðkomandi. Úthlutast sjálfkrafa, má breyta.
interface Emp { id: string; name: string; kennitala: string | null; has_pin: boolean; is_active: boolean }

const inp = "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400";

export default function PinEmployees() {
  const [rows, setRows] = useState<Emp[]>([]);
  const [name, setName] = useState("");
  const [kt, setKt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState<{ name: string; pin: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/staff/pin-employees");
    const d = await r.json();
    setRows(d.rows ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true); setErr(""); setCreated(null);
    const r = await fetch("/api/staff/pin-employees", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, kennitala: kt }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setErr(d.error ?? "Villa"); return; }
    setCreated({ name, pin: d.pin }); setName(""); setKt(""); load();
  }
  async function patch(id: string, body: Record<string, unknown>) {
    const r = await fetch("/api/staff/pin-employees", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Villa"); }
    load();
  }
  function editPin(e: Emp) {
    const v = prompt(`Nýr 4-stafa PIN fyrir ${e.name} (tómt = fjarlægja):`);
    if (v == null) return;
    patch(e.id, { pin: v.trim() === "" ? null : v.trim() });
  }

  return (
    <div className="mt-10">
      <h2 className="text-lg font-bold mb-1">Afgreiðslustarfsmenn (PIN)</h2>
      <p className="text-sm text-gray-500 mb-4">Þurfa hvorki netfang né lykilorð — PIN-inn opnar kassana, stimplar inn/út og merkir sölur viðkomandi.</p>

      <div className="flex items-end gap-3 flex-wrap mb-3">
        <div><label className="block text-xs text-gray-500 mb-1">Nafn *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Kennitala *</label>
          <input value={kt} onChange={(e) => setKt(e.target.value)} placeholder="10 tölustafir" className={inp} /></div>
        <button onClick={create} disabled={busy || !name.trim()} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
          {busy ? "Stofna…" : "+ Nýr afgreiðslustarfsmaður"}
        </button>
      </div>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {created && (
        <p className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2.5 mb-3">
          <b>{created.name}</b> stofnaður — PIN-kóðinn er <b className="text-lg tracking-widest">{created.pin}</b> (láttu viðkomandi leggja hann á minnið).
        </p>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-4 py-2 font-medium">Nafn</th><th className="px-4 py-2 font-medium">Kennitala</th><th className="px-4 py-2 font-medium">PIN</th><th className="px-4 py-2 font-medium">Staða</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-5 text-center text-gray-400">Engir enn — stofnaðu fyrsta að ofan</td></tr>
              : rows.map((e) => (
                <tr key={e.id} className={`border-t border-gray-100 ${e.is_active ? "" : "opacity-50"}`}>
                  <td className="px-4 py-2 font-medium">{e.name}</td>
                  <td className="px-4 py-2 text-gray-500 font-mono text-xs">{e.kennitala ?? "—"}</td>
                  <td className="px-4 py-2 font-mono tracking-widest">{e.has_pin ? <span title="PIN er settur — sést hvergi; nota Breyta PIN til að setja nýjan">●●●●</span> : <span className="text-gray-300">enginn</span>}</td>
                  <td className="px-4 py-2">{e.is_active ? <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700">Virkur</span> : <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">Óvirkur</span>}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => editPin(e)} className="text-xs text-gray-500 hover:text-red-700 mr-3">Breyta PIN</button>
                    <button onClick={() => patch(e.id, { is_active: !e.is_active })} className="text-xs text-gray-500 hover:text-red-700">{e.is_active ? "Gera óvirkan" : "Virkja"}</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
