"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { kr } from "@/lib/format";

interface Entry { id: string; employee_id: string; name: string; register_id: string | null; entry_type?: string; clock_in: string; clock_out: string | null; edited_by: string | null; hours: number }
const TYPE_LABEL: Record<string, string> = { sick: "Veikindi", vacation: "Orlof", holiday: "Frídagur", absence: "Fjarvist" };
interface Total { employee_id: string; name: string; hours: number; entries: number }
interface Sales { employee_id: string; name: string; sales: number; amount: number }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmtT = (v: string | null) => v ? new Date(v).toLocaleString("is-IS", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
// datetime-local gildi úr timestamptz (staðartími vafrans)
const dtLocal = (v: string) => { const d = new Date(v); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export default function TimarView() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 13 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totals, setTotals] = useState<Total[]>([]);
  const [sales, setSales] = useState<Sales[]>([]);
  const [edit, setEdit] = useState<{ id: string; cin: string; cout: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/timar?from=${from}&to=${to}`);
    const d = await r.json();
    setEntries(d.entries ?? []); setTotals(d.totals ?? []); setSales(d.sales ?? []);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  async function saveEdit() {
    if (!edit) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/timar", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: edit.id, clock_in: edit.cin ? new Date(edit.cin).toISOString() : undefined, clock_out: edit.cout ? new Date(edit.cout).toISOString() : null }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setErr(d.error ?? "Villa"); return; }
    setEdit(null); load();
  }
  async function remove(id: string) {
    if (!confirm("Eyða þessari stimplun?")) return;
    await fetch(`/api/timar?id=${id}`, { method: "DELETE" });
    load();
  }

  const inp = "border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-red-400";
  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
        <span className="text-gray-400">–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-600">Samtals tímar á tímabili</p>
          <table className="w-full text-sm">
            <tbody>
              {totals.length === 0 ? <tr><td className="px-4 py-5 text-center text-gray-400">Engar stimplanir</td></tr>
                : totals.map((t) => (
                  <tr key={t.employee_id} className="border-t border-gray-100">
                    {/* Nafnið opnar MÁNAÐARBLAÐ starfsmannsins — allur mánuðurinn dag fyrir dag,
                       leiðréttingar, veikindi og aðrar fjarvistir skráðar þar. */}
                    <td className="px-4 py-2 font-medium"><Link href={`/bokhald/timar/${t.employee_id}`} className="text-red-700 hover:underline">{t.name}</Link></td>
                    <td className="px-4 py-2 text-right tabular-nums"><b>{t.hours.toLocaleString("is-IS")}</b> klst</td>
                    <td className="px-4 py-2 text-right text-gray-400 text-xs">{t.entries} skráningar</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-600">Afgreiðslur (sölur merktar starfsmanni)</p>
          <table className="w-full text-sm">
            <tbody>
              {sales.length === 0 ? <tr><td className="px-4 py-5 text-center text-gray-400">Engar merktar sölur — starfsmenn opna kassann með sínum PIN</td></tr>
                : sales.map((s) => (
                  <tr key={s.employee_id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums"><b>{s.sales}</b> sölur</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{kr(s.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <p className="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-600">Stimplanir</p>
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-4 py-2 font-medium">Starfsmaður</th><th className="px-4 py-2 font-medium">Kassi</th><th className="px-4 py-2 font-medium">Inn</th><th className="px-4 py-2 font-medium">Út</th><th className="px-4 py-2 font-medium text-right">Klst</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium"><Link href={`/bokhald/timar/${e.employee_id}`} className="hover:text-red-700 hover:underline">{e.name}</Link>{e.edited_by && <span className="ml-1.5 text-[10px] text-amber-600" title="Handvirkt leiðrétt">✎</span>}</td>
                <td className="px-4 py-2 text-gray-500">{e.register_id ?? "—"}</td>
                {e.entry_type && e.entry_type !== "work" ? (
                  <td className="px-4 py-2" colSpan={2}><span className="text-xs px-2 py-0.5 rounded bg-rose-50 text-rose-700">{TYPE_LABEL[e.entry_type] ?? e.entry_type}</span></td>
                ) : (
                  <>
                    <td className="px-4 py-2">{fmtT(e.clock_in)}</td>
                    <td className="px-4 py-2">{e.clock_out ? fmtT(e.clock_out) : <span className="text-green-700 font-medium">Í vinnu</span>}</td>
                  </>
                )}
                <td className="px-4 py-2 text-right tabular-nums">{e.hours.toLocaleString("is-IS")}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => setEdit({ id: e.id, cin: dtLocal(e.clock_in), cout: e.clock_out ? dtLocal(e.clock_out) : "" })} className="text-xs text-gray-500 hover:text-red-700 mr-3">Leiðrétta</button>
                  <button onClick={() => remove(e.id)} className="text-xs text-gray-300 hover:text-red-600">Eyða</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-4">Leiðrétta stimplun</h2>
            <label className="block text-sm text-gray-500 mb-1">Inn</label>
            <input type="datetime-local" value={edit.cin} onChange={(e) => setEdit((p) => p && { ...p, cin: e.target.value })} className={`${inp} w-full mb-3`} />
            <label className="block text-sm text-gray-500 mb-1">Út (tómt = enn í vinnu)</label>
            <input type="datetime-local" value={edit.cout} onChange={(e) => setEdit((p) => p && { ...p, cout: e.target.value })} className={`${inp} w-full mb-4`} />
            {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
            <div className="flex gap-3">
              <button onClick={saveEdit} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">Vista</button>
              <button onClick={() => setEdit(null)} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm">Hætta við</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
