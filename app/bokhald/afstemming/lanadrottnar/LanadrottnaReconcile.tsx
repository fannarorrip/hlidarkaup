"use client";
import { useRef, useState } from "react";
import { dags, kr } from "@/lib/format";

interface ReconLine { invoiceNumber: string; date: string | null; statementAmount: number | null; ourAmount: number | null; status: string; voucherId: string | null }
interface Res {
  supplierName: string; statementDate: string; closingBalance: number;
  result: { matched: number; amountDiff: number; missingHere: number; extraHere: number; statementTotal: number; ourTotal: number; lines: ReconLine[] };
}

const STATUS: Record<string, { label: string; cls: string }> = {
  matched: { label: "Stemmir", cls: "bg-green-50 text-green-700" },
  "amount-diff": { label: "Upphæðamunur", cls: "bg-amber-50 text-amber-700" },
  "missing-here": { label: "Vantar hjá okkur", cls: "bg-red-50 text-red-700" },
  "extra-here": { label: "Ekki á yfirliti", cls: "bg-blue-50 text-blue-700" },
};

export default function LanadrottnaReconcile() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Res | null>(null);

  const toB64 = (f: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(f); });

  async function onFile(f: File) {
    setBusy("Les yfirlit…"); setErr(""); setRes(null);
    try {
      const data = await toB64(f);
      const r = await fetch("/api/afstemming/lanadrottnar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: [{ name: f.name, mime: f.type, data }] }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Villa"); return; }
      if (d.needSupplier) { setErr(`Lánadrottinn fannst ekki (${d.extracted.supplier || "óþekktur"}${d.extracted.supplierKennitala ? `, kt ${d.extracted.supplierKennitala}` : ""}). Stofnaðu hann fyrst undir Lánadrottnum.`); return; }
      setRes(d);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); } finally { setBusy(""); }
  }

  const diff = res ? res.result.ourTotal - res.closingBalance : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <input ref={fileRef} type="file" accept=".pdf,application/pdf,.xlsx,.xls,.csv,image/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={!!busy}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
          {busy || "+ Hlaða inn afstemmingalista (PDF/Excel)"}
        </button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>

      {res && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 text-sm flex flex-wrap gap-x-8 gap-y-1">
            <span className="text-gray-600">Lánadrottinn: <b className="text-gray-900">{res.supplierName}</b></span>
            {res.statementDate && <span className="text-gray-600">Dagsetning yfirlits: <b className="text-gray-900">{dags(res.statementDate)}</b></span>}
          </div>

          <div className="grid sm:grid-cols-4 gap-3">
            <Card label="Stemmir" n={res.result.matched} cls="text-green-700" />
            <Card label="Upphæðamunur" n={res.result.amountDiff} cls="text-amber-700" />
            <Card label="Vantar hjá okkur" n={res.result.missingHere} cls="text-red-700" />
            <Card label="Ekki á yfirliti" n={res.result.extraHere} cls="text-blue-700" />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 grid sm:grid-cols-3 gap-4 text-sm">
            <div><p className="text-gray-500">Staða skv. yfirliti birgis</p><p className="text-lg font-bold">{kr(res.closingBalance)}</p></div>
            <div><p className="text-gray-500">Staða í okkar bókhaldi</p><p className="text-lg font-bold">{kr(res.result.ourTotal)}</p></div>
            <div><p className="text-gray-500">Mismunur</p><p className={`text-lg font-bold ${Math.abs(diff) < 1 ? "text-green-700" : "text-red-700"}`}>{kr(diff)}</p></div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Reikningur</th>
                  <th className="px-4 py-2 font-medium">Dags.</th>
                  <th className="px-4 py-2 font-medium text-right">Skv. yfirliti</th>
                  <th className="px-4 py-2 font-medium text-right">Okkar bókun</th>
                  <th className="px-4 py-2 font-medium">Staða</th>
                </tr>
              </thead>
              <tbody>
                {res.result.lines.map((l, i) => {
                  const st = STATUS[l.status] ?? { label: l.status, cls: "bg-gray-100 text-gray-600" };
                  return (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-mono text-gray-700">
                        {l.voucherId ? <a href={`/bokhald/fylgiskjol/${l.voucherId}`} className="text-red-700 hover:underline">{l.invoiceNumber || "—"}</a> : (l.invoiceNumber || "—")}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{dags(l.date)}</td>
                      <td className="px-4 py-2 text-right">{l.statementAmount != null ? kr(l.statementAmount) : "—"}</td>
                      <td className="px-4 py-2 text-right">{l.ourAmount != null ? kr(l.ourAmount) : "—"}</td>
                      <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, n, cls }: { label: string; n: number; cls: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${cls}`}>{n}</p>
    </div>
  );
}
