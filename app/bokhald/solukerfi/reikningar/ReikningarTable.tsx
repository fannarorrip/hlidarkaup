"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SalesInvoiceRow } from "@/lib/accounting-queries";
import { dags, kr, vType, sourceLabel, STATUS_LABEL, vNr } from "@/lib/format";
import EinvoiceSendButton from "./EinvoiceSendButton";

export default function ReikningarTable({ rows: initial }: { rows: SalesInvoiceRow[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SalesInvoiceRow[] | null>(null); // null = no active search
  const [loading, setLoading] = useState(false);

  // Server-side, accent-insensitive search over ALL sales (debounced) — viðskiptamaður (nafn/kt),
  // númer og lýsing.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/reikningar/search?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        setResults(d.rows ?? []);
      } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const rows = results ?? initial;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Leita — viðskiptamaður, kennitala, númer, lýsing…"
          className="flex-1 max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"
        />
        <span className="text-xs text-gray-400">
          {loading ? "Leita…" : results ? `${rows.length} fundust` : `Sýni nýjustu ${rows.length} — leitaðu til að finna fleiri`}
        </span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nr.</th>
              <th className="px-4 py-2 font-medium">Dags.</th>
              <th className="px-4 py-2 font-medium">Tegund</th>
              <th className="px-4 py-2 font-medium">Rás</th>
              <th className="px-4 py-2 font-medium">Viðskiptamaður</th>
              <th className="px-4 py-2 font-medium">Lýsing</th>
              <th className="px-4 py-2 font-medium">Staða</th>
              <th className="px-4 py-2 font-medium text-right">Upphæð</th>
              <th className="px-4 py-2 font-medium">Rafrænn</th>
              <th className="px-4 py-2 font-medium text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-400">{results ? "Ekkert fannst" : "Engin sala enn"}</td></tr>
            ) : rows.map((v) => (
              <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/bokhald/solukerfi/reikningar/${v.id}`} className="font-mono text-red-700 hover:underline whitespace-nowrap">{vNr(v.series_code, v.voucher_number)}</Link>
                </td>
                {/* Klukkan með: nauðsynleg til að para sölu við posakvittun (t.d. tvöföld heimild). */}
                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{dags(v.voucher_date)}{v.created_time ? <span className="text-gray-400"> · {v.created_time}</span> : null}</td>
                <td className="px-4 py-2">{vType(v.voucher_type)}</td>
                <td className="px-4 py-2 text-gray-600">{sourceLabel(v.source)}</td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-[12rem]">{v.customer_name ?? "—"}</td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-sm">{v.description}</td>
                <td className="px-4 py-2"><span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{STATUS_LABEL[v.status] ?? v.status}</span></td>
                <td className="px-4 py-2 text-right font-medium whitespace-nowrap">{kr(v.amount)}</td>
                <td className="px-4 py-2">
                  <EinvoiceSendButton voucherId={v.id} flagged={v.customer_flagged} status={v.einvoice_status} hasKt={!!v.customer_kt} />
                </td>
                <td className="px-4 py-2 text-right">
                  <a href={`/api/reikningur/${v.id}/pdf`} target="_blank" rel="noopener" className="text-red-700 hover:underline">PDF</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
