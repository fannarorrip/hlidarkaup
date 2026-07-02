"use client";
import { useState } from "react";

// Inline toggle for the "rafræn viðskipti" flag, directly in the viðskiptamannalisti.
// PATCHes /api/customers/[id]; optimistic with rollback on failure.
export default function RafraenToggle({ id, initial, hasKennitala }: { id: string; initial: boolean; hasKennitala: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next); setBusy(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rafraen_vidskipti: next }),
      });
      if (!res.ok) setOn(!next); // rollback
    } catch {
      setOn(!next);
    } finally { setBusy(false); }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input type="checkbox" checked={on} disabled={busy} onChange={toggle}
        className="w-4 h-4 accent-red-600 cursor-pointer disabled:opacity-50" />
      {on && !hasKennitala && <span title="Kennitölu vantar fyrir sendingu" className="text-amber-500 text-xs">⚠ vantar kt.</span>}
    </span>
  );
}
