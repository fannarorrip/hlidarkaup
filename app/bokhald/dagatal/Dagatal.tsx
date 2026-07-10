"use client";
import { useCallback, useEffect, useState } from "react";

// Dagatal (mánaðaryfirlit) + áminningastjórnun.
interface Def {
  id: string; title: string; description: string | null; category: string; schedule_kind: string;
  weekday: number | null; day_of_month: number | null; month: number | null; due_date: string | null;
  lead_days: number; email_escalate: boolean; is_active: boolean;
}
interface CalEvent { date: string; title: string; category: string; done: boolean }

const DAGAR = ["", "Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
const MONTHS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
const ICON: Record<string, string> = { skattur: "🏛️", ritúal: "🔁", pöntun: "📦", annað: "📌" };
const iso = (d: Date) => d.toISOString().slice(0, 10);

function Manager({ defs, onChange }: { defs: Def[]; onChange: () => void }) {
  const empty = { title: "", description: "", category: "annað", schedule_kind: "weekly", weekday: 5, day_of_month: 1, month: 1, due_date: "", lead_days: 2, email_escalate: false };
  const [form, setForm] = useState<Record<string, unknown>>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await fetch("/api/reminders", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editing || undefined, ...form }) });
      setForm(empty); setEditing(null); onChange();
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("Eyða áminningu?")) return;
    await fetch("/api/reminders", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    onChange();
  }
  function edit(d: Def) {
    setEditing(d.id);
    setForm({ title: d.title, description: d.description || "", category: d.category, schedule_kind: d.schedule_kind,
      weekday: d.weekday || 5, day_of_month: d.day_of_month || 1, month: d.month || 1, due_date: d.due_date || "", lead_days: d.lead_days, email_escalate: d.email_escalate });
  }
  const k = String(form.schedule_kind);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="font-semibold text-sm mb-3">Áminningar & ritúöl</p>
      <div className="space-y-1.5 mb-4">
        {defs.filter((d) => d.is_active).map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
            <div>
              <span className="font-medium">{ICON[d.category] || "📌"} {d.title}</span>
              <span className="ml-2 text-[11px] text-gray-400">
                {d.schedule_kind === "weekly" ? `vikulega — ${DAGAR[d.weekday || 0]}`
                  : d.schedule_kind === "monthly" ? `mánaðarlega — ${d.day_of_month}.`
                  : d.schedule_kind === "yearly" ? `árlega — ${d.day_of_month}. ${MONTHS[(d.month || 1) - 1]}`
                  : `einu sinni — ${d.due_date}`}
                {d.email_escalate && " · ✉︎ póstur"}
              </span>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => edit(d)} className="text-xs text-gray-500 hover:text-red-700">✎</button>
              <button onClick={() => remove(d.id)} className="text-xs text-gray-300 hover:text-red-600">×</button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 p-3 bg-gray-50/50">
        <p className="text-xs font-semibold text-gray-500 mb-2">{editing ? "Breyta" : "Ný áminning"}</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input value={String(form.title)} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Titill (t.d. Panta frá X)" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm sm:col-span-2" />
          <input value={String(form.description)} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Lýsing (valkvætt)" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm sm:col-span-2" />
          <select value={k} onChange={(e) => setForm((p) => ({ ...p, schedule_kind: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="weekly">Vikulega</option><option value="monthly">Mánaðarlega</option><option value="yearly">Árlega</option><option value="oneoff">Einu sinni</option>
          </select>
          <select value={String(form.category)} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="ritúal">Ritúal</option><option value="pöntun">Pöntun</option><option value="skattur">Skattur</option><option value="annað">Annað</option>
          </select>
          {k === "weekly" && (
            <select value={Number(form.weekday)} onChange={(e) => setForm((p) => ({ ...p, weekday: Number(e.target.value) }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{["", "Mánudagur", "Þriðjudagur", "Miðvikudagur", "Fimmtudagur", "Föstudagur", "Laugardagur", "Sunnudagur"][d]}</option>)}
            </select>
          )}
          {k === "monthly" && <input type="number" min={1} max={31} value={Number(form.day_of_month)} onChange={(e) => setForm((p) => ({ ...p, day_of_month: Number(e.target.value) }))} placeholder="Dagur (1-31)" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />}
          {k === "yearly" && (
            <div className="flex gap-2">
              <input type="number" min={1} max={31} value={Number(form.day_of_month)} onChange={(e) => setForm((p) => ({ ...p, day_of_month: Number(e.target.value) }))} placeholder="Dagur" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-20" />
              <select value={Number(form.month)} onChange={(e) => setForm((p) => ({ ...p, month: Number(e.target.value) }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1">
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
          {k === "oneoff" && <input type="date" value={String(form.due_date)} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />}
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={!!form.email_escalate} onChange={(e) => setForm((p) => ({ ...p, email_escalate: e.target.checked }))} />
            Senda áminningarpóst ef ógert
          </label>
          <input type="number" min={0} value={Number(form.lead_days)} onChange={(e) => setForm((p) => ({ ...p, lead_days: Number(e.target.value) }))} title="Minna svona mörgum dögum áður" placeholder="Dagar á undan" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={save} disabled={busy || !String(form.title).trim()} className="px-4 py-1.5 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-40">{editing ? "Vista breytingar" : "Bæta við"}</button>
          {editing && <button onClick={() => { setEditing(null); setForm(empty); }} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600">Hætta við</button>}
        </div>
      </div>
    </div>
  );
}

export default function Dagatal({ defs: initialDefs }: { defs: Def[] }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [defs, setDefs] = useState<Def[]>(initialDefs);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const loadEvents = useCallback(async () => {
    const r = await fetch(`/api/dagatal?from=${iso(monthStart)}&to=${iso(monthEnd)}`);
    const j = await r.json();
    if (j.ok) setEvents(j.events);
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadDefs = useCallback(async () => {
    const r = await fetch("/api/reminders"); const j = await r.json(); if (j.ok) setDefs(j.defs);
  }, []);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  // build grid: leading blanks (Mon-start) + days
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = monthEnd.getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const todayIso = iso(new Date());
  const evByDay = (day: number) => events.filter((e) => e.date === iso(new Date(cursor.getFullYear(), cursor.getMonth(), day)));

  return (
    <div className="grid lg:grid-cols-3 gap-5 items-start">
      <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">←</button>
          <p className="font-bold capitalize">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</p>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">→</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-gray-400 mb-1">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => <div key={d}>{DAGAR[d]}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} className="aspect-square" />;
            const dayIso = iso(new Date(cursor.getFullYear(), cursor.getMonth(), day));
            const evs = evByDay(day);
            const isToday = dayIso === todayIso;
            return (
              <div key={i} className={`aspect-square rounded-lg border p-1 overflow-hidden ${isToday ? "border-red-400 bg-red-50" : "border-gray-100"}`}>
                <div className={`text-[11px] font-semibold ${isToday ? "text-red-700" : "text-gray-500"}`}>{day}</div>
                <div className="space-y-0.5 mt-0.5">
                  {evs.slice(0, 3).map((e, j) => (
                    <div key={j} title={e.title} className={`text-[9px] leading-tight truncate rounded px-1 ${e.category === "skattur" ? "bg-blue-100 text-blue-800" : e.category === "ritúal" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"} ${e.done ? "line-through opacity-50" : ""}`}>
                      {e.title}
                    </div>
                  ))}
                  {evs.length > 3 && <div className="text-[9px] text-gray-400">+{evs.length - 3}</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 mt-3 text-[11px] text-gray-500">
          <span><span className="inline-block w-2.5 h-2.5 rounded bg-blue-200 mr-1 align-middle"></span>Skattur/skil</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded bg-emerald-200 mr-1 align-middle"></span>Ritúal/pöntun</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded bg-gray-200 mr-1 align-middle"></span>Annað</span>
        </div>
      </div>

      <Manager defs={defs} onChange={() => { loadDefs(); loadEvents(); }} />
    </div>
  );
}
