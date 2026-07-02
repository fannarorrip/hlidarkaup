"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

interface Emp { id: string; name: string; employment_type: "salary" | "hourly"; monthly_salary: string; hourly_rate: string }

export default function NyKeyrsla({ employees }: { employees: Emp[] }) {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [payDate, setPayDate] = useState(now.toISOString().slice(0, 10));
  const [hours, setHours] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<Record<string, { yfirvinna: string; bonus: string; fradrattur: string }>>({});
  const exDefault = { yfirvinna: "", bonus: "", fradrattur: "" };
  const setEx = (id: string, k: "yfirvinna" | "bonus" | "fradrattur", v: string) =>
    setExtra((s) => ({ ...s, [id]: { ...exDefault, ...(s[id] || {}), [k]: v.replace(/[^\d]/g, "") } }));
  const [included, setIncluded] = useState<Record<string, boolean>>(Object.fromEntries(employees.map((e) => [e.id, true])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const inp = "border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-red-400";

  async function create() {
    setBusy(true); setErr("");
    const entries = employees.filter((e) => included[e.id]).map((e) => {
      const x = extra[e.id] || {};
      const components: { kind: string; label?: string; amount: number }[] = [];
      if (Number(x.yfirvinna)) components.push({ kind: "yfirvinna", label: "Yfirvinna", amount: Number(x.yfirvinna) });
      if (Number(x.bonus)) components.push({ kind: "bonus", amount: Number(x.bonus) });
      if (Number(x.fradrattur)) components.push({ kind: "fradrattur", label: "Frádráttur", amount: Number(x.fradrattur) });
      return {
        employee_id: e.id,
        hours: e.employment_type === "hourly" ? Number(hours[e.id] || 0) : undefined,
        components: components.length ? components : undefined,
      };
    });
    if (!entries.length) { setErr("Veldu a.m.k. einn launþega"); setBusy(false); return; }
    const r = await fetch("/api/laun/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ year, month, pay_date: payDate, entries }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Villa"); return; }
    router.push(`/bokhald/laun/keyrsla/${j.runId}`);
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-wrap gap-4 items-end">
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Ár</label><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${inp} w-24`} /></div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Mánuður</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inp}>
            {["jan","feb","mar","apr","maí","jún","júl","ágú","sep","okt","nóv","des"].map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Útborgunardagur</label><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inp} /></div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-4 py-2 w-8"></th><th className="px-4 py-2 font-semibold">Launþegi</th><th className="px-4 py-2 font-semibold">Tegund</th><th className="px-4 py-2 font-semibold text-right">Laun/taxti</th><th className="px-3 py-2 font-semibold w-24">Tímar</th><th className="px-3 py-2 font-semibold w-28">Yfirvinna kr</th><th className="px-3 py-2 font-semibold w-24">Bónus kr</th><th className="px-3 py-2 font-semibold w-28">Frádr. kr</th></tr>
          </thead>
          <tbody>
            {employees.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Engir virkir launþegar. Skráðu launþega fyrst.</td></tr>}
            {employees.map((e) => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="px-4 py-2"><input type="checkbox" checked={!!included[e.id]} onChange={(ev) => setIncluded((s) => ({ ...s, [e.id]: ev.target.checked }))} /></td>
                <td className="px-4 py-2 font-medium">{e.name}</td>
                <td className="px-4 py-2 text-gray-500">{e.employment_type === "hourly" ? "Tímakaup" : "Föst laun"}</td>
                <td className="px-4 py-2 text-right">{e.employment_type === "hourly" ? `${kr(e.hourly_rate)}/klst` : kr(e.monthly_salary)}</td>
                <td className="px-3 py-2">
                  {e.employment_type === "hourly"
                    ? <input value={hours[e.id] ?? ""} onChange={(ev) => setHours((s) => ({ ...s, [e.id]: ev.target.value.replace(/[^\d.]/g, "") }))} placeholder="0" className={`${inp} w-20 text-right`} />
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2"><input value={extra[e.id]?.yfirvinna ?? ""} onChange={(ev) => setEx(e.id, "yfirvinna", ev.target.value)} placeholder="0" className={`${inp} w-24 text-right`} /></td>
                <td className="px-3 py-2"><input value={extra[e.id]?.bonus ?? ""} onChange={(ev) => setEx(e.id, "bonus", ev.target.value)} placeholder="0" className={`${inp} w-20 text-right`} /></td>
                <td className="px-3 py-2"><input value={extra[e.id]?.fradrattur ?? ""} onChange={(ev) => setEx(e.id, "fradrattur", ev.target.value)} placeholder="0" className={`${inp} w-24 text-right`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button onClick={create} disabled={busy || !employees.length} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">{busy ? "Reikna…" : "Reikna laun (búa til drög)"}</button>
    </div>
  );
}
