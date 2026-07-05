"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PayrollRunRow, PayrollLineRow } from "@/lib/accounting-queries";
import { dags, kr } from "@/lib/format";

const MONTHS = ["", "janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];

// Ad-hoc components live in the line's breakdown by code, so an edit can pre-fill + preserve them.
type BD = { earnings?: { code: string; amount: number }[]; deductions?: { code: string; amount: number }[] };
const earn = (l: PayrollLineRow, code: string) => (l.breakdown as BD | null)?.earnings?.find((e) => e.code === code)?.amount ?? 0;
const deduct = (l: PayrollLineRow, code: string) => (l.breakdown as BD | null)?.deductions?.find((e) => e.code === code)?.amount ?? 0;
const str = (n: number) => (n ? String(Math.round(n)) : "");

interface EditRow { hours: string; yfirvinna: string; bonus: string; fradrattur: string }

export default function RunView({ run, lines }: { run: PayrollRunRow; lines: PayrollLineRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const posted = run.status === "posted";

  const [editing, setEditing] = useState(false);
  const [payDate, setPayDate] = useState(run.pay_date);
  const [edit, setEdit] = useState<Record<string, EditRow>>({});
  const inp = "border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-red-400";

  const sum = (f: (l: PayrollLineRow) => string) => lines.reduce((a, l) => a + Number(f(l)), 0);
  const gross = sum((l) => l.gross), tax = sum((l) => l.income_tax), tg = sum((l) => l.tryggingagjald);
  const pension = sum((l) => l.pension_employee) + sum((l) => l.pension_employer);
  const net = sum((l) => l.net_pay);

  function startEdit() {
    const init: Record<string, EditRow> = {};
    for (const l of lines) if (l.employee_id) init[l.employee_id] = {
      hours: l.hours ?? "", yfirvinna: str(earn(l, "110")), bonus: str(earn(l, "240")), fradrattur: str(deduct(l, "740")),
    };
    setEdit(init); setPayDate(run.pay_date); setErr(""); setEditing(true);
  }
  const setField = (id: string, k: keyof EditRow, v: string) =>
    setEdit((s) => ({ ...s, [id]: { ...s[id], [k]: v.replace(/[^\d.]/g, "") } }));

  async function save() {
    setBusy(true); setErr("");
    const entries = lines.filter((l) => l.employee_id).map((l) => {
      const e = edit[l.employee_id!] || { hours: "", yfirvinna: "", bonus: "", fradrattur: "" };
      const components: { kind: string; amount: number }[] = [];
      if (Number(e.yfirvinna)) components.push({ kind: "yfirvinna", amount: Number(e.yfirvinna) });
      if (Number(e.bonus)) components.push({ kind: "bonus", amount: Number(e.bonus) });
      if (Number(e.fradrattur)) components.push({ kind: "fradrattur", amount: Number(e.fradrattur) });
      const alag = earn(l, "241"); if (alag) components.push({ kind: "alag", amount: alag }); // preserve, not user-edited here
      return {
        employee_id: l.employee_id,
        hours: l.hours != null ? Number(e.hours || 0) : undefined,
        components: components.length ? components : undefined,
      };
    });
    try {
      const r = await fetch(`/api/laun/run/${run.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ pay_date: payDate, entries }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Villa"); return; }
      setEditing(false); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  async function post() {
    if (!confirm("Bóka launakeyrsluna í höfuðbók? Þetta er endanlegt (leiðrétt með bakfærslu).")) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/laun/run/${run.id}/post`, { method: "POST" });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Villa"); return; }
    router.refresh();
  }

  const Card = ({ label, value }: { label: string; value: number }) => (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold">{kr(value)}</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Launakeyrsla — {MONTHS[run.month]} {run.year}</h1>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${posted ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{posted ? "Bókað" : "Drög"}</span>
      </div>
      <p className="text-sm text-gray-500 mb-5">Útborgunardagur {dags(run.pay_date)} · {lines.length} launþegar
        {posted && run.voucher_id && <> · <Link href={`/bokhald/fylgiskjol/${run.voucher_id}`} className="text-red-600 hover:underline">Skoða fylgiskjal</Link></>}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card label="Brúttólaun" value={gross} />
        <Card label="Staðgreiðsla" value={tax} />
        <Card label="Lífeyrir (alls)" value={pension} />
        <Card label="Tryggingagjald" value={tg} />
        <Card label="Útborgað (nettó)" value={net} />
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Útborgunardagur</label>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inp} /></div>
            <p className="text-xs text-gray-400 pb-1">Breyttu tímum/liðum og reiknaðu drögin upp á nýtt.</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr><th className="px-3 py-2 font-semibold">Launþegi</th><th className="px-3 py-2 font-semibold w-24">Tímar</th><th className="px-3 py-2 font-semibold w-28">Yfirvinna kr</th><th className="px-3 py-2 font-semibold w-24">Bónus kr</th><th className="px-3 py-2 font-semibold w-28">Frádr. kr</th></tr>
              </thead>
              <tbody>
                {lines.filter((l) => l.employee_id).map((l) => {
                  const e = edit[l.employee_id!] || { hours: "", yfirvinna: "", bonus: "", fradrattur: "" };
                  const hourly = l.hours != null;
                  return (
                    <tr key={l.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium">{l.employee_name}</td>
                      <td className="px-3 py-2">{hourly ? <input value={e.hours} onChange={(ev) => setField(l.employee_id!, "hours", ev.target.value)} placeholder="0" className={`${inp} w-20 text-right`} /> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2"><input value={e.yfirvinna} onChange={(ev) => setField(l.employee_id!, "yfirvinna", ev.target.value)} placeholder="0" className={`${inp} w-24 text-right`} /></td>
                      <td className="px-3 py-2"><input value={e.bonus} onChange={(ev) => setField(l.employee_id!, "bonus", ev.target.value)} placeholder="0" className={`${inp} w-20 text-right`} /></td>
                      <td className="px-3 py-2"><input value={e.fradrattur} onChange={(ev) => setField(l.employee_id!, "fradrattur", ev.target.value)} placeholder="0" className={`${inp} w-24 text-right`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={busy} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">{busy ? "Reikna…" : "Vista drög (reikna upp á nýtt)"}</button>
            <button onClick={() => setEditing(false)} className="text-sm text-gray-500 hover:text-gray-800">Hætta við</button>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold">Launþegi</th>
                  <th className="px-3 py-2 font-semibold text-right">Tímar</th>
                  <th className="px-3 py-2 font-semibold text-right">Brúttó</th>
                  <th className="px-3 py-2 font-semibold text-right">Lífeyrir</th>
                  <th className="px-3 py-2 font-semibold text-right">Staðgreiðsla</th>
                  <th className="px-3 py-2 font-semibold text-right">Félagsgj.</th>
                  <th className="px-3 py-2 font-semibold text-right">Nettó</th>
                  <th className="px-3 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{l.employee_name}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{l.hours ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{kr(l.gross)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{kr(l.pension_employee)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{kr(l.income_tax)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{kr(l.union_dues)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{kr(l.net_pay)}</td>
                    <td className="px-3 py-2 text-right">
                      {l.employee_id && <a href={`/api/laun/${run.id}/launasedill/${l.employee_id}/pdf`} target="_blank" rel="noopener" className="text-red-600 hover:text-red-700 text-xs">Launaseðill PDF</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {err && <p className="text-sm text-red-600 mt-4">{err}</p>}
          <div className="mt-5 flex items-center gap-4">
            {!posted && <button onClick={post} disabled={busy} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">{busy ? "Bóka…" : "Bóka launakeyrslu"}</button>}
            {!posted && <button onClick={startEdit} disabled={busy} className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Breyta drögum</button>}
            <Link href="/bokhald/laun" className="text-sm text-gray-500 hover:text-gray-800">← Til baka</Link>
          </div>
        </>
      )}
    </div>
  );
}
