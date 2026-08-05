"use client";
import { useCallback, useEffect, useState } from "react";

// Mánaðarblað starfsmanns: einn dagur = ein röð; stimplanir og fjarvistir dagsins inni í röðinni.
// Bæta við / leiðrétta / eyða — vinna er með inn/út-tímum, fjarvist (veikindi/orlof/...) með klst.
interface Entry { id: string; entry_type: string; note: string | null; register_id: string | null; edited_by: string | null; clock_in: string; clock_out: string | null; day: string; hours: number }
// Hádegismatarfrádráttur dagsins (sjálfvirkur, 12–14, 5+ klst dagar) eða yfirseta („matur greiddur").
interface DayLunch { day: string; deducted: number; overridden: boolean; movedToEftir: number }

const TYPE_LABEL: Record<string, string> = { work: "Vinna", sick: "Veikindi", vacation: "Orlof", holiday: "Frídagur", absence: "Fjarvist" };
const TYPE_CLS: Record<string, string> = {
  sick: "bg-rose-100 text-rose-700", vacation: "bg-blue-100 text-blue-700",
  holiday: "bg-purple-100 text-purple-700", absence: "bg-gray-200 text-gray-600",
};
const VIKUDAGAR = ["sun", "mán", "þri", "mið", "fim", "fös", "lau"];
const MANUDIR = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];

