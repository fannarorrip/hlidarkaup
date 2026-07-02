"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Rafrænn reikningur status + (re)send control for the Reikningar list / detail.
// Only shown for customers flagged "rafræn viðskipti". POSTs /api/einvoice/[id]/send.
const LABEL: Record<string, { t: string; c: string }> = {
  sent: { t: "Sent", c: "bg-green-100 text-green-700" },
  queued: { t: "Í biðröð", c: "bg-amber-100 text-amber-700" },
  failed: { t: "Mistókst", c: "bg-red-100 text-red-700" },
};

export default function EinvoiceSendButton({ voucherId, flagged, status, hasKt }: {
  voucherId: string; flagged: boolean; status: string | null; hasKt: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [st, setSt] = useState(status);

  if (!flagged) return <span className="text-gray-300">—</span>;

  async function send() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/einvoice/${voucherId}/send`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (d.outbox?.status) setSt(d.outbox.status);
      if (!res.ok) setMsg(d.error || "Sending mistókst");
      else router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Villa");
    } finally { setBusy(false); }
  }

  const badge = st ? LABEL[st] : null;
  return (
    <span className="inline-flex items-center gap-2">
      {badge && <span className={`text-xs px-2 py-0.5 rounded ${badge.c}`}>{badge.t}</span>}
      {!hasKt && <span className="text-amber-500 text-xs" title="Kennitölu vantar fyrir sendingu">⚠ kt.</span>}
      <button onClick={send} disabled={busy}
        className="text-xs px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
        {busy ? "…" : st === "sent" ? "Senda aftur" : "Senda"}
      </button>
      {msg && <span className="text-xs text-red-600 max-w-[12rem] truncate" title={msg}>{msg}</span>}
    </span>
  );
}
