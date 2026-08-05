"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// "Sækja núna" — manually trigger an inbox poll and report the result.
// + handvirk innsetning: reikningur sem barst ALDREI (mynd/PDF) fer inn hér og eltir sömu braut.
export default function PostholfActions() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function upload(list: FileList | null) {
    if (!list || !list.length) return;
    setBusy(true); setMsg(""); setErr("");
    try {
      const fd = new FormData();
      for (const f of Array.from(list)) fd.append("files", f);
      const r = await fetch("/api/skraning/email/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok || d.ok === false) { setErr(d.error || "Innsetning mistókst"); return; }
      setMsg(`Sett inn: ${d.pending} drög${d.errors ? ` · ${d.errors} í Villa (Laga →)` : ""}${d.skipped ? ` · ${d.skipped} sleppt` : ""}${d.messages?.length ? ` — ${d.messages.join("; ")}` : ""}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Villa");
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

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
      {/* Handvirk innsetning: barst reikningur ALDREI í pósthólfið? Settu skjalið inn hér —
         mynd af pappírsreikningi dugar. Fer í sama AI-lestur og samþykktarferli. */}
      <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv" className="hidden" onChange={(e) => upload(e.target.files)} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="px-4 py-2 rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
        {busy ? "Vinn…" : "＋ Setja inn reikning (PDF/mynd)"}
      </button>
      {msg && <span className="text-xs text-green-700">{msg}</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
