"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Fella niður kröfu (endurskoðandakrafa). Staðbundin afturköllun — 'created' krafa
// þarf líka niðurfellingu í netbanka (REST API bankans hefur enga cancel-aðgerð).
export default function CancelClaimButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (status === "paid" || status === "cancelled" || status === "sending") return null;

  async function cancel() {
    const warn = status === "created"
      ? "Krafan er þegar stofnuð í bankanum. Hún verður merkt afturkölluð hér — MUNDU að fella hana líka niður í netbanka Arion.\n\nHalda áfram?"
      : "Eyða þessari kröfu úr biðröðinni?";
    if (!confirm(warn)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/bankatenging/claims", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", id }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.message || "Afturköllun mistókst."); return; }
      if (status === "created") alert(d.message);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <button onClick={cancel} disabled={busy} title="Fella niður kröfu"
      className="text-xs text-red-600 hover:text-red-800 hover:underline disabled:opacity-40">
      {busy ? "…" : "Fella niður"}
    </button>
  );
}
