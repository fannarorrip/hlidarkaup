"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Hjartsláttur innkaupanna — ALLT breytanlegt:
//  · hver birgi í "Í dag pantast" er smellanlegur (sniðmát búið til sjálfkrafa ef ekkert er til)
//  · pöntunareyðublað: magn-innsláttur, leit, bæta við línu, eyða línu, vista magn sem venjulegt
//  · dagatalið sjálft: bæta við / breyta / eyða birgjum og skilafresti (✎)
interface ScheduleEntry { id: string; weekday: number; supplier_name: string; deadline: string | null; note: string | null; template_id: string | null }
interface TemplateRow { id: string; supplier_name: string; name: string; note: string | null; line_count: number; matched_count: number }
interface EditorLine {
  line_no: number; vnr: string | null; ean: string | null; product_number: string | null;
  name: string; default_qty: string | null; unit: string | null; min_qty: string | null;
  cost_price: string | null; stock: string | null;
}

const DAGAR = ["", "Mánudagur", "Þriðjudagur", "Miðvikudagur", "Fimmtudagur", "Föstudagur", "Laugardagur", "Sunnudagur"];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const kr = (n: number) => Math.round(n).toLocaleString("is-IS");

function deadlineState(deadline: string | null): "passed" | "soon" | "ok" | null {
  if (!deadline) return null;
  const [h, m] = deadline.split(":").map(Number);
  const now = new Date();
  const mins = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
  if (mins < 0) return "passed";
  if (mins <= 90) return "soon";
  return "ok";
}

