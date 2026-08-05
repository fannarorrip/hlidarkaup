"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

interface Emp { id: string; name: string; employment_type: "salary" | "hourly"; monthly_salary: string; hourly_rate: string; wage_category?: string | null }
// Leystur kjarasamningstaxti (frá /api/laun/taxtar) — þrep + taxtar tímabilsins.
interface Rate { employee_id: string; stepLabel: string; monthly: number; dagvinna: number; eftirvinna: number | null; naeturvinna: number | null; yfirvinna: number; storhatid: number; age: number | null }

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
  // Klst á kjarasamningstöxtum (aðeins fólk með wage_category): eftirvinna/næturvinna/yfirvinna/stórhátíð.
  const [alag, setAlag] = useState<Record<string, { ev: string; nv: string; yv: string; sh: string }>>({});
  const alDefault = { ev: "", nv: "", yv: "", sh: "" };
  const setAl = (id: string, k: "ev" | "nv" | "yv" | "sh", v: string) =>
    setAlag((s) => ({ ...s, [id]: { ...alDefault, ...(s[id] || {}), [k]: v.replace(/[^\d.,]/g, "") } }));
  const [rates, setRates] = useState<Record<string, Rate>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>(Object.fromEntries(employees.map((e) => [e.id, true])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [timaMsg, setTimaMsg] = useState("");
  const [timaInfo, setTimaInfo] = useState<Record<string, string>>({}); // sundurliðun per launþega

  // Launatímabilið er 25.–24.: mánuðurinn sem valinn er greiðir tímana frá 25. fyrri mánaðar.
  const p2 = (n: number) => String(n).padStart(2, "0");
  const prev = new Date(Date.UTC(year, month - 2, 25));
  const timabil = `25.${p2(prev.getUTCMonth() + 1)}.${prev.getUTCFullYear()} – 24.${p2(month)}.${year}`;

  // Kjarasamningstaxtar tímabilsins — þrep hvers starfsmanns (aldur + starfsaldur) til sýnis;
  // útreikningurinn leysir þá sjálfstætt server-megin við keyrslu.
  const loadRates = useCallback(async () => {
    try {
      const r = await fetch(`/api/laun/taxtar?year=${year}&month=${month}`);
      const d = await r.json();
      setRates(Object.fromEntries((d.rates ?? []).map((x: Rate) => [x.employee_id, x])));
    } catch { /* taxtar birtast þá ekki — keyrslan reiknar samt rétt */ }
  }, [year, month]);
  useEffect(() => { loadRates(); }, [loadRates]);

  interface TimaRow { employee_id: string; name: string; dag: number; eftir: number; natur: number; yfir: number; storhatid: number; sick: number; vacation: number; other: number; open_entries: number; lunch_deducted: number; work: number; total: number }
  async function saekjaTima() {
    setBusy(true); setErr(""); setTimaMsg("");
    try {
      const r = await fetch(`/api/timar?laun=${year}-${p2(month)}`);
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Villa við að sækja tíma"); return; }
      const rows: TimaRow[] = d.hours ?? [];
      const byId = new Map(rows.map((h) => [h.employee_id, h]));
      let filled = 0, openTotal = 0;
      const info: Record<string, string> = {};
      const s = (n: number) => String(n).replace(".", ",");
      setHours((prevH) => {
        const nextH = { ...prevH };
        setAlag((prevA) => {
          const nextA = { ...prevA };
          for (const e of employees) {
            const h = byId.get(e.id);
            if (!h) continue;
            openTotal += h.open_entries;
            const absH = h.sick + h.vacation + h.other;
            const parts = [
              h.eftir > 0 ? `eftirv. ${s(h.eftir)}` : "", h.natur > 0 ? `næturv. ${s(h.natur)}` : "",
              h.yfir > 0 ? `YFIRV. ${s(h.yfir)}` : "", h.storhatid > 0 ? `STÓRHÁTÍÐ ${s(h.storhatid)}` : "",
              h.sick > 0 ? `veikindi ${s(h.sick)}` : "", h.vacation > 0 ? `orlof ${s(h.vacation)}` : "",
              h.other > 0 ? `önnur fjarvist ${s(h.other)}` : "",
              h.lunch_deducted > 0 ? `matur −${s(h.lunch_deducted)}` : "",
              h.open_entries > 0 ? `⚠ ${h.open_entries} OPIN stimplun ótalin` : "",
            ].filter(Boolean).join(" · ");
            info[e.id] = `${s(h.total)} klst flokkaðar sjálfkrafa${parts ? ` — ${parts}` : ""}`;
            if (e.employment_type === "hourly") {
              if (e.wage_category) {
                // Kjarasamningsfólk: hver flokkur í sinn dálk — veikindi/orlof teljast sem dagvinna.
                nextH[e.id] = String(h.dag + absH);
                nextA[e.id] = { ev: h.eftir ? String(h.eftir) : "", nv: h.natur ? String(h.natur) : "", yv: h.yfir ? String(h.yfir) : "", sh: h.storhatid ? String(h.storhatid) : "" };
              } else {
                nextH[e.id] = String(h.total); // handvirk laun: heildin í tímadálkinn eins og áður
              }
              filled++;
            }
          }
          return nextA;
        });
        return nextH;
      });
      setTimaInfo(info);
      setTimaMsg(`Tímabil ${d.from} – ${d.to}: flokkaði og fyllti hjá ${filled} tímakaupsfólki (má lagfæra handvirkt).${openTotal ? ` ⚠ ${openTotal} opnar stimplanir ótaldar — lokaðu þeim á mánaðarblaðinu og sæktu aftur.` : ""}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  const inp = "border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-red-400";

  async function create() {
    setBusy(true); setErr("");
    const n = (v?: string) => Number((v ?? "").replace(",", ".")) || 0;
    const entries = employees.filter((e) => included[e.id]).map((e) => {
      const x = extra[e.id] || {};
      const a = alag[e.id] || {};
      const components: { kind: string; label?: string; amount: number }[] = [];
      // Yfirvinnu-KR dálkurinn gildir aðeins fyrir handvirk laun — taxtafólk notar klst-dálkana.
      if (!e.wage_category && Number(x.yfirvinna)) components.push({ kind: "yfirvinna", label: "Yfirvinna", amount: Number(x.yfirvinna) });
      if (Number(x.bonus)) components.push({ kind: "bonus", amount: Number(x.bonus) });
      if (Number(x.fradrattur)) components.push({ kind: "fradrattur", label: "Frádráttur", amount: Number(x.fradrattur) });
      return {
        employee_id: e.id,
        hours: e.employment_type === "hourly" ? n(hours[e.id]) : undefined,
        components: components.length ? components : undefined,
        // Klst á töxtum — serverinn leysir taxtana sjálfur úr wage_scale:
        ...(e.wage_category ? { ev_hours: n(a.ev), nv_hours: n(a.nv), yv_hours: n(a.yv), sh_hours: n(a.sh) } : {}),
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
        <div className="pb-1">
          <span className="block text-xs font-medium text-gray-500 mb-1">Launatímabil (25.–24.)</span>
          <span className="text-sm font-semibold tabular-nums">{timabil}</span>
        </div>
        <button onClick={saekjaTima} disabled={busy}
          className="px-4 py-2 rounded-lg border-2 border-[#2C687B] text-[#2C687B] text-sm font-semibold hover:bg-[#E4F1F0] disabled:opacity-50">
          {busy ? "Sæki…" : "⏱ Sækja tíma úr stimpilklukku"}
        </button>
      </div>
      {timaMsg && <p className="text-sm text-green-700">{timaMsg}</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-4 py-2 w-8"></th><th className="px-4 py-2 font-semibold">Launþegi</th><th className="px-4 py-2 font-semibold text-right">Laun/taxti</th><th className="px-3 py-2 font-semibold w-20" title="Dagvinnutímar">Tímar</th><th className="px-3 py-2 font-semibold w-20" title="Eftirvinnutímar á taxta">Eftirv.</th><th className="px-3 py-2 font-semibold w-20" title="Næturvinnutímar á taxta">Næturv.</th><th className="px-3 py-2 font-semibold w-20" title="Yfirvinnutímar á taxta (kr hjá handvirkum)">Yfirv.</th><th className="px-3 py-2 font-semibold w-20" title="Stórhátíðartímar á taxta">Stórh.</th><th className="px-3 py-2 font-semibold w-24">Bónus kr</th><th className="px-3 py-2 font-semibold w-24">Frádr. kr</th></tr>
          </thead>
          <tbody>
            {employees.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Engir virkir launþegar. Skráðu launþega fyrst.</td></tr>}
            {employees.map((e) => {
              const w = e.wage_category ? rates[e.id] : undefined;
              const alagInp = (k: "ev" | "nv" | "yv" | "sh", enabled: boolean) => enabled
                ? <input value={alag[e.id]?.[k] ?? ""} onChange={(ev) => setAl(e.id, k, ev.target.value)} placeholder="0" className={`${inp} w-16 text-right`} />
                : <span className="text-gray-300">—</span>;
              return (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="px-4 py-2"><input type="checkbox" checked={!!included[e.id]} onChange={(ev) => setIncluded((s) => ({ ...s, [e.id]: ev.target.checked }))} /></td>
                <td className="px-4 py-2 font-medium">
                  {e.name}
                  <div className="text-[11px] text-gray-400 font-normal">{e.employment_type === "hourly" ? "Tímakaup" : "Föst laun"}{w ? ` · VR/SA: ${w.stepLabel}${w.age != null && w.age < 18 ? ` (${w.age} ára)` : ""}` : e.wage_category ? " · VR/SA taxti" : ""}</div>
                  {timaInfo[e.id] && <div className="text-[11px] text-gray-400 font-normal">{timaInfo[e.id]}</div>}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{w
                  ? (e.employment_type === "hourly" ? `${kr(w.dagvinna)}/klst` : kr(w.monthly))
                  : e.employment_type === "hourly" ? `${kr(e.hourly_rate)}/klst` : kr(e.monthly_salary)}</td>
                <td className="px-3 py-2">
                  {e.employment_type === "hourly"
                    ? <input value={hours[e.id] ?? ""} onChange={(ev) => setHours((s) => ({ ...s, [e.id]: ev.target.value.replace(/[^\d.,]/g, "") }))} placeholder="0" className={`${inp} w-16 text-right`} />
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2">{alagInp("ev", !!e.wage_category)}</td>
                <td className="px-3 py-2">{alagInp("nv", !!e.wage_category)}</td>
                <td className="px-3 py-2">
                  {e.wage_category
                    ? alagInp("yv", true)
                    : <input value={extra[e.id]?.yfirvinna ?? ""} onChange={(ev) => setEx(e.id, "yfirvinna", ev.target.value)} placeholder="kr" title="Yfirvinna í krónum (handvirk laun)" className={`${inp} w-20 text-right`} />}
                </td>
                <td className="px-3 py-2">{alagInp("sh", !!e.wage_category)}</td>
                <td className="px-3 py-2"><input value={extra[e.id]?.bonus ?? ""} onChange={(ev) => setEx(e.id, "bonus", ev.target.value)} placeholder="0" className={`${inp} w-20 text-right`} /></td>
                <td className="px-3 py-2"><input value={extra[e.id]?.fradrattur ?? ""} onChange={(ev) => setEx(e.id, "fradrattur", ev.target.value)} placeholder="0" className={`${inp} w-20 text-right`} /></td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button onClick={create} disabled={busy || !employees.length} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">{busy ? "Reikna…" : "Reikna laun (búa til drög)"}</button>
    </div>
  );
}
