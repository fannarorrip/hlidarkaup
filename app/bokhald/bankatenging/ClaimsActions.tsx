"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClaimsActions({ enabled, queued }: { enabled: boolean; queued: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function run(action: "send" | "sync") {
    setBusy(action); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/bankatenging/claims", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      if (action === "send") setMsg(`Sendi ${d.sent} kröfur${d.failed ? ` · ${d.failed} villur` : ""}${d.skipped ? ` · ${d.skipped} sleppt` : ""}.`);
      else setMsg(`Skoðaði ${d.checked} kröfur · ${d.settled} greiddar bókaðar${d.errors?.length ? ` · ${d.errors.length} villur` : ""}.`);
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(""); }
  }

  if (!enabled) {
    return (
      <div className="mt-3 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-700">
        Kröfusending er óvirk. Kveiktu á <code>ARION_CLAIMS_ENABLED</code> þegar innheimtusamningur, kröfusnið og búnaðarskilríki eru komin.
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <button onClick={() => run("send")} disabled={!!busy || queued === 0} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">
          {busy === "send" ? "Sendi…" : `Senda kröfur í banka${queued ? ` (${queued})` : ""}`}
        </button>
        <button onClick={() => run("sync")} disabled={!!busy} className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-40">
          {busy === "sync" ? "Sæki…" : "Sækja greiðslur"}
        </button>
      </div>
      {err && <div className="mt-2 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">✗ {err}</div>}
      {msg && <div className="mt-2 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700">{msg}</div>}
    </div>
  );
}
