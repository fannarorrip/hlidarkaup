"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Kreditera sölureikning: create an offsetting kreditreikningur (keeps the original) and cancel
// any open krafa. Only rendered for account invoices that aren't themselves credit notes.
export default function CreditButton({ voucherId, voucherType }: { voucherId: string; voucherType: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!["account_sale", "sales_invoice"].includes(voucherType)) return null;

  async function credit() {
    if (!confirm("Búa til kreditreikning á móti þessum reikningi? Upprunalegi reikningurinn stendur áfram, en krafan (ef einhver) er felld niður.")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/reikningur/${voucherId}/credit`, { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.ok) { alert(d.error ?? "Kreditun mistókst."); return; }
      alert(`Kreditreikningur ${d.creditInvoiceNumber} búinn til.${d.claimCancelled ? " Krafan var felld niður." : ""}`);
      if (d.creditVoucherId) router.push(`/bokhald/solukerfi/reikningar/${d.creditVoucherId}`);
      else router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <button onClick={credit} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50">
      {busy ? "Krediterar…" : "Kreditera reikning"}
    </button>
  );
}
