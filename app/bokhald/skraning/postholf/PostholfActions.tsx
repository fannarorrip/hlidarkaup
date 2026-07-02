"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// "Sækja núna" — manually trigger an inbox poll and report the result.
export default function PostholfActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function poll() {
    setBusy(true); setMsg(""); setErr("");
    try {
      const r = await fetch("/api/skraning/email/poll", { method: "POST" });
      const d = await r.json();
      if (!r.ok || d.ok === false) { setErr(d.message || d.error || "Tókst ekki að sækja"); return; }
      setMsg(`Tölvupóstur — skoðað: ${d.checked} · ný drög: ${d.pending} · sleppt: ${d.skipped}${d.errors ? ` · villur: ${d.errors}` : ""}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Villa");
    } finally { setBusy(false); }
  }

  async function pollInExchange() {
    setBusy(true); setMsg(""); setErr("");
    try {
      const r = await fetch("/api/inexchange/poll", { method: "POST" });
      const d = await r.json();
      if (!r.ok || d.ok === false) { setErr(d.message || d.error || "inExchange ekki tiltækt"); return; }
      setMsg(`inExchange — skoðað: ${d.checked} · ný drög: ${d.created} · sleppt: ${d.skipped}${d.errors ? ` · villur: ${d.errors}` : ""}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Villa");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={poll} disabled={busy}
        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
        {busy ? "Sæki…" : "↻ Sækja úr tölvupósti"}
      </button>
      <button onClick={pollInExchange} disabled={busy}
        className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
        ↻ Sækja frá inExchange
      </button>
      {msg && <span className="text-xs text-green-700">{msg}</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