const p2 = (n: number) => String(n).padStart(2, "0");
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
const hhmm = (v: string) => { const d = new Date(v); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const klst = (n: number) => n.toLocaleString("is-IS", { maximumFractionDigits: 2 });

interface EditState {
  id?: string; day: string; type: string;
  cin: string; cout: string;   // datetime-local (vinna)
  hours: string; note: string; // fjarvist
}

export default function MonthSheet({ employeeId }: { employeeId: string }) {
  const [month, setMonth] = useState(thisMonth());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lunches, setLunches] = useState<Map<string, DayLunch>>(new Map());
  const [edit, setEdit] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/timar?employee=${employeeId}&month=${month}`);
    const d = await r.json();
    setEntries(d.entries ?? []);
    setLunches(new Map(((d.lunches ?? []) as DayLunch[]).map((l) => [l.day, l])));
  }, [employeeId, month]);
  useEffect(() => { load(); }, [load]);

  // „Matur greiddur"-víxlun: unnið í gegnum matinn → enginn frádráttur, tíminn á eftirvinnukaupi.
  async function toggleLunch(day: string, paid: boolean) {
    await fetch("/api/timar/matur", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employee_id: employeeId, day, paid }) });
    load();
  }

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => `${y}-${p2(m)}-${p2(i + 1)}`);
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) { if (!byDay.has(e.day)) byDay.set(e.day, []); byDay.get(e.day)!.push(e); }

  const sumBy = (t?: string) => entries.filter((e) => (t ? e.entry_type === t : e.entry_type !== "work")).reduce((s, e) => s + e.hours, 0);
  const workH = entries.filter((e) => e.entry_type === "work").reduce((s, e) => s + e.hours, 0);

  const shiftMonth = (d: number) => { const dt = new Date(y, m - 1 + d, 1); setMonth(`${dt.getFullYear()}-${p2(dt.getMonth() + 1)}`); };

  function openAdd(day: string) {
    setErr("");
    setEdit({ day, type: "work", cin: `${day}T09:00`, cout: `${day}T17:00`, hours: "8", note: "" });
  }
  function openEdit(e: Entry) {
    setErr("");
    const toLocal = (v: string) => { const d = new Date(v); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
    setEdit({
      id: e.id, day: e.day, type: e.entry_type,
      cin: toLocal(e.clock_in), cout: e.clock_out ? toLocal(e.clock_out) : "",
      hours: String(e.hours || 8), note: e.note ?? "",
    });
  }

  async function save() {
    if (!edit) return;
    setBusy(true); setErr("");
    try {
      const isWork = edit.type === "work";
      const body = edit.id
        ? { id: edit.id, entry_type: edit.type, note: edit.note,
            ...(isWork ? { clock_in: new Date(edit.cin).toISOString(), clock_out: edit.cout ? new Date(edit.cout).toISOString() : null } : { hours: Number(edit.hours.replace(",", ".")) || 8 }) }
        : { employee_id: employeeId, entry_type: edit.type, note: edit.note,
            ...(isWork ? { clock_in: new Date(edit.cin).toISOString(), clock_out: edit.cout ? new Date(edit.cout).toISOString() : undefined } : { date: edit.day, hours: Number(edit.hours.replace(",", ".")) || 8 }) };
      const r = await fetch("/api/timar", { method: edit.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Villa"); return; }
      setEdit(null); load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Eyða þessari færslu?")) return;
    await fetch(`/api/timar?id=${id}`, { method: "DELETE" });
    load();
  }

  const inp = "border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-red-400";
  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={() => shiftMonth(-1)} className="w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-50">‹</button>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inp} />
        <button onClick={() => shiftMonth(1)} className="w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-50">›</button>
        <span className="font-semibold">{MANUDIR[m - 1]} {y}</span>
        <span className="ml-auto text-sm text-gray-600">
          Vinna <b className="tabular-nums">{klst(workH)}</b> klst
          {sumBy("sick") > 0 && <> · Veikindi <b className="tabular-nums">{klst(sumBy("sick"))}</b></>}
          {sumBy("vacation") > 0 && <> · Orlof <b className="tabular-nums">{klst(sumBy("vacation"))}</b></>}
          {(sumBy("holiday") + sumBy("absence")) > 0 && <> · Annað <b className="tabular-nums">{klst(sumBy("holiday") + sumBy("absence"))}</b></>}
          {" "}· Samtals <b className="tabular-nums">{klst(workH + sumBy())}</b> klst
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-4 py-2 font-medium w-28">Dagur</th><th className="px-4 py-2 font-medium">Skráningar</th><th className="px-4 py-2 font-medium text-right w-20">Klst</th><th className="px-4 py-2 w-24" /></tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const list = byDay.get(day) ?? [];
              const dow = new Date(day + "T12:00:00").getDay();
              const weekend = dow === 0 || dow === 6;
              const lunch = lunches.get(day);
              const dayH = list.reduce((s, e) => s + e.hours, 0) - (lunch?.deducted ?? 0);
              return (
                <tr key={day} className={`border-t border-gray-100 ${weekend ? "bg-gray-50/70" : ""}`}>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600"><b>{Number(day.slice(8))}.</b> {VIKUDAGAR[dow]}</td>
                  <td className="px-4 py-2">
                    {list.length === 0 ? <span className="text-gray-300">—</span> : (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {list.map((e) => (
                          <button key={e.id} onClick={() => openEdit(e)} title={`${e.note ?? ""}${e.edited_by ? " (handvirkt breytt)" : ""}`}
                            className={`px-2 py-1 rounded-lg text-xs font-medium hover:ring-2 hover:ring-red-200 ${e.entry_type === "work" ? "bg-[#E4F1F0] text-[#21323A]" : TYPE_CLS[e.entry_type] ?? "bg-gray-100"}`}>
                            {e.entry_type === "work"
                              ? <>{hhmm(e.clock_in)}–{e.clock_out ? hhmm(e.clock_out) : <span className="text-green-700 font-semibold">í vinnu</span>}{e.register_id ? <span className="text-gray-400"> · {e.register_id}</span> : null}</>
                              : <>{TYPE_LABEL[e.entry_type]} ({klst(e.hours)} klst){e.note ? ` — ${e.note.slice(0, 30)}` : ""}</>}
                            {e.edited_by && <span className="ml-1 text-amber-600">✎</span>}
                          </button>
                        ))}
                        {/* Sjálfvirki matarfrádrátturinn (12–14, 5+ klst dagar): smellt á flöguna víxlar
                           „matur greiddur" (unnið í gegn → tíminn á eftirvinnukaupi, enginn frádráttur). */}
                        {lunch && !lunch.overridden && (
                          <button onClick={() => toggleLunch(day, true)} title="Sjálfvirkur hádegismatarfrádráttur — smelltu ef unnið var í gegnum matinn (þá greiðist hann með eftirvinnukaupi)"
                            className="px-2 py-1 rounded-lg text-xs font-medium bg-orange-50 text-orange-700 hover:ring-2 hover:ring-orange-200">
                            −{klst(lunch.deducted)} klst matur
                          </button>
                        )}
                        {lunch?.overridden && (
                          <button onClick={() => toggleLunch(day, false)} title="Unnið í gegnum matinn — greiddur með eftirvinnukaupi. Smelltu til að setja frádráttinn aftur á."
                            className="px-2 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:ring-2 hover:ring-green-200">
                            matur greiddur ✓ (eftirv.)
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{dayH > 0 ? klst(dayH) : ""}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => openAdd(day)} className="text-xs text-gray-400 hover:text-red-600 font-semibold">+ Bæta við</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-1">{edit.id ? "Breyta færslu" : "Ný færsla"}</h2>
            <p className="text-sm text-gray-500 mb-4">{Number(edit.day.slice(8))}. {MANUDIR[m - 1]} {y}</p>
            <label className="block text-sm text-gray-500 mb-1">Tegund</label>
            <select value={edit.type} onChange={(e) => setEdit((p) => p && { ...p, type: e.target.value })} className={`${inp} w-full mb-3`}>
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {edit.type === "work" ? (
              <>
                <label className="block text-sm text-gray-500 mb-1">Inn</label>
                <input type="datetime-local" value={edit.cin} onChange={(e) => setEdit((p) => p && { ...p, cin: e.target.value })} className={`${inp} w-full mb-3`} />
                <label className="block text-sm text-gray-500 mb-1">Út (tómt = enn í vinnu)</label>
                <input type="datetime-local" value={edit.cout} onChange={(e) => setEdit((p) => p && { ...p, cout: e.target.value })} className={`${inp} w-full mb-3`} />
              </>
            ) : (
              <>
                <label className="block text-sm text-gray-500 mb-1">Klukkustundir sem teljast</label>
                <input inputMode="decimal" value={edit.hours} onChange={(e) => setEdit((p) => p && { ...p, hours: e.target.value.replace(/[^\d.,]/g, "") })} className={`${inp} w-full mb-3`} />
              </>
            )}
            <label className="block text-sm text-gray-500 mb-1">Skýring (valfrjálst)</label>
            <input value={edit.note} onChange={(e) => setEdit((p) => p && { ...p, note: e.target.value })} placeholder="t.d. læknisvottorð komið" className={`${inp} w-full mb-4`} />
            {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
            <div className="flex gap-3">
              <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">{busy ? "Vista…" : "Vista"}</button>
              {edit.id && <button onClick={() => { const id = edit.id!; setEdit(null); remove(id); }} className="px-4 py-2.5 rounded-lg border border-rose-200 text-rose-600 text-sm hover:bg-rose-50">Eyða</button>}
              <button onClick={() => setEdit(null)} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm">Hætta við</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
