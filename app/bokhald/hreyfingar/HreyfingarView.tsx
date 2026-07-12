"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { LedgerAccount } from "@/lib/ledger-report";
import { vNr } from "@/lib/format";

const isk = (n: number) => Math.round(Number(n)).toLocaleString("is-IS") + " kr.";
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };
const neg = (n: number) => (n < -0.005 ? "text-red-600" : "");

export default function HreyfingarView({ accounts, from, to }: { accounts: LedgerAccount[]; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (n: string) => setOpen((p) => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; });
  const setRange = (f: string, t: string) => router.push(`${pathname}?from=${f}&to=${t}`);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><span>📒</span> Hreyfingar</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <input type="date" value={from} onChange={(e) => setRange(e.target.value, to)} className="outline-none bg-transparent" />
            <span className="text-gray-400">→</span>
            <input type="date" value={to} onChange={(e) => setRange(from, e.target.value)} className="outline-none bg-transparent" />
          </div>
          <button onClick={() => setOpen(new Set(accounts.map((a) => a.account_number)))} className="text-sm text-gray-500 hover:text-gray-800">Opna allt</button>
          <button onClick={() => setOpen(new Set())} className="text-sm text-gray-500 hover:text-gray-800">Loka öllu</button>
          <a href={`/api/hreyfingar/pdf?from=${from}&to=${to}`} target="_blank" rel="noopener"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">📄 Sækja PDF</a>
          <a href={`/api/hreyfingar/xlsx?from=${from}&to=${to}`}
            className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800">📊 Sækja Excel</a>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">Lyklar með hreyfingu á tímabilinu ({accounts.length}). Smelltu á lykil til að sjá færslur.</p>

      <div className="space-y-3">
        {accounts.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center text-gray-400">Engar hreyfingar á tímabilinu</div>
        )}
        {accounts.map((a) => {
          const isOpen = open.has(a.account_number);
          return (
            <div key={a.account_number} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => toggle(a.account_number)} className="w-full flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-gray-50 text-left">
                <span className="flex items-center gap-2">
                  <span className={`text-gray-400 transition-transform ${isOpen ? "" : "-rotate-90"}`}>▾</span>
                  <span className="font-mono font-semibold">{a.account_number}</span>
                  <span className="text-gray-600">{a.name}</span>
                  <span className="text-sm text-gray-400">({a.lines.length} færslur)</span>
                </span>
                <span className="flex flex-wrap gap-x-6 text-sm text-gray-500">
                  <span>Upphaf: <b className={`text-gray-700 ${neg(a.opening)}`}>{isk(a.opening)}</b></span>
                  <span>Staða: <b className={`text-gray-800 ${neg(a.closing)}`}>{isk(a.closing)}</b></span>
                </span>
              </button>

              {isOpen && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="text-gray-500 text-left">
                      <tr className="border-b border-gray-100">
                        <th className="px-5 py-2 font-medium">Dags.</th>
                        <th className="px-3 py-2 font-medium">Fylgiskjal</th>
                        <th className="px-3 py-2 font-medium">Skýring</th>
                        <th className="px-3 py-2 font-medium text-right">Debet</th>
                        <th className="px-3 py-2 font-medium text-right">Kredit</th>
                        <th className="px-5 py-2 font-medium text-right">Staða</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.lines.map((l, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-5 py-2 text-gray-600 whitespace-nowrap">{fmtD(l.voucher_date)}</td>
                          <td className="px-3 py-2">
                            <Link href={`/bokhald/fylgiskjol/${l.voucher_id}`} className="font-mono text-red-700 hover:underline">{vNr(l.series_code, l.voucher_number)}</Link>
                          </td>
                          <td className="px-3 py-2 text-gray-500 truncate max-w-[16rem]">{l.description ?? ""}</td>
                          <td className="px-3 py-2 text-right">{l.debit ? isk(l.debit) : ""}</td>
                          <td className="px-3 py-2 text-right">{l.credit ? isk(l.credit) : ""}</td>
                          <td className={`px-5 py-2 text-right font-medium ${neg(l.running)}`}>{isk(l.running)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50/40">
                        <td className="px-5 py-2" colSpan={3}>Samtals</td>
                        <td className="px-3 py-2 text-right">{isk(a.total_debit)}</td>
                        <td className="px-3 py-2 text-right">{isk(a.total_credit)}</td>
                        <td className={`px-5 py-2 text-right ${neg(a.closing)}`}>{isk(a.closing)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
