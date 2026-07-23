"use client";
import { useState } from "react";
import Link from "next/link";
import { kr, dags, vNr } from "@/lib/format";

interface Row {
  id: string; amount: number; note: string | null; source: string; reviewed: boolean;
  created_at: string; supplier_name: string | null;
  series_code: string | null; voucher_number: string | null; voucher_id: string | null;
}

export default function ReviewRow({ row }: { row: Row }) {
  const [reviewed, setReviewed] = useState(row.reviewed);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const r = await fetch("/api/afstemming/adjustments", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: row.id, reviewed: !reviewed }),
      });
      if (r.ok) setReviewed(!reviewed);
    } finally { setBusy(false); }
  }

  return (
    <tr className={`border-t border-gray-100 ${reviewed ? "text-gray-400" : ""}`}>
      <td className="px-4 py-2">{dags(row.created_at.slice(0, 10))}</td>
      <td className="px-4 py-2">
        {row.voucher_id
          ? <Link href={`/bokhald/fylgiskjol/${row.voucher_id}`} className="font-mono text-red-700 hover:underline">{vNr(row.series_code, row.voucher_number)}</Link>
          : "—"}
      </td>
      <td className="px-4 py-2">{row.supplier_name ?? "—"}</td>
      <td className="px-4 py-2 text-gray-600">{row.note ?? row.source}</td>
      <td className="px-4 py-2 text-right font-medium">{kr(Number(row.amount))}</td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={reviewed} onChange={toggle} disabled={busy} className="w-4 h-4 accent-red-600 cursor-pointer" />
      </td>
    </tr>
  );
}
