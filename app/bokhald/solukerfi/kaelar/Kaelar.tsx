"use client";
import { useState } from "react";

// Kælaaflestur — daily HACCP log: sláðu inn hitastig á hvern kæli/frysti; ✓ innan marka,
// rautt utan marka (athugasemd æskileg). Saga síðustu 14 daga + stjórnun eininga.
interface Unit {
  id: string; name: string; kind: string; min_temp: string; max_temp: string; sort: number;
  today_reading: string | null; today_ok: boolean | null; today_at: string | null;
}
interface Cell { unit_id: string; reading_date: string; reading: string; ok: boolean }

export default function Kaelar({ initialUnits, initialHistory }: { initialUnits: Unit[]; initialHistory: Cell[] }) {
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [hist, setHist] = useState<Cell[]>(initialHistory);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showHist, setShowHist] = useState(false);
  const [manage, setManage] = useState(false);
  const [newUnit, setNewUnit] = useState({ name: "", kind: "kælir", min: "0", max: "4" });

  const done = units.filter((u) => u.today_reading != null).length;

  async function refresh() {
    const r = await fetch("/api/kaelar");
    const j = await r.json();
    if (j.ok) { setUnits(j.units); setHist(j.history); }
  }

  async function save(u: Unit) {
    const v = vals[u.id];
    if (v == null || v.trim() === "") return;
    setBusy(u.id); setMsg(null);
    try {
      const r = await fetch("/api/kaelar", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ unitId: u.id, reading: Number(v.replace(",", ".")), note: notes[u.id] || "" }),
      });
      const j = await r.json();
      if (j.ok) {
        if (!j.within) setMsg(`⚠️ ${u.name}: ${v}°C er UTAN marka (${Number(u.min_temp)}…${Number(u.max_temp)}°C) — athugaðu tækið!`);
        else setMsg(`✓ ${u.name} skráð.`);
        setVals((p) => { const c = { ...p }; delete c[u.id]; return c; });
        setNotes((p) => { const c = { ...p }; delete c[u.id]; return c; });
        await refresh();
      } else setMsg(j.message || "Mistókst.");
    } catch { setMsg("Villa."); }
    finally { setBusy(null); }
  }

  async function addUnit() {
    if (!newUnit.name.trim()) return;
    const r = await fetch("/api/kaelar", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newUnit.name.trim(), kind: newUnit.kind, min: Number(newUnit.min.replace(",", ".")), max: Number(newUnit.max.replace(",", ".")) }),
    });
    const j = await r.json();
    if (j.ok) { setNewUnit({ name: "", kind: "kælir", min: "0", max: "4" }); await refresh(); setMsg("✓ Eining vistuð."); }
    else setMsg(j.message || "Mistókst.");
  }

  async function removeUnit(u: Unit) {
    if (!window.confirm(`Taka ${u.name} af listanum? (Sagan geymist áfram.)`)) return;
    await fetch("/api/kaelar", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: u.id }) });
    await refresh();
  }

  // history matrix: last 14 dates present
  const dates = [...new Set(hist.map((h) => h.reading_date))].sort().slice(-14);
  const cell = (uid: string, d: string) => hist.find((h) => h.unit_id === uid && h.reading_date === d);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-sm">
            Í dag: <span className={done === units.length ? "text-green-700" : "text-amber-600"}>{done} af {units.length} skráð</span>
          </p>
          <div className="flex gap-3">
            <button onClick={() => setManage((v) => !v)} className="text-xs text-red-700 hover:underline">{manage ? "Loka stjórnun" : "Stjórna einingum"}</button>
            <button onClick={() => setShowHist((v) => !v)} className="text-xs text-red-700 hover:underline">{showHist ? "Fela sögu" : "Sjá sögu (14 d.)"}</button>
          </div>
        </div>
        {msg && <p className={`mb-3 text-sm rounded-lg px-3 py-2 ${msg.startsWith("⚠️") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</p>}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {units.map((u) => {
            const recorded = u.today_reading != null;
            const bad = recorded && u.today_ok === false;
            return (
              <div key={u.id} className={`rounded-xl border p-3.5 ${bad ? "border-red-300 bg-red-50" : recorded ? "border-green-200 bg-green-50/40" : "border-gray-200"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{u.kind === "frystir" ? "❄️" : "🧊"} {u.name}</p>
                    <p className="text-[11px] text-gray-400 tabular-nums">{Number(u.min_temp)}…{Number(u.max_temp)}°C</p>
                  </div>
                  {recorded ? (
                    <div className="text-right">
                      <p className={`text-xl font-bold tabular-nums ${bad ? "text-red-700" : "text-green-700"}`}>{Number(u.today_reading)}°</p>
                      <p className="text-[10px] text-gray-400">{u.today_at?.slice(11, 16)}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input value={vals[u.id] ?? ""} onChange={(e) => setVals((p) => ({ ...p, [u.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && save(u)}
                        placeholder="°C" inputMode="decimal"
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-center text-sm tabular-nums" />
                      <button onClick={() => save(u)} disabled={busy !== null || !(vals[u.id] ?? "").trim()}
                        className="px-2.5 py-1.5 rounded-lg bg-gray-800 text-white text-xs font-semibold hover:bg-gray-900 disabled:opacity-30">
                        {busy === u.id ? "…" : "Vista"}
                      </button>
                    </div>
                  )}
                </div>
                {!recorded && (vals[u.id] ?? "") !== "" && (() => {
                  const n = Number((vals[u.id] || "").replace(",", "."));
                  const out = Number.isFinite(n) && (n < Number(u.min_temp) || n > Number(u.max_temp));
                  return out ? (
                    <input value={notes[u.id] ?? ""} onChange={(e) => setNotes((p) => ({ ...p, [u.id]: e.target.value }))}
                      placeholder="⚠️ Utan marka — hvað var gert?"
                      className="mt-2 w-full border border-red-200 rounded-lg px-2 py-1.5 text-xs" />
                  ) : null;
                })()}
                {manage && (
                  <button onClick={() => removeUnit(u)} className="mt-2 text-[11px] text-gray-400 hover:text-red-600">Fjarlægja einingu</button>
                )}
              </div>
            );
          })}
        </div>

        {manage && (
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-gray-100 p-3">
            <span className="text-xs font-semibold text-gray-500">＋ Ný eining:</span>
            <input value={newUnit.name} onChange={(e) => setNewUnit((p) => ({ ...p, name: e.target.value }))}
              placeholder="Heiti (t.d. Kjötkælir 2)" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44" />
            <select value={newUnit.kind} onChange={(e) => setNewUnit((p) => ({ ...p, kind: e.target.value, min: e.target.value === "frystir" ? "-25" : "0", max: e.target.value === "frystir" ? "-18" : "4" }))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="kælir">Kælir</option><option value="frystir">Frystir</option>
            </select>
            <input value={newUnit.min} onChange={(e) => setNewUnit((p) => ({ ...p, min: e.target.value }))} placeholder="Lágm." className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center" />
            <input value={newUnit.max} onChange={(e) => setNewUnit((p) => ({ ...p, max: e.target.value }))} placeholder="Hám." className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center" />
            <button onClick={addUnit} disabled={!newUnit.name.trim()}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">Bæta við</button>
          </div>
        )}
      </div>

      {showHist && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
          <p className="font-semibold text-sm mb-3">Saga — síðustu 14 dagar</p>
          <table className="text-xs">
            <thead>
              <tr>
                <th className="text-left pr-3 py-1 font-medium text-gray-400">Eining</th>
                {dates.map((d) => <th key={d} className="px-1.5 py-1 font-medium text-gray-400 tabular-nums">{d.slice(8, 10)}.{d.slice(5, 7)}</th>)}
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} className="border-t border-gray-50">
                  <td className="pr-3 py-1 whitespace-nowrap">{u.name}</td>
                  {dates.map((d) => {
                    const c = cell(u.id, d);
                    return (
                      <td key={d} className={`px-1.5 py-1 text-center tabular-nums ${c ? (c.ok ? "text-green-700" : "text-white bg-red-600 rounded") : "text-gray-200"}`}>
                        {c ? Number(c.reading) : "·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
