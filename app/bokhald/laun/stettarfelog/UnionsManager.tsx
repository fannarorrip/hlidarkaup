"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UnionRow, UnionFundRow } from "@/lib/accounting-queries";

interface FundDraft { line_number: string; name: string; rate_pct: string; fixed_amount: string; payer: string; fund_type: string; pay_month: string }
const FUND_TYPES = [
  ["felagsgjald", "Félagsgjald"], ["sjukrasjodur", "Sjúkrasjóður"], ["orlofsheimila", "Orlofsheimilasjóður"],
  ["starfsmennt", "Starfsmenntasjóður"], ["desemberuppbot", "Desemberuppbót"], ["orlofsuppbot", "Orlofsuppbót"], ["other", "Annað"],
];
const inp = "w-full bg-transparent px-2 py-1 text-sm outline-none focus:bg-red-50/60";

function toDraft(f: UnionFundRow): FundDraft {
  return { line_number: f.line_number ?? "", name: f.name, rate_pct: f.rate_pct ?? "", fixed_amount: f.fixed_amount ?? "", payer: f.payer, fund_type: f.fund_type, pay_month: f.pay_month != null ? String(f.pay_month) : "" };
}
const blankFund = (): FundDraft => ({ line_number: "", name: "", rate_pct: "", fixed_amount: "", payer: "employer", fund_type: "other", pay_month: "" });

export default function UnionsManager({ unions, funds }: { unions: UnionRow[]; funds: UnionFundRow[] }) {
  const router = useRouter();
  const [selId, setSelId] = useState<string | null>(unions[0]?.id ?? null);
  const [rows, setRows] = useState<FundDraft[]>(() => funds.filter((f) => f.union_id === (unions[0]?.id ?? "")).map(toDraft));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function select(id: string) { setSelId(id); setRows(funds.filter((f) => f.union_id === id).map(toDraft)); setMsg(""); }
  const setCell = (i: number, k: keyof FundDraft, v: string) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  async function newUnion() {
    const name = prompt("Heiti stéttarfélags:"); if (!name) return;
    const code = prompt("Númer (valfrjálst):") || "";
    const r = await fetch("/api/laun/unions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, code }) });
    if (r.ok) router.refresh();
  }

  async function save() {
    if (!selId) return;
    setBusy(true); setMsg("");
    const payload = rows.filter((r) => r.name.trim()).map((r) => ({
      line_number: r.line_number || null, name: r.name, rate_pct: r.rate_pct === "" ? null : Number(r.rate_pct),
      fixed_amount: r.fixed_amount === "" ? null : Number(r.fixed_amount), payer: r.payer, fund_type: r.fund_type,
      pay_month: r.pay_month === "" ? null : Number(r.pay_month),
    }));
    const r = await fetch(`/api/laun/unions/${selId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ funds: payload }) });
    setBusy(false);
    if (r.ok) { setMsg("Vistað"); router.refresh(); } else setMsg("Villa við vistun");
  }

  const sel = unions.find((u) => u.id === selId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {unions.map((u) => (
          <button key={u.id} onClick={() => select(u.id)} className={`px-3 py-1.5 rounded-lg border text-sm ${selId === u.id ? "border-red-400 bg-red-50 text-red-700" : "border-gray-300 hover:bg-gray-50"}`}>
            {u.code ? `${u.code} · ` : ""}{u.name}
          </button>
        ))}
        <button onClick={newUnion} className="px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:bg-gray-50">+ Nýtt</button>
      </div>

      {sel && (
        <>
          {sel.orlof_period_start && <p className="text-xs text-gray-500">Orlofstímabil: {sel.orlof_period_start} – {sel.orlof_period_end}</p>}
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-2 py-2 font-semibold w-16">Nr</th>
                  <th className="px-2 py-2 font-semibold">Heiti</th>
                  <th className="px-2 py-2 font-semibold w-24">Gjald %</th>
                  <th className="px-2 py-2 font-semibold w-28">Fast kr/ár</th>
                  <th className="px-2 py-2 font-semibold w-28">Greiðandi</th>
                  <th className="px-2 py-2 font-semibold w-40">Tegund</th>
                  <th className="px-2 py-2 font-semibold w-20">Mán.</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="border-r border-gray-100"><input value={r.line_number} onChange={(e) => setCell(i, "line_number", e.target.value)} className={inp} /></td>
                    <td className="border-r border-gray-100"><input value={r.name} onChange={(e) => setCell(i, "name", e.target.value)} className={inp} /></td>
                    <td className="border-r border-gray-100"><input value={r.rate_pct} onChange={(e) => setCell(i, "rate_pct", e.target.value.replace(/[^\d.]/g, ""))} className={`${inp} text-right`} /></td>
                    <td className="border-r border-gray-100"><input value={r.fixed_amount} onChange={(e) => setCell(i, "fixed_amount", e.target.value.replace(/[^\d]/g, ""))} className={`${inp} text-right`} /></td>
                    <td className="border-r border-gray-100">
                      <select value={r.payer} onChange={(e) => setCell(i, "payer", e.target.value)} className={inp}><option value="employee">Launþegi</option><option value="employer">Launagr.</option></select>
                    </td>
                    <td className="border-r border-gray-100">
                      <select value={r.fund_type} onChange={(e) => setCell(i, "fund_type", e.target.value)} className={inp}>{FUND_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    </td>
                    <td className="border-r border-gray-100"><input value={r.pay_month} onChange={(e) => setCell(i, "pay_month", e.target.value.replace(/[^\d]/g, ""))} placeholder="–" className={`${inp} text-center`} /></td>
                    <td className="text-center"><button onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-600 px-1">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setRows((p) => [...p, blankFund()])} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">+ Lína</button>
            <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">{busy ? "Vista…" : "Vista gjaldliði"}</button>
            {msg && <span className="text-sm text-green-700">{msg}</span>}
          </div>
          <p className="text-xs text-gray-400">Uppbætur: settu „Fast kr/ár“ + tegund (Desember-/Orlofsuppbót) + mánuð (desember=12). %-sjóðir launagreiðanda fara á 3220/3225, félagsgjald dregst af launþega.</p>
        </>
      )}
    </div>
  );
}
