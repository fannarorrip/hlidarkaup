"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeRow, UnionRow } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";

type Draft = Record<string, string | boolean>;

const NEW: Draft = {
  kennitala: "", name: "", email: "", phone: "", address: "", bank_account: "",
  employment_type: "salary", monthly_salary: "", hourly_rate: "",
  personal_credit_pct: "100", pension_fund: "", pension_employee_pct: "4", pension_employer_pct: "11.5",
  private_pension_employee_pct: "0", private_pension_employer_pct: "0",
  union_id: "", starfsheiti: "", deild: "", employment_ratio: "100", vacation_pct: "10.17",
  orlof_method: "accrue", is_active: true, start_date: "",
};

function toDraft(e: EmployeeRow): Draft {
  const d: Draft = { ...NEW };
  for (const k of Object.keys(NEW)) {
    const v = (e as unknown as Record<string, unknown>)[k];
    d[k] = typeof v === "boolean" ? v : v == null ? "" : String(v);
  }
  return d;
}

const inp = "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-red-400";
const lbl = "block text-xs font-medium text-gray-500 mb-1";

export default function LaunthegarManager({ employees, unions }: { employees: EmployeeRow[]; unions: UnionRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; d: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string, v: string | boolean) => setEditing((s) => (s ? { ...s, d: { ...s.d, [k]: v } } : s));
  const field = (k: string, label: string, type = "text") => (
    <div>
      <label className={lbl}>{label}</label>
      <input type={type} value={String(editing?.d[k] ?? "")} onChange={(e) => set(k, e.target.value)} className={inp} />
    </div>
  );
  const pctField = (k: string, label: string) => field(k, label, "text");

  async function save() {
    if (!editing) return;
    setBusy(true); setErr("");
    const url = editing.id ? `/api/laun/employees/${editing.id}` : "/api/laun/employees";
    const r = await fetch(url, { method: editing.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editing.d) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Villa"); return; }
    setEditing(null); router.refresh();
  }

  const isHourly = editing?.d.employment_type === "hourly";

  return (
    <div className="space-y-4">
      <button onClick={() => setEditing({ id: null, d: { ...NEW } })} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">+ Nýr launþegi</button>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-4 py-2 font-semibold">Nafn</th><th className="px-4 py-2 font-semibold">Kennitala</th><th className="px-4 py-2 font-semibold">Tegund</th><th className="px-4 py-2 font-semibold text-right">Laun/taxti</th><th className="px-4 py-2 font-semibold">Staða</th><th></th></tr>
          </thead>
          <tbody>
            {employees.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Engir launþegar skráðir.</td></tr>}
            {employees.map((e) => (
              <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{e.name}</td>
                <td className="px-4 py-2 text-gray-500">{e.kennitala}</td>
                <td className="px-4 py-2">{e.employment_type === "hourly" ? "Tímakaup" : "Föst laun"}</td>
                <td className="px-4 py-2 text-right">{e.employment_type === "hourly" ? `${kr(e.hourly_rate)}/klst` : kr(e.monthly_salary)}</td>
                <td className="px-4 py-2">{e.is_active ? <span className="text-green-700 text-xs">virkur</span> : <span className="text-gray-400 text-xs">óvirkur</span>}</td>
                <td className="px-4 py-2 text-right"><button onClick={() => setEditing({ id: e.id, d: toDraft(e) })} className="text-red-600 hover:text-red-700 text-sm">Breyta</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editing.id ? "Breyta launþega" : "Nýr launþegi"}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {field("name", "Nafn")}
              {field("kennitala", "Kennitala")}
              {field("bank_account", "Bankareikningur")}
              {field("email", "Netfang")}
              {field("phone", "Sími")}
              {field("address", "Heimilisfang")}
              <div>
                <label className={lbl}>Tegund</label>
                <select value={String(editing.d.employment_type)} onChange={(e) => set("employment_type", e.target.value)} className={inp}>
                  <option value="salary">Föst mánaðarlaun</option>
                  <option value="hourly">Tímakaup</option>
                </select>
              </div>
              {isHourly ? pctField("hourly_rate", "Tímataxti (kr)") : pctField("monthly_salary", "Mánaðarlaun (kr)")}
              {pctField("personal_credit_pct", "Persónuafsláttur %")}
              {field("pension_fund", "Lífeyrissjóður")}
              {pctField("pension_employee_pct", "Lífeyrir launþegi %")}
              {pctField("pension_employer_pct", "Lífeyrir launagr. %")}
              {pctField("private_pension_employee_pct", "Séreign launþegi %")}
              {pctField("private_pension_employer_pct", "Séreign launagr. %")}
              <div>
                <label className={lbl}>Stéttarfélag</label>
                <select value={String(editing.d.union_id ?? "")} onChange={(e) => set("union_id", e.target.value)} className={inp}>
                  <option value="">— ekkert —</option>
                  {unions.map((u) => <option key={u.id} value={u.id}>{u.code ? `${u.code} · ` : ""}{u.name}</option>)}
                </select>
              </div>
              {field("starfsheiti", "Starfsheiti")}
              {field("deild", "Deild")}
              {pctField("employment_ratio", "Ráðningarhlutfall %")}
              {pctField("vacation_pct", "Orlof %")}
              <div>
                <label className={lbl}>Orlof</label>
                <select value={String(editing.d.orlof_method)} onChange={(e) => set("orlof_method", e.target.value)} className={inp}>
                  <option value="accrue">Safnað (áfallið orlof)</option>
                  <option value="payout">Greitt jafnóðum</option>
                </select>
              </div>
              {field("start_date", "Upphafsdagur", "date")}
              <label className="flex items-center gap-2 text-sm mt-5"><input type="checkbox" checked={!!editing.d.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Virkur</label>
            </div>
            {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => !busy && setEditing(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Hætta við</button>
              <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">{busy ? "Vista…" : "Vista"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