// ── Pöntunareyðublað + sniðmátsbreytingar (modal) ────────────────────────────
function OrderEditor({ templateId, supplierLabel, onClose, onCreated }: {
  templateId: string; supplierLabel: string; onClose: () => void; onCreated: (po: string) => void;
}) {
  const [lines, setLines] = useState<EditorLine[] | null>(null);
  const [title, setTitle] = useState(supplierLabel);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [newLine, setNewLine] = useState({ name: "", vnr: "", qty: "" });
  const firstInput = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await fetch(`/api/innkaup/template/${templateId}`);
    const j = await r.json();
    if (!j.ok) { setErr(j.message || "Villa"); return; }
    setTitle(j.template.supplier_name);
    setLines(j.lines);
    const q: Record<number, string> = {};
    for (const l of j.lines) { const d = Number(l.default_qty); if (d > 0) q[l.line_no] = String(d); }
    setQty(q);
  }
  useEffect(() => { load().catch(() => setErr("Villa við að sækja sniðmát.")); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [templateId]);
  useEffect(() => { firstInput.current?.focus(); }, [lines === null]);

  const visible = (lines ?? []).filter((l) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return l.name.toLowerCase().includes(f) || (l.vnr ?? "").toLowerCase().includes(f);
  });
  const chosen = (lines ?? []).filter((l) => Number(qty[l.line_no]) > 0);
  const totalEst = chosen.reduce((s, l) => s + (Number(qty[l.line_no]) || 0) * (Number(l.cost_price) || 0), 0);

  async function submit() {
    setBusy(true); setErr(""); setInfo("");
    try {
      const quantities: Record<number, number> = {};
      for (const [k, v] of Object.entries(qty)) { const n = Number(v); if (n > 0) quantities[Number(k)] = n; }
      const r = await fetch(`/api/innkaup/template/${templateId}/po`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantities }),
      });
      const j = await r.json();
      if (j.ok) onCreated(j.po.po_number);
      else setErr(j.message || "Mistókst.");
    } catch { setErr("Villa."); }
    finally { setBusy(false); }
  }

  async function saveDefaults() {
    setBusy(true); setErr(""); setInfo("");
    try {
      const defaults: Record<number, number | null> = {};
      for (const l of lines ?? []) { const n = Number(qty[l.line_no]); defaults[l.line_no] = n > 0 ? n : null; }
      const r = await fetch(`/api/innkaup/template/${templateId}/lines`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ defaults }),
      });
      const j = await r.json();
      setInfo(j.ok ? "✓ Magn vistað sem venjulegt magn." : (j.message || "Mistókst."));
    } catch { setErr("Villa."); }
    finally { setBusy(false); }
  }

  async function addLine() {
    if (!newLine.name.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/innkaup/template/${templateId}/lines`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newLine.name.trim(), vnr: newLine.vnr.trim(), defaultQty: Number(newLine.qty) || undefined }),
      });
      const j = await r.json();
      if (j.ok) {
        setNewLine({ name: "", vnr: "", qty: "" });
        await load();
        if (Number(newLine.qty) > 0) setQty((p) => ({ ...p, [j.line.line_no]: newLine.qty }));
      } else setErr(j.message || "Mistókst.");
    } catch { setErr("Villa."); }
    finally { setBusy(false); }
  }

  async function removeLine(lineNo: number) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/innkaup/template/${templateId}/lines`, {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ lineNo }),
      });
      const j = await r.json();
      if (j.ok) { setLines((p) => (p ?? []).filter((l) => l.line_no !== lineNo)); setQty((p) => { const c = { ...p }; delete c[lineNo]; return c; }); }
      else setErr("Mistókst að eyða línu.");
    } catch { setErr("Villa."); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <p className="font-bold">{title} — pöntun</p>
            <p className="text-xs text-gray-400">Sláðu inn magn — aðeins línur með magn fara í pöntunina. Þú getur bætt við og eytt línum.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-gray-100 text-gray-500 text-xl">×</button>
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-gray-50">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Leita í vörum…"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52" />
          <button onClick={() => setQty({})} className="text-xs text-gray-500 hover:text-red-700 hover:underline">Núllstilla allt</button>
          <button onClick={saveDefaults} disabled={busy} className="text-xs text-gray-500 hover:text-red-700 hover:underline disabled:opacity-40"
            title="Vistar innslegið magn sem venjulegt magn sem birtist næst">Vista magn sem venjulegt</button>
          <span className="ml-auto text-sm text-gray-600">
            <b className="tabular-nums">{chosen.length}</b> línur
            {totalEst > 0 && <> · áætlað <b className="tabular-nums">{kr(totalEst)} kr.</b></>}
          </span>
        </div>

        {(err || info) && (
          <p className={`px-5 py-2 text-sm ${err ? "text-red-700" : "text-green-700"}`}>{err ? `✗ ${err}` : info}</p>
        )}

        <div className="max-h-[52vh] overflow-y-auto px-5">
          {!lines && !err && <p className="py-8 text-center text-sm text-gray-400">Sæki sniðmát…</p>}
          {lines && lines.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">Tómur listi — bættu við fyrstu vörunni að neðan. 👇</p>
          )}
          {lines && lines.length > 0 && (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="text-xs text-gray-400 text-left sticky top-0 bg-white">
                <tr>
                  <th className="py-2 font-medium">Vara</th>
                  <th className="py-2 font-medium w-20">Vnr</th>
                  <th className="py-2 font-medium w-14">Eining</th>
                  <th className="py-2 font-medium w-24 text-right">Kostn.verð</th>
                  <th className="py-2 font-medium w-24 text-center">Magn</th>
                  <th className="py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l, i) => {
                  const v = qty[l.line_no] ?? "";
                  const active = Number(v) > 0;
                  return (
                    <tr key={l.line_no} className={`border-t border-gray-50 ${active ? "bg-red-50/40" : ""}`}>
                      <td className="py-1.5 pr-2">
                        {l.name}
                        {!l.product_number && <span className="ml-1 text-[10px] text-amber-600" title="Ópöruð við vörugrunn">•</span>}
                      </td>
                      <td className="py-1.5 text-gray-400 text-xs">{l.vnr || ""}</td>
                      <td className="py-1.5 text-gray-400 text-xs">{l.unit || ""}</td>
                      <td className="py-1.5 text-right text-gray-500 tabular-nums text-xs">{Number(l.cost_price) ? kr(Number(l.cost_price)) : ""}</td>
                      <td className="py-1.5 text-center">
                        <input
                          ref={i === 0 ? firstInput : undefined}
                          type="number" min={0} inputMode="numeric" value={v}
                          placeholder={l.default_qty ? String(Number(l.default_qty)) : "0"}
                          onChange={(e) => setQty((p) => ({ ...p, [l.line_no]: e.target.value }))}
                          className={`w-20 border rounded-lg px-2 py-1 text-sm text-center tabular-nums ${active ? "border-red-300 font-semibold" : "border-gray-200"}`}
                        />
                      </td>
                      <td className="py-1.5 text-center">
                        <button onClick={() => removeLine(l.line_no)} disabled={busy} title="Eyða línu úr sniðmáti"
                          className="text-gray-300 hover:text-red-600 text-sm">×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Bæta við línu */}
        <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">＋ Ný lína:</span>
          <input value={newLine.name} onChange={(e) => setNewLine((p) => ({ ...p, name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addLine()}
            placeholder="Vöruheiti" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-40" />
          <input value={newLine.vnr} onChange={(e) => setNewLine((p) => ({ ...p, vnr: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addLine()}
            placeholder="Vnr" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24" />
          <input value={newLine.qty} onChange={(e) => setNewLine((p) => ({ ...p, qty: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addLine()}
            type="number" min={0} placeholder="Magn" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24 text-center" />
          <button onClick={addLine} disabled={busy || !newLine.name.trim()}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">Bæta við</button>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">Loka</button>
          <button onClick={submit} disabled={busy || chosen.length === 0}
            className="px-5 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-40">
            {busy ? "Vinn…" : `Búa til pöntun (${chosen.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dagatalsfærsla (modal) ───────────────────────────────────────────────────
function ScheduleModal({ entry, defaultWeekday, onClose, onSaved }: {
  entry: ScheduleEntry | null; defaultWeekday: number; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    weekday: entry?.weekday ?? defaultWeekday,
    supplier_name: entry?.supplier_name ?? "",
    deadline: hhmm(entry?.deadline ?? null) ?? "",
    note: entry?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/innkaup/schedule", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry?.id, ...form }),
      });
      const j = await r.json();
      if (j.ok) onSaved(); else setErr(j.message || "Mistókst.");
    } catch { setErr("Villa."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!entry) return;
    setBusy(true);
    try {
      await fetch("/api/innkaup/schedule", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: entry.id }) });
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold mb-4">{entry ? "Breyta dagatalsfærslu" : "Bæta birgja á dagatalið"}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Vikudagur</label>
            <select value={form.weekday} onChange={(e) => setForm((p) => ({ ...p, weekday: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAGAR[d]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Birgir</label>
            <input value={form.supplier_name} onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))}
              placeholder="t.d. Arna" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Panta fyrir kl. (valkvætt)</label>
            <input type="time" value={form.deadline} onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Athugasemd</label>
            <input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              placeholder="t.d. afhent daginn eftir, sími…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        {err && <p className="mt-3 text-sm text-red-700">✗ {err}</p>}
        <div className="mt-5 flex items-center justify-between">
          {entry ? (
            <button onClick={remove} disabled={busy} className="text-xs text-red-700 hover:underline disabled:opacity-40">Eyða af dagatali</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">Hætta við</button>
            <button onClick={save} disabled={busy || !form.supplier_name.trim()}
              className="px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-40">Vista</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Aðal-kortið ──────────────────────────────────────────────────────────────
export default function Heartbeat({ schedule, templates, todayWeekday }: {
  schedule: ScheduleEntry[]; templates: TemplateRow[]; todayWeekday: number;
}) {
  const router = useRouter();
  const [showWeek, setShowWeek] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editor, setEditor] = useState<{ templateId: string; label: string } | null>(null);
  const [schedEdit, setSchedEdit] = useState<{ entry: ScheduleEntry | null; weekday: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const today = schedule.filter((s) => s.weekday === todayWeekday);
  const tomorrow = schedule.filter((s) => s.weekday === (todayWeekday % 7) + 1);

  // Open the editor for a schedule entry — creates an empty template on the fly when none matches.
  async function openSupplier(s: ScheduleEntry) {
    setMsg(null);
    if (s.template_id) { setEditor({ templateId: s.template_id, label: s.supplier_name }); return; }
    setOpening(s.id);
    try {
      const r = await fetch("/api/innkaup/template", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supplierName: s.supplier_name }),
      });
      const j = await r.json();
      if (j.ok) setEditor({ templateId: j.id, label: s.supplier_name });
      else setMsg(j.message || "Mistókst að opna sniðmát.");
    } catch { setMsg("Villa."); }
    finally { setOpening(null); }
  }

  function SupplierCard({ s }: { s: ScheduleEntry }) {
    const state = deadlineState(s.deadline);
    return (
      <div className={`relative rounded-xl border transition
        ${state === "passed" ? "border-gray-200 bg-gray-50 opacity-70" : state === "soon" ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"}
        hover:border-red-400 hover:shadow-sm`}>
        <button onClick={() => openSupplier(s)} className="w-full text-left px-4 py-3 pr-9">
          <div className="flex items-center justify-between gap-3">
            <span className={`font-semibold text-sm ${state === "passed" ? "text-gray-400" : "text-gray-800"}`}>{s.supplier_name}</span>
            {hhmm(s.deadline) && (
              <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums
                ${state === "passed" ? "bg-gray-200 text-gray-500" : state === "soon" ? "bg-red-600 text-white" : "bg-red-50 text-red-700"}`}>
                {state === "passed" ? "liðið" : `kl. ${hhmm(s.deadline)}`}
              </span>
            )}
          </div>
          {s.note && <p className="mt-1 text-[11px] text-gray-400 line-clamp-2">{s.note}</p>}
          <p className="mt-1.5 text-[11px] font-semibold text-red-700">{opening === s.id ? "Opna…" : "Panta →"}</p>
        </button>
        <button onClick={() => setSchedEdit({ entry: s, weekday: s.weekday })} title="Breyta dagatalsfærslu"
          className="absolute top-2 right-2 w-6 h-6 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 text-xs">✎</button>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold">🫀 Í dag pantast — {DAGAR[todayWeekday]}</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setSchedEdit({ entry: null, weekday: todayWeekday })} className="text-xs text-red-700 hover:underline">＋ Bæta við birgja</button>
            <button onClick={() => setShowWeek((v) => !v)} className="text-xs text-red-700 hover:underline">
              {showWeek ? "Fela vikuna" : "Sjá alla vikuna"}
            </button>
          </div>
        </div>
        {msg && <p className="mb-3 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700">{msg}</p>}
        {today.length === 0 ? (
          <p className="text-sm text-gray-400">Engar fastar pantanir skráðar á {DAGAR[todayWeekday].toLowerCase()}.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {today.map((s) => <SupplierCard key={s.id} s={s} />)}
          </div>
        )}
        {tomorrow.length > 0 && !showWeek && (
          <p className="mt-3 text-xs text-gray-400">Á morgun: {tomorrow.map((s) => s.supplier_name).join(", ")}</p>
        )}
        {showWeek && (
          <div className="mt-5 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const items = schedule.filter((s) => s.weekday === d);
              return (
                <div key={d} className={`rounded-lg border p-3 ${d === todayWeekday ? "border-red-200 bg-red-50/40" : "border-gray-100"}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-gray-500">{DAGAR[d]}</p>
                    <button onClick={() => setSchedEdit({ entry: null, weekday: d })} title="Bæta við birgja"
                      className="text-gray-300 hover:text-red-700 text-xs font-bold">＋</button>
                  </div>
                  <ul className="space-y-1">
                    {items.map((s) => (
                      <li key={s.id} className="group flex items-center gap-1.5">
                        <button onClick={() => openSupplier(s)} title={s.note ?? undefined}
                          className="text-sm text-left text-red-800 hover:underline">
                          {s.supplier_name}
                          {hhmm(s.deadline) && <span className="ml-1 text-xs text-red-700">kl. {hhmm(s.deadline)}</span>}
                        </button>
                        <button onClick={() => setSchedEdit({ entry: s, weekday: d })} title="Breyta"
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-600 text-xs">✎</button>
                      </li>
                    ))}
                    {items.length === 0 && <li className="text-xs text-gray-300">—</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {templates.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-sm">📋 Pöntunarsniðmát ({templates.length})</p>
            <button onClick={() => setShowTemplates((v) => !v)} className="text-xs text-red-700 hover:underline">
              {showTemplates ? "Fela" : "Sýna"}
            </button>
          </div>
          {showTemplates ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
              {templates.map((t) => (
                <button key={t.id} onClick={() => { setMsg(null); setEditor({ templateId: t.id, label: t.supplier_name }); }}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left hover:border-red-300 hover:shadow-sm">
                  <div>
                    <p className="text-sm font-medium">{t.supplier_name}</p>
                    <p className="text-[11px] text-gray-400">{t.name} · {t.line_count} línur</p>
                  </div>
                  <span className="text-xs font-semibold text-red-700">Panta →</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Pöntunarlistar gömlu búðarinnar — smelltu á birgja og sláðu inn magn.</p>
          )}
        </div>
      )}

      {editor && (
        <OrderEditor
          templateId={editor.templateId}
          supplierLabel={editor.label}
          onClose={() => { setEditor(null); router.refresh(); }}
          onCreated={(po) => { setEditor(null); setMsg(`✓ Pöntun ${po} búin til — hún er í listanum að neðan.`); router.refresh(); }}
        />
      )}
      {schedEdit && (
        <ScheduleModal
          entry={schedEdit.entry}
          defaultWeekday={schedEdit.weekday}
          onClose={() => setSchedEdit(null)}
          onSaved={() => { setSchedEdit(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
