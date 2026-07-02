"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Upload a supplier invoice (PEPPOL/UBL XML or PDF) → creates a goods-receipt draft.
export default function MottakaUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const toB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

  async function onFile(f: File) {
    setBusy("Les reikning…"); setErr("");
    try {
      const data = await toB64(f);
      const r = await fetch("/api/innkaup/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name, mime: f.type, data }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Tókst ekki að lesa reikning"); return; }
      router.push(`/bokhald/solukerfi/innkaup/mottaka/${d.receiptId}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); } finally { setBusy(""); }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <input ref={fileRef} type="file" accept=".xml,application/xml,text/xml,.pdf,application/pdf,image/*" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
      <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
        {busy || "+ Hlaða inn reikningi (XML/PDF)"}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
