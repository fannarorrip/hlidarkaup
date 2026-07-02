"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { TrialBalance, TBSummary } from "@/lib/trial-balance";

const kr2 = (n: number) => Math.round(Number(n)).toLocaleString("is-IS") + " kr.";
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };
const neg = (n: number) => (n < -0.005 ? "text-red-600" : "");
const BADGE: Record<string, string> = {
  eign: "bg-blue-50 text-blue-700", skuld: "bg-red-50 text-red-700", eigid_fe: "bg-purple-50 text-purple-700",
  tekjur: "bg-green-50 text-green-700", gjold: "bg-amber-50 text-amber-700",
};

export default function TrialBalanceView({ tb, from, to }: { tb: TrialBalance; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (t: string) => setCollapsed((p) => { const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const setRange = (f: string, t: string) => router.push(`${pathname}?from=${f}&to=${t}`);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><span>🧮</span> Prófjöfnuður</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <input type="date" value={from} onChange={(e) => setRange(e.target.value, to)} className="outline-none bg-transparent" />
            <span className="text-gray-400">→</span>
            <input type="date" value={to} onChange={(e) => setRange(from, e.target.value)} className="outline-none bg-transparent" />
          </div>
          <a href={`/api/profjofnudur/pdf?from=${from}&to=${to}`} target="_blank" rel="noopener"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 flex items-center gap-1.5">📄 Sækja PDF</a>
          <a href={`/api/profjofnudur/xlsx?from=${from}&to=${to}`}
            className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 flex items-center gap-1.5">📊 Sækja Excel</a>
        </div>
      </div>

      {/* Info bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 mb-5 text-sm text-gray-600 flex flex-wrap gap-x-8">
        <span>Tímabil: <b className="text-gray-800">{fmtD(from)} – {fmtD(to)}</b></span>
        <span>Fjöldi lykla: <b className="text-gray-800">{tb.count}</b></span>
      </div>

      {/* Groups */}
      <div className="space-y-4">
        {tb.groups.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center text-gray-400">Engar hreyfingar á tímabilinu</div>
        )}
        {tb.groups.map((g) => {
          const open = !collapsed.has(g.type);
          return (
            <div key={g.type} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => toggle(g.type)} className="w-full flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-gray-50 text-left">
                <span className="flex items-center gap-2">
                  <span className={`text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`}>▾</span>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${BADGE[g.type] ?? "bg-gray-100 text-gray-600"}`}>{g.label}</span>
                  <span className="text-sm text-gray-400">({g.count} lyklar)</span>
                </span>
                <span className="flex flex-wrap gap-x-6 text-sm text-gray-500">
                  <span>Upphaf: <b className={`text-gray-700 ${neg(g.opening)}`}>{kr2(g.opening)}</b></span>
                  <span>Hreyfing: <b className={`text-gray-700 ${neg(g.movement)}`}>{kr2(g.movement)}</b></span>
                  <span>Lok: <b className={`text-gray-800 ${neg(g.closing)}`}>{kr2(g.closing)}</b></span>
                </span>
              </button>

              {open && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-left">
                      <tr className="border-b border-gray-100">
                        <th className="px-5 py-2 font-medium">Lykill</th>
                        <th className="px-3 py-2 font-medium">RSK</th>
                        <th className="px-3 py-2 font-medium">VSK</th>
                        <th className="px-3 py-2 font-medium text-right">Staða í upphafi</th>
                        <th className="px-3 py-2 font-medium text-right">Debet</th>
                        <th className="px-3 py-2 font-medium text-right">Kredit</th>
                        <th className="px-3 py-2 font-medium text-right">Hreyfing</th>
                        <th className="px-5 py-2 font-medium text-right">Staða í lok</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.accounts.map((a) => (
                        <tr key={a.account_number} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-5 py-2"><span className="font-mono font-semibold">{a.account_number}</span> <span className="text-gray-500">{a.name}</span></td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-400">{a.rsk_code ?? "-"}</td>
                          <td className="px-3 py-2">{a.vatLabel ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">{a.vatLabel}</span> : <span className="text-gray-300">-</span>}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{kr2(a.opening)}</td>
                          <td className="px-3 py-2 text-right">{kr2(a.period_debit)}</td>
                          <td className="px-3 py-2 text-right">{kr2(a.period_credit)}</td>
                          <td className={`px-3 py-2 text-right ${neg(a.movement)}`}>{kr2(a.movement)}</td>
                          <td className={`px-5 py-2 text-right font-semibold ${neg(a.closing)}`}>{kr2(a.closing)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50/40">
                        <td className="px-5 py-2" colSpan={3}>Samtals {g.label}</td>
                        <td className={`px-3 py-2 text-right ${neg(g.opening)}`}>{kr2(g.opening)}</td>
                        <td className="px-3 py-2 text-right">{kr2(g.period_debit)}</td>
                        <td className="px-3 py-2 text-right">{kr2(g.period_credit)}</td>
                        <td className={`px-3 py-2 text-right ${neg(g.movement)}`}>{kr2(g.movement)}</td>
                        <td className={`px-5 py-2 text-right ${neg(g.closing)}`}>{kr2(g.closing)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 mt-5 grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCol title="Staða í upphafi" s={tb.opening} />
        <SummaryCol title="Hreyfingar á tímabili" s={tb.period} />
        <SummaryCol title="Staða í lok" s={tb.closing} />
      </div>
    </div>
  );
}

function SummaryCol({ title, s }: { title: string; s: TBSummary }) {
  const ok = Math.round(s.diff) === 0;
  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Debet:</span><b>{kr2(s.debet)}</b></div>
        <div className="flex justify-between"><span className="text-gray-500">Kredit:</span><b>{kr2(s.kredit)}</b></div>
        <div className="flex justify-between pt-1"><span className="text-gray-500">Mismunur:</span><b className={ok ? "text-green-700" : "text-red-600"}>{kr2(s.diff)}</b></div>
      </div>
    </div>
  );
}
