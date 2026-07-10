"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// Yfirlit-áminningar: „Ekki gleyma" — óbókuð fylgiskjöl, skiladagar skatta, gjaldfallnir
// reikningar, kælaaflestur, pantanir/ritúöl. Áríðandi efst; hægt að merkja búið.
interface Item {
  key: string; title: string; detail?: string; category: string; dueDate: string | null;
  daysUntil: number | null; severity: "overdue" | "today" | "soon" | "upcoming";
  href?: string; source: "live" | "scheduled"; canDone: boolean; emailEscalate: boolean;
}

const ICON: Record<string, string> = {
  fylgiskjal: "📄", skattur: "🏛️", reikningur: "💸", krafa: "📨", haccp: "🌡️", ritúal: "🔁", pöntun: "📦", annað: "📌",
};
const whenLabel = (r: Item) => {
  if (r.daysUntil == null) return "";
  if (r.daysUntil < 0) return `${-r.daysUntil} d. yfir`;
  if (r.daysUntil === 0) return "Í DAG";
  if (r.daysUntil === 1) return "á morgun";
  return `eftir ${r.daysUntil} d.`;
};

export default function ReminderWidget({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [showUpcoming, setShowUpcoming] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/reminders");
    const j = await r.json();
    if (j.ok) setItems(j.items);
  }, []);
  useEffect(() => { const t = setInterval(load, 120000); return () => clearInterval(t); }, [load]);

  async function done(it: Item) {
    setBusy(it.key);
    try {
      await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "done", key: it.key }) });
      setItems((p) => p.filter((x) => x.key !== it.key));
    } finally { setBusy(null); }
  }

  const overdue = items.filter((i) => i.severity === "overdue");
  const today = items.filter((i) => i.severity === "today");
  const soon = items.filter((i) => i.severity === "soon");
  const upcoming = items.filter((i) => i.severity === "upcoming");
  const active = [...overdue, ...today, ...soon];

  function Row({ it }: { it: Item }) {
    const tone = it.severity === "overdue" ? "border-red-200 bg-red-50"
      : it.severity === "today" ? "border-amber-200 bg-amber-50"
      : "border-gray-100 bg-white";
    const badge = it.severity === "overdue" ? "bg-red-600 text-white"
      : it.severity === "today" ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-500";
    return (
      <div className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 ${tone}`}>
        <span className="text-lg leading-none mt-0.5">{ICON[it.category] || "📌"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{it.title}</span>
            {it.dueDate && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge}`}>{whenLabel(it)}</span>}
            {it.emailEscalate && it.severity !== "upcoming" && <span className="text-[10px] text-red-500" title="Sendur áminningarpóstur ef ógert">✉︎</span>}
          </div>
          {it.detail && <p className={`text-xs mt-0.5 ${it.detail.includes("EKKI GLEYMA") || it.detail.includes("LIÐINN") || it.detail.includes("VANSKIL") ? "text-red-700 font-semibold" : "text-gray-500"}`}>{it.detail}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {it.href && <Link href={it.href} className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-white">Opna →</Link>}
          {it.canDone && (
            <button onClick={() => done(it)} disabled={busy === it.key}
              className="px-2.5 py-1 rounded-lg bg-gray-800 text-white text-xs font-semibold hover:bg-gray-900 disabled:opacity-40">
              {busy === it.key ? "…" : "✓ Búið"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-5 mb-6 ${overdue.length ? "border-red-200 bg-red-50/30" : today.length ? "border-amber-200 bg-amber-50/30" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{overdue.length ? "⚠️" : "🔔"}</span>
          <h2 className="font-bold">
            {overdue.length ? "Ekki gleyma!" : "Muna"}
            {active.length > 0 && <span className="ml-2 text-sm font-normal text-gray-500">{active.length} verkefni</span>}
          </h2>
        </div>
        <Link href="/bokhald/dagatal" className="text-xs text-red-700 hover:underline">Dagatal →</Link>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-green-700">✓ Ekkert áríðandi ógert. Vel gert!</p>
      ) : (
        <div className="space-y-2">
          {active.map((it) => <Row key={it.key} it={it} />)}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowUpcoming((v) => !v)} className="text-xs text-gray-500 hover:text-red-700 hover:underline">
            {showUpcoming ? "Fela væntanlegt" : `Væntanlegt (${upcoming.length}) →`}
          </button>
          {showUpcoming && (
            <div className="mt-2 space-y-2 opacity-80">
              {upcoming.map((it) => <Row key={it.key} it={it} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
