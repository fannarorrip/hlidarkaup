"use client";
import { useState } from "react";

export default function ArionTest({ ready }: { ready: boolean }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);

  async function test() {
    setBusy(true); setRes(null);
    try {
      const r = await fetch("/api/bankatenging/test", { method: "POST" });
      const d = await r.json();
      setRes({ ok: !!d.ok, message: d.message || (d.ok ? "Tókst" : "Mistókst") });
    } catch (e) {
      setRes({ ok: false, message: e instanceof Error ? e.message : "Villa" });
    } finally { setBusy(false); }
  }

  return (
    <div>
      <button onClick={test} disabled={busy}
        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
        {busy ? "Prófa…" : "Prófa tengingu"}
      </button>
      {!ready && <p className="text-xs text-amber-600 mt-2">Stillingar eru ekki fullkláraðar — prófun mun tilkynna hvað vantar.</p>}
      {res && (
        <div className={`mt-3 text-sm rounded-lg px-3 py-2 ${res.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {res.ok ? "✓ " : "✗ "}{res.message}
        </div>
      )}
    </div>
  );
}
