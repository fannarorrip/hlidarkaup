"use client";
import { vNr } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VskActions({ year, period, settled }: {
  year: number; period: number;
  settled: { series_code: string | null; voucher_number: string | null } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function settle() {
    if (!window.confirm("Bóka VSK-uppgjör fyrir þetta tímabil? Þetta stofnar færslu í bókhaldi (Debet útskattur / Kredit innskattur → 9535).")) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/vsk/settle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ year, period }) });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/vsk/pdf?year=${year}&period=${period}`} target="_blank" rel="noopener"
        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">📄 PDF</a>
      <a href={`/api/vsk/xlsx?year=${year}&period=${period}`}
        className="px-3 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800">📊 Excel</a>
      {settled?.voucher_number ? (
        <a href={`/bokhald/fylgiskjol/${settled.series_code}-${settled.voucher_number}`}
          className="px-3 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-semibold">✓ Gert upp · {vNr(settled.series_code, settled.voucher_number)}</a>
      ) : (
        <button onClick={settle} disabled={busy}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">
          {busy ? "Bóka…" : "Bóka VSK-uppgjör"}
        </button>
      )}
      {err && <span className="text-red-600 text-xs">{err}</span>}
    </div>
  );
}
