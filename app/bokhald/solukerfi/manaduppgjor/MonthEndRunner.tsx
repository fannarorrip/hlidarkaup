"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

interface PreviewCustomer { customerId: string; name: string; kennitala: string | null; rafraen: boolean; hasEmail: boolean; tripCount: number; total: number }
interface Preview { from: string; to: string; customers: PreviewCustomer[] }

export default function MonthEndRunner({ defaultPeriod }: { defaultPeriod: string }) {
  const router = useRouter();
  const [period, setPeriod] = useState(defaultPeriod);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  async function doPreview() {
    setBusy("Skoða…"); setErr(""); setMsg(""); setPreview(null);
    try {
      const r = await fetch(`/api/manaduppgjor?period=${period}`);
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Villa"); return; }
      setPreview(d);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); } finally { setBusy(""); }
  }

  async function doRun() {
    if (!preview || preview.customers.length === 0) return;
    const n = preview.customers.length;
    if (!confirm(`Keyra mánaðaruppgjör fyrir ${period}? Það stofnar ${n} samansafnaða reikninga (+ kröfur) og merkir söluna sem reikningsfærða.`)) return;
    setBusy("Keyri uppgjör…"); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/manaduppgjor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ period }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Villa"); return; }
      setMsg(`Uppgjör búið: ${d.invoiceCount} reikningar, samtals ${kr(d.total)}.`);
      setPreview(null);
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); } finally { setBusy(""); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap bg-white border border-gray-200 rounded-xl px-5 py-4">
        <label className="text-sm text-gray-600">Tímabil
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="ml-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-red-400" />
        </label>
        <button onClick={doPreview} disabled={!!busy} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">{busy === "Skoða…" ? "Skoða…" : "Skoða óreikningsfærða sölu"}</button>
        {preview && preview.customers.length > 0 && (
          <button onClick={doRun} disabled={!!busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">{busy === "Keyri uppgjör…" ? "Keyri…" : `Keyra uppgjör (${preview.customers.length})`}</button>
        )}
        {err && <span className="text-sm text-red-600">{err}</span>}
        {msg && <span className="text-sm text-green-700">{msg}</span>}
      </div>

      {preview && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-2 text-xs text-gray-500 bg-gray-50">Óreikningsfærð reikningssala {preview.from} – {preview.to} ({preview.customers.length} viðskiptamenn)</div>
          {preview.customers.length === 0 ? (
            <p className="px-5 py-6 text-center text-gray-400 text-sm">Engin óreikningsfærð reikningssala á tímabilinu.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr><th className="px-4 py-2 font-medium">Viðskiptamaður</th><th className="px-4 py-2 font-medium">Kennitala</th><th className="px-4 py-2 font-medium text-center">Úttektir</th><th className="px-4 py-2 font-medium">Afhending</th><th className="px-4 py-2 font-medium text-right">Upphæð</th></tr>
              </thead>
              <tbody>
                {preview.customers.map((c) => (
                  <tr key={c.customerId} className="border-t border-gray-100">
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2 font-mono text-gray-600">{c.kennitala ?? "—"}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{c.tripCount}</td>
                    <td className="px-4 py-2 text-gray-500">{c.rafraen ? "Rafrænt (inExchange)" : c.hasEmail ? "PDF í tölvupósti" : "⚠ engin afhending"}</td>
                    <td className="px-4 py-2 text-right font-medium">{kr(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
