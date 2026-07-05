"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GoodsReceiptRow, GoodsReceiptLineRow } from "@/lib/accounting-queries";
import { dags, kr } from "@/lib/format";
import SupplierPicker from "../../../../SupplierPicker";
import ProductPicker from "../../../../ProductPicker";

interface LineState { id: string; matched: string | null; matchedName: string | null; received: string }

export default function ReceiptDetail({ receipt, lines }: { receipt: GoodsReceiptRow & { has_doc?: boolean }; lines: GoodsReceiptLineRow[] }) {
  const router = useRouter();
  const booked = receipt.status === "booked";
  const [supplierId, setSupplierId] = useState<string | null>(receipt.supplier_id);
  const [rows, setRows] = useState<LineState[]>(lines.map((l) => ({
    id: l.id, matched: l.matched_product_number, matchedName: l.matched_name,
    received: l.received_qty != null ? String(l.received_qty) : String(l.invoiced_qty),
  })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const setRow = (i: number, patch: Partial<LineState>) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function save(thenConfirm: boolean) {
    setBusy(true); setErr(""); setOk("");
    const body = {
      supplier_id: supplierId ?? undefined,
      lines: rows.map((r) => ({ id: r.id, matched_product_number: r.matched, received_qty: r.received === "" ? null : Number(r.received) })),
    };
    const r = await fetch(`/api/innkaup/receipt/${receipt.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Villa við vistun"); setBusy(false); return; }
    if (thenConfirm) {
      const c = await fetch(`/api/innkaup/receipt/${receipt.id}/confirm`, { method: "POST" });
      const d = await c.json(); setBusy(false);
      if (!c.ok) { setErr(d.error ?? "Villa við bókun"); return; }
      router.refresh();
    } else { setBusy(false); setOk("Vistað"); router.refresh(); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Móttaka — {receipt.supplier_name || "óþekktur birgir"}</h1>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${booked ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{booked ? "Bókað" : "Drög"}</span>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Reikningur {receipt.invoice_number || "—"} · {dags(receipt.invoice_date)} · {receipt.source === "peppol" ? "inExchange (XML)" : receipt.source === "pdf" ? "PDF (gervigreind)" : "handvirkt"}
        {receipt.has_doc && <> · <a href={`/api/innkaup/receipt/${receipt.id}/document`} target="_blank" rel="noopener" className="text-red-600 hover:underline">skjal</a></>}
        {booked && receipt.voucher_id && <> · <Link href={`/bokhald/fylgiskjol/${receipt.voucher_id}`} className="text-red-600 hover:underline">fylgiskjal</Link></>}
      </p>

      {!booked && !receipt.supplier_id && (
        <div className="mb-5 max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-1">Birgir (lánadrottinn)</label>
          <SupplierPicker suggestName={receipt.supplier_name ?? undefined} onChange={(id) => setSupplierId(id)} />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Vörulýsing (reikningur)</th>
              <th className="px-3 py-2 font-semibold w-64">Vara í kerfinu</th>
              <th className="px-3 py-2 font-semibold text-right w-20">Á reikn.</th>
              <th className="px-3 py-2 font-semibold text-right w-24">Móttekið</th>
              <th className="px-3 py-2 font-semibold text-right w-24">Frávik</th>
              <th className="px-3 py-2 font-semibold text-right w-24">Ein.verð</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const inv = Number(l.invoiced_qty);
              const rec = rows[i]?.received === "" ? null : Number(rows[i]?.received);
              const variance = rec == null ? null : rec - inv;
              return (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.description || "—"}</div>
                    <div className="text-xs text-gray-400">{l.gtin ? `EAN ${l.gtin}` : l.supplier_item_id ? `nr. ${l.supplier_item_id}` : ""}</div>
                  </td>
                  <td className="px-3 py-2">
                    {booked ? <span className="text-xs">{l.matched_name || <span className="text-gray-300">óparað</span>}</span>
                      : <ProductPicker value={rows[i]?.matched ?? null} valueName={rows[i]?.matchedName} onChange={(pn, name) => setRow(i, { matched: pn, matchedName: name })} />}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{inv}{l.unit_code ? ` ${l.unit_code}` : ""}</td>
                  <td className="px-3 py-2 text-right">
                    {booked ? <span>{l.received_qty ?? "—"}</span>
                      : <input value={rows[i]?.received ?? ""} onChange={(e) => setRow(i, { received: e.target.value.replace(/[^\d.]/g, "") })} className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right outline-none focus:border-red-400" />}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${variance == null || variance === 0 ? "text-gray-300" : variance < 0 ? "text-red-600" : "text-amber-600"}`}>
                    {variance == null || variance === 0 ? "—" : (variance > 0 ? `+${variance}` : variance)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">{l.unit_price ? kr(l.unit_price) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 mt-3 text-sm flex flex-wrap gap-x-8">
        <span>Án vsk: <b>{receipt.total_net ? kr(receipt.total_net) : "—"}</b></span>
        <span>VSK: <b>{receipt.total_vat ? kr(receipt.total_vat) : "—"}</b></span>
        <span>Samtals: <b>{receipt.total_gross ? kr(receipt.total_gross) : "—"}</b></span>
      </div>

      {err && <p className="text-sm text-red-600 mt-4">{err}</p>}
      {ok && <p className="text-sm text-green-700 mt-4">{ok}</p>}

      {!booked && (
        <div className="mt-5 flex items-center gap-3">
          <button onClick={() => save(true)} disabled={busy} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">{busy ? "Vinn…" : "Staðfesta móttöku og bóka"}</button>
          <button onClick={() => save(false)} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50">Vista drög</button>
          <Link href="/bokhald/solukerfi/innkaup/mottaka" className="text-sm text-gray-500 hover:text-gray-800">← Til baka</Link>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-4">Birgðir uppfærast eftir MÓTTEKNU magni; bókhaldið bókast skv. reikningnum. Frávik (vantar/umfram) má gera kröfu á birgi um.</p>
    </div>
  );
}
