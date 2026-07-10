"use client";
import { useState } from "react";

// Verðbreytingatillögur: móttaka fann breytt innkaupsverð → kerfið leggur til nýtt útsöluverð
// (sama álagning eða álagningarregla gömlu búðarinnar). Mannfólkið samþykkir eða hafnar.
interface Suggestion {
  id: string; product_number: string; product_name: string; supplier_name: string | null;
  old_cost: string | null; new_cost: string; current_price: number; suggested_price: number;
  method: string; created_at: string;
}

const kr = (n: number) => Math.round(n).toLocaleString("is-IS");

export default function PriceSuggestions({ suggestions: initial }: { suggestions: Suggestion[] }) {
  const [rows, setRows] = useState<Suggestion[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!rows.length) return null;

  async function act(s: Suggestion, action: "apply" | "dismiss") {
    setBusy(s.id); setMsg(null);
    try {
      const r = await fetch("/api/products/price-suggestions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id, action }),
      });
      const j = await r.json();
      if (j.ok) {
        setRows((p) => p.filter((x) => x.id !== s.id));
        setMsg(action === "apply" ? `✓ ${s.product_name}: verð uppfært í ${kr(s.suggested_price)} kr.` : `Tillögu hafnað.`);
      } else setMsg(j.message || "Mistókst.");
    } catch { setMsg("Villa."); }
    finally { setBusy(null); }
  }

  return (
    <div className="mb-6 bg-white border border-amber-200 rounded-xl p-5">
      <p className="font-semibold text-sm mb-1">💰 Verðbreytingatillögur ({rows.length})</p>
      <p className="text-xs text-gray-500 mb-3">
        Innkaupsverð breyttist við móttöku — kerfið leggur til nýtt útsöluverð. Ekkert breytist nema þú samþykkir.
      </p>
      {msg && <p className="mb-2 text-xs text-gray-600">{msg}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-400 text-left">
            <tr>
              <th className="py-1.5 font-medium">Vara</th>
              <th className="py-1.5 font-medium">Birgir</th>
              <th className="py-1.5 font-medium text-right">Kostn.verð</th>
              <th className="py-1.5 font-medium text-right">Núv. verð</th>
              <th className="py-1.5 font-medium text-right">Tillaga</th>
              <th className="py-1.5 font-medium">Aðferð</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const up = s.suggested_price > s.current_price;
              const pct = s.current_price > 0 ? Math.round((s.suggested_price - s.current_price) / s.current_price * 100) : null;
              return (
                <tr key={s.id} className="border-t border-gray-50">
                  <td className="py-2 pr-2">{s.product_name}<span className="ml-1.5 text-[10px] text-gray-300">{s.product_number}</span></td>
                  <td className="py-2 text-gray-500 text-xs">{s.supplier_name || "—"}</td>
                  <td className="py-2 text-right tabular-nums text-xs text-gray-500">
                    {s.old_cost ? `${kr(Number(s.old_cost))} → ` : ""}<b>{kr(Number(s.new_cost))}</b>
                  </td>
                  <td className="py-2 text-right tabular-nums">{kr(s.current_price)} kr.</td>
                  <td className={`py-2 text-right tabular-nums font-bold ${up ? "text-red-700" : "text-green-700"}`}>
                    {kr(s.suggested_price)} kr.
                    {pct != null && <span className="ml-1 text-[10px] font-semibold">({pct > 0 ? "+" : ""}{pct}%)</span>}
                  </td>
                  <td className="py-2 text-[11px] text-gray-400">{s.method}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button onClick={() => act(s, "apply")} disabled={busy !== null}
                      className="px-2.5 py-1 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 disabled:opacity-40">
                      {busy === s.id ? "…" : "Samþykkja"}
                    </button>
                    <button onClick={() => act(s, "dismiss")} disabled={busy !== null}
                      className="ml-1.5 px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40">
                      Hafna
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
