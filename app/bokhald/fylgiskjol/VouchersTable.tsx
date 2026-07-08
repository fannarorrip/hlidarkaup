"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { VoucherListRow } from "@/lib/accounting-queries";
import { dags, kr, vType, STATUS_LABEL, vNr } from "@/lib/format";
import { registerName } from "@/lib/registers";

const badge = (status: string) => {
  const map: Record<string, string> = {
    posted: "bg-green-50 text-green-700",
    reversed: "bg-gray-100 text-gray-500 line-through",
    draft: "bg-amber-50 text-amber-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
};

export default function VouchersTable({ vouchers }: { vouchers: VoucherListRow[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<VoucherListRow[] | null>(null); // null = no active search
  const [loading, setLoading] = useState(false);

  // Server-side, accent-insensitive search over ALL vouchers (debounced) —
  // matches number, lýsing, lánadrottinn and tilvísun/reikningsnúmer.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/fylgiskjol/search?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        setResults(d.vouchers ?? []);
      } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const rows = results ?? vouchers;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Leita — númer, lýsing, lánadrottinn, reikningsnúmer…"
          className="flex-1 max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"
        />
        <span className="text-xs text-gray-400">
          {loading ? "Leita…" : results ? `${rows.length} fundust` : `Sýni nýjustu ${rows.length} — leitaðu til að finna fleiri`}
        </span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nr.</th>
              <th className="px-4 py-2 font-medium">Dags.</th>
              <th className="px-4 py-2 font-medium">Tegund</th>
              <th className="px-4 py-2 font-medium">Kassi</th>
              <th className="px-4 py-2 font-medium">Lýsing</th>
              <th className="px-4 py-2 font-medium">Lánadrottinn</th>
              <th className="px-4 py-2 font-medium">Reikningsnr.</th>
              <th className="px-4 py-2 font-medium">Staða</th>
              <th className="px-4 py-2 font-medium text-right">Upphæð</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">{results ? "Ekkert fannst" : "Engin fylgiskjöl enn"}</td></tr>
            ) : rows.map((v) => (
              <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/bokhald/fylgiskjol/${v.id}`} className="font-mono text-red-700 hover:underline whitespace-nowrap">
                    {vNr(v.series_code, v.voucher_number)}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{dags(v.voucher_date)}</td>
                <td className="px-4 py-2">{vType(v.voucher_type)}</td>
                <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{registerName(v.register_id) ?? "—"}</td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-[16rem]">{v.description}</td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-[12rem]">{v.supplier_name ?? "—"}</td>
                <td className="px-4 py-2 text-gray-600 font-mono text-xs">{v.external_reference ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${badge(v.status)}`}>{STATUS_LABEL[v.status] ?? v.status}</span>
                </td>
                <td className="px-4 py-2 text-right font-medium whitespace-nowrap">{kr(v.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
