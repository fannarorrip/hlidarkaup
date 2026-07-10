"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Hjartsláttur innkaupanna: "Í dag pantast …" + pöntunarsniðmát gömlu búðarinnar.
interface ScheduleEntry { id: string; weekday: number; supplier_name: string; deadline: string | null; note: string | null }
interface TemplateRow { id: string; supplier_name: string; name: string; note: string | null; line_count: number; matched_count: number }

const DAGAR = ["", "Mánudagur", "Þriðjudagur", "Miðvikudagur", "Fimmtudagur", "Föstudagur", "Laugardagur", "Sunnudagur"];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export default function Heartbeat({ schedule, templates, todayWeekday }: {
  schedule: ScheduleEntry[]; templates: TemplateRow[]; todayWeekday: number;
}) {
  const router = useRouter();
  const [showWeek, setShowWeek] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const today = schedule.filter((s) => s.weekday === todayWeekday);
  const tomorrow = schedule.filter((s) => s.weekday === (todayWeekday % 7) + 1);

  async function makePo(t: TemplateRow) {
    setBusy(t.id); setMsg(null);
    try {
      const r = await fetch(`/api/innkaup/template/${t.id}/po`, { method: "POST" });
      const j = await r.json();
      if (j.ok) { setMsg(`✓ Pöntun ${j.po.po_number} búin til úr sniðmáti ${t.supplier_name}.`); router.refresh(); }
      else setMsg(j.message || "Mistókst.");
    } catch { setMsg("Villa."); }
    finally { setBusy(null); }
  }

  if (!schedule.length && !templates.length) return null;

  return (
    <div className="mb-6 space-y-4">
      {/* Í dag pantast */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-sm">🫀 Í dag pantast — {DAGAR[todayWeekday]}</p>
          <button onClick={() => setShowWeek((v) => !v)} className="text-xs text-red-700 hover:underline">
            {showWeek ? "Fela vikuna" : "Sjá alla vikuna"}
          </button>
        </div>
        {today.length === 0 ? (
          <p className="text-sm text-gray-400">Engar fastar pantanir skráðar á {DAGAR[todayWeekday].toLowerCase()}.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {today.map((s) => (
              <li key={s.id} className="px-3 py-1.5 rounded-lg bg-red-50 text-sm" title={s.note ?? undefined}>
                <span className="font-semibold text-red-900">{s.supplier_name}</span>
                {hhmm(s.deadline) && <span className="ml-1.5 text-red-700 text-xs font-semibold">fyrir kl. {hhmm(s.deadline)}</span>}
                {s.note && <span className="ml-1.5 text-gray-500 text-xs">· {s.note}</span>}
              </li>
            ))}
          </ul>
        )}
        {tomorrow.length > 0 && !showWeek && (
          <p className="mt-3 text-xs text-gray-400">
            Á morgun: {tomorrow.map((s) => s.supplier_name).join(", ")}
          </p>
        )}
        {showWeek && (
          <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const items = schedule.filter((s) => s.weekday === d);
              if (!items.length) return null;
              return (
                <div key={d} className={`rounded-lg border p-3 ${d === todayWeekday ? "border-red-200 bg-red-50/40" : "border-gray-100"}`}>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">{DAGAR[d]}</p>
                  <ul className="space-y-1">
                    {items.map((s) => (
                      <li key={s.id} className="text-sm" title={s.note ?? undefined}>
                        {s.supplier_name}
                        {hhmm(s.deadline) && <span className="ml-1 text-xs text-red-700">kl. {hhmm(s.deadline)}</span>}
                        {s.note && <span className="block text-[11px] text-gray-400">{s.note}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pöntunarsniðmát */}
      {templates.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-sm">📋 Pöntunarsniðmát ({templates.length})</p>
            <button onClick={() => setShowTemplates((v) => !v)} className="text-xs text-red-700 hover:underline">
              {showTemplates ? "Fela" : "Sýna"}
            </button>
          </div>
          {msg && <p className="mb-2 text-xs text-gray-600">{msg}</p>}
          {showTemplates && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{t.supplier_name}</p>
                    <p className="text-[11px] text-gray-400">{t.name} · {t.line_count} línur{t.matched_count < t.line_count ? ` (${t.matched_count} paraðar)` : ""}</p>
                  </div>
                  <button onClick={() => makePo(t)} disabled={busy !== null}
                    className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                    {busy === t.id ? "Bý til…" : "Búa til pöntun"}
                  </button>
                </div>
              ))}
            </div>
          )}
          {!showTemplates && (
            <p className="text-xs text-gray-400">Pöntunarlistar gömlu búðarinnar — smelltu á „Sýna“ og búðu til pöntun með einum smelli.</p>
          )}
        </div>
      )}
    </div>
  );
}
