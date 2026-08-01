"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClaimsActions({ enabled, queued }: { enabled: boolean; queued: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [testKt, setTestKt] = useState("");
  const [testAmt, setTestAmt] = useState("100");

  async function run(action: "send" | "sync" | "test") {
    setBusy(action); setErr(""); setMsg("");
    try {
      const body = action === "test" ? { action, kennitala: testKt, amount: Number(testAmt) || 100 } : { action };
      const r = await fetch("/api/bankatenging/claims", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      if (action === "send") setMsg(`Sendi ${d.sent} kröfur${d.failed ? ` · ${d.failed} villur` : ""}${d.skipped ? ` · ${d.skipped} sleppt` : ""}.`);
      else if (action === "test") setMsg(`${d.message}${d.arionRef ? ` (nr. ${d.claimNumber})` : ""}`);
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
      {/* Prufukrafa: ein krafa beint í Kröfupottinn (sama snið og alvöru), án þess að hreyfa
         biðröðina — birtist á Kröfur-síðunni og fellist niður þar (+ í netbanka ef stofnuð). */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <input value={testKt} onChange={(e) => setTestKt(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Kennitala greiðanda" className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono w-44 outline-none focus:border-red-400" />
        <input value={testAmt} onChange={(e) => setTestAmt(e.target.value.replace(/\D/g, "").slice(0, 5))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-20 text-right outline-none focus:border-red-400" />
        <span className="text-sm text-gray-500 -ml-1">kr.</span>
        <button onClick={() => run("test")} disabled={!!busy || testKt.length !== 10} className="px-4 py-2 rounded-lg border-2 border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          {busy === "test" ? "Stofna…" : "Senda prufukröfu"}
        </button>
      </div>
      {err && <div className="mt-2 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">✗ {err}</div>}
      {msg && <div className="mt-2 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700">{msg}</div>}
    </div>
  );
}
