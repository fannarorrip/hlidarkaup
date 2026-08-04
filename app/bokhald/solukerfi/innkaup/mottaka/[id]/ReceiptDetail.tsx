"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GoodsReceiptRow, GoodsReceiptLineRow } from "@/lib/accounting-queries";
import { dags, kr } from "@/lib/format";
import SupplierPicker from "../../../../SupplierPicker";
import ProductPicker from "../../../../ProductPicker";

interface LineState { id: string; matched: string | null; matchedName: string | null; received: string; markup: string; pack: string; cost: string; reviewed: boolean }

export default function ReceiptDetail({ receipt, lines }: { receipt: GoodsReceiptRow & { has_doc?: boolean }; lines: GoodsReceiptLineRow[] }) {
  const router = useRouter();
  const booked = receipt.status === "booked";
  const [supplierId, setSupplierId] = useState<string | null>(receipt.supplier_id);
  // Magntölur koma úr numeric(18,3) sem strengur ("10.000" = TÍU með þremur aukastöfum, EKKI
  // tíu þúsund!) — Number() hreinsar aukastafina svo birtingin verði ótvíræð ("10").
  const qty = (v: string | number | null | undefined) => (v == null ? "" : String(Number(v)));
  const [rows, setRows] = useState<LineState[]>(lines.map((l) => ({
    id: l.id, matched: l.matched_product_number, matchedName: l.matched_name,
    received: l.received_qty != null ? qty(l.received_qty) : qty(l.invoiced_qty),
    markup: l.matched_markup != null ? String(Number(l.matched_markup)).replace(".", ",") : "",
    pack: l.pack_qty != null ? qty(l.pack_qty) : "",
    cost: l.unit_cost_override != null ? String(Number(l.unit_cost_override)).replace(".", ",") : "",
    reviewed: !!l.reviewed,
  })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  // "Stofna nýja vöru" beint úr ópöruðum reikningslínum — forfyllt úr línunni.
  const [newProd, setNewProd] = useState<{ i: number; name: string; barcode: string; price: string; vat: string } | null>(null);
  const [creating, setCreating] = useState(false);

  async function createProduct() {
    if (!newProd) return;
    setCreating(true); setErr("");
    const r = await fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      name: newProd.name.trim(), barcode: newProd.barcode.trim() || undefined,
      price_gross: Number(newProd.price.replace(",", ".")) || 0, vat_rate: Number(newProd.vat) || 24,
    }) });
    const d = await r.json().catch(() => ({})); setCreating(false);
    if (!r.ok) { setErr(d.error ?? "Stofnun mistókst"); return; }
    setRow(newProd.i, { matched: d.product_number, matchedName: newProd.name.trim() });
    setNewProd(null);
  }

  async function renameProduct(i: number) {
    const r = rows[i];
    if (!r?.matched) return;
    const name = prompt("Nýtt heiti vörunnar:", r.matchedName ?? "");
    if (name == null || !name.trim() || name.trim() === r.matchedName) return;
    const res = await fetch(`/api/products/${encodeURIComponent(r.matched)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? "Tókst ekki að breyta heiti"); return; }
    setRow(i, { matchedName: name.trim() });
  }

  const setRow = (i: number, patch: Partial<LineState>) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const buildBody = () => ({
    supplier_id: supplierId ?? undefined,
    lines: rows.map((r) => ({
      id: r.id, matched_product_number: r.matched,
      received_qty: r.received === "" ? null : Number(r.received.replace(",", ".")),
      markup: r.markup.trim() === "" ? null : Number(r.markup.replace(",", ".")),
      pack_qty: r.pack.trim() === "" ? null : Number(r.pack.replace(",", ".")),
      unit_cost_override: r.cost.trim() === "" ? null : Number(r.cost.replace(",", ".")),
      reviewed: r.reviewed,
    })),
  });

  // SJÁLFVIRK VISTUN: hver breyting vistast sjálfkrafa eftir 2,5 sek kyrrð — margra klukkutíma
  // pörunarvinna má aldrei týnast. Rennur innskráningin út helst vinnan í vafranum og notandinn
  // fær skýr fyrirmæli (innskráning í nýjum flipa → sjálfvirka vistunin nær aftur sambandi).
  const dirtyRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);
  const [autoState, setAutoState] = useState<"" | "saving" | "saved" | "auth" | "fail">("");
  useEffect(() => {
    if (booked) return;
    if (firstRender.current) { firstRender.current = false; return; }
    dirtyRef.current = true;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setAutoState("saving");
      try {
        const r = await fetch(`/api/innkaup/receipt/${receipt.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(buildBody()) });
        if (r.ok) { dirtyRef.current = false; setAutoState("saved"); }
        else if (r.status === 401 || r.status === 403 || r.redirected) setAutoState("auth");
        else setAutoState("fail");
      } catch { setAutoState("fail"); }
    }, 2500);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, supplierId, booked]);

  // Vörn gegn óvart-lokun/endurhleðslu með óvistaða vinnu.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current && !booked) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [booked]);

  async function save(thenConfirm: boolean) {
    setBusy(true); setErr(""); setOk("");
    // Handvirk vistun keyrir verðin inn STRAX (apply_prices) — sjálfvirka vistunin geymir bara.
    const r = await fetch(`/api/innkaup/receipt/${receipt.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...buildBody(), apply_prices: !thenConfirm }) });
    const saved = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(saved.error ?? "Villa við vistun"); setBusy(false); return; }
    dirtyRef.current = false;
    if (thenConfirm) {
      const c = await fetch(`/api/innkaup/receipt/${receipt.id}/confirm`, { method: "POST" });
      const d = await c.json(); setBusy(false);
      if (!c.ok) { setErr(d.error ?? "Villa við bókun"); return; }
      router.refresh();
    } else {
      setBusy(false);
      setOk(saved.priceChanges > 0 ? `Vistað — ${saved.priceChanges} verð keyrð inn ✓` : "Vistað");
      router.refresh();
    }
  }

  async function discard() {
    if (!confirm("Henda þessari móttöku? Reikningurinn í pósthólfinu helst óbreyttur.")) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/innkaup/receipt/${receipt.id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Tókst ekki að henda"); setBusy(false); return; }
    router.push("/bokhald/solukerfi/innkaup/mottaka");
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

      {!booked && autoState === "auth" && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Innskráningin rann út — vinnan þín er ÖRUGG í vafranum.</b> Ekki endurhlaða þessari síðu:
          opnaðu <a href="/starf" target="_blank" rel="noopener" className="underline font-semibold">/starf í nýjum flipa</a>,
          skráðu þig inn þar, komdu svo hingað aftur — sjálfvirka vistunin nær þá sambandi við næstu breytingu (eða ýttu á „Vista drög").
        </div>
      )}
      {!booked && autoState === "fail" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          Sjálfvirk vistun mistókst — athugaðu nettengingu og ýttu á „Vista drög". Vinnan er enn í vafranum.
        </div>
      )}

      {!booked && !receipt.supplier_id && (
        <div className="mb-5 max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-1">Birgir (lánadrottinn)</label>
          <SupplierPicker suggestName={receipt.supplier_name ?? undefined} onChange={(id) => setSupplierId(id)} />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Vörulýsing (reikningur)</th>
              <th className="px-3 py-2 font-semibold w-64">Vara í kerfinu</th>
              <th className="px-3 py-2 font-semibold text-right w-20">Á reikn.</th>
              <th className="px-3 py-2 font-semibold text-right w-24">Móttekið</th>
              <th className="px-3 py-2 font-semibold text-right w-24">Frávik</th>
              <th className="px-3 py-2 font-semibold text-right w-20" title="Fjöldi söluvara í hverri reikningseiningu (kassi/grind — t.d. 144). Lærist á vörutengingu birgisins og fyllist sjálfkrafa næst.">Í pakka</th>
              <th className="px-3 py-2 font-semibold text-right w-24" title="Kostnaður á söluvöru. Reiknast sjálfkrafa (upphæð ÷ (magn × í pakka)) — skrifaðu tölu til að yfirskrifa.">Ein.verð</th>
              <th className="px-3 py-2 font-semibold text-right w-20" title="Föst álagning vörunnar — festist á vörunni og reiknar söluverð = kostnaður × álagning við hverja móttöku">Álagning</th>
              <th className="px-3 py-2 font-semibold text-right w-32" title="Núverandi söluverð → verð eftir álagningu (endar á 9). RAUTT = álagningin fer undir ×1,20.">Verð nú → eftir</th>
              <th className="px-3 py-2 font-semibold text-center w-12" title="Farið yfir — línan verður græn og vistast með drögunum. Sé eitthvað hakað keyrir Vista drög verð AÐEINS inn fyrir hökuðu línurnar — restin geymist þar til hakað er (eða bókað).">✓</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const inv = Number(l.invoiced_qty);
              const rec = rows[i]?.received === "" ? null : Number((rows[i]?.received ?? "").replace(",", "."));
              const variance = rec == null ? null : rec - inv;
              return (
                /* Ljósgræn lína = búið að fara yfir hana (hakið aftast) */
                <tr key={l.id} className={`border-t border-gray-100 ${rows[i]?.reviewed ? "bg-green-50" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.description || "—"}</div>
                    <div className="text-xs text-gray-400">{l.gtin ? `EAN ${l.gtin}` : l.supplier_item_id ? `nr. ${l.supplier_item_id}` : ""}</div>
                  </td>
                  <td className="px-3 py-2">
                    {booked ? (
                      <span className="text-xs">
                        {l.matched_name || <span className="text-gray-300">óparað</span>}
                        {l.learned_match && <span className="ml-1 text-green-600" title="Staðfest tenging — bókuð áður út frá vörunúmeri birgja">✓</span>}
                      </span>
                    )
                      : (
                        <div className="flex items-center gap-1.5">
                          {/* Grænt ✓ = LÆRÐ pörun (vörunúmer birgja → þessi vara, bókuð áður) — hverfur ef línu er endurparað */}
                          {l.learned_match && rows[i]?.matched === l.matched_product_number &&
                            <span className="shrink-0 text-green-600 font-bold" title="Staðfest tenging — bókuð áður út frá vörunúmeri birgja">✓</span>}
                          <div className="flex-1 min-w-0">
                            <ProductPicker value={rows[i]?.matched ?? null} valueName={rows[i]?.matchedName} onChange={(pn, name) => setRow(i, { matched: pn, matchedName: name })} />
                          </div>
                          {rows[i]?.matched
                            ? <button onClick={() => renameProduct(i)} title="Breyta heiti vörunnar" className="shrink-0 text-gray-300 hover:text-red-600 text-sm">✎</button>
                            : <button onClick={() => {
                                const packN = Number((rows[i]?.pack ?? "").replace(",", ".")) || 1;
                                const cost = Number(l.line_net) > 0 && inv > 0 ? Number(l.line_net) / (inv * packN) : 0;
                                const mLine = Number((rows[i]?.markup ?? "").replace(",", "."));
                                const mSup = Number(receipt.supplier_markup) || 0;
                                const m = mLine > 1 ? mLine : mSup > 1 ? mSup : 0;
                                const round9 = (n: number) => (n % 10 === 9 ? n : Math.floor(n / 10) * 10 + 9);
                                setNewProd({ i, name: l.description ?? "", barcode: l.gtin ?? "",
                                  price: cost > 0 && m > 0 ? String(round9(Math.round(cost * m))) : "",
                                  vat: String(Math.round(Number(l.vat_rate)) || 24) });
                              }} title="Varan er ekki til — stofna hana út frá línunni" className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-700 whitespace-nowrap">+ Ný</button>}
                        </div>
                      )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{inv}{l.unit_code ? ` ${l.unit_code}` : ""}</td>
                  <td className="px-3 py-2 text-right">
                    {booked ? <span>{l.received_qty != null ? Number(l.received_qty) : "—"}</span>
                      : <input value={rows[i]?.received ?? ""} onChange={(e) => setRow(i, { received: e.target.value.replace(/[^\d.,]/g, "") })} className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right outline-none focus:border-red-400" />}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${variance == null || variance === 0 ? "text-gray-300" : variance < 0 ? "text-red-600" : "text-amber-600"}`}>
                    {variance == null || variance === 0 ? "—" : (variance > 0 ? `+${variance}` : variance)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {booked
                      ? <span className="text-gray-500">{rows[i]?.pack || "—"}</span>
                      : <input value={rows[i]?.pack ?? ""} placeholder="1"
                          onChange={(e) => setRow(i, { pack: e.target.value.replace(/[^\d.,]/g, "") })}
                          className="w-14 border border-gray-300 rounded px-2 py-1 text-sm text-right outline-none focus:border-red-400" />}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      const packN = Number((rows[i]?.pack ?? "").replace(",", ".")) || 1;
                      const computed = Number(l.line_net) > 0 && inv > 0 ? Math.round((Number(l.line_net) / (inv * packN)) * 100) / 100 : null;
                      if (booked) return <span className="text-gray-500">{rows[i]?.cost ? rows[i].cost + " kr." : computed != null ? kr(computed) : l.unit_price ? kr(l.unit_price) : "—"}</span>;
                      return <input value={rows[i]?.cost ?? ""} placeholder={computed != null ? String(computed).replace(".", ",") : ""}
                        title="Autt = reiknast sjálfkrafa. Skrifaðu tölu til að yfirskrifa kostnað á söluvöru."
                        onChange={(e) => setRow(i, { cost: e.target.value.replace(/[^\d.,]/g, "") })}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right outline-none focus:border-red-400" />;
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {booked
                      ? <span className="text-gray-500">{rows[i]?.markup || "—"}</span>
                      : <input value={rows[i]?.markup ?? ""} placeholder="×"
                          onChange={(e) => setRow(i, { markup: e.target.value.replace(/[^\d.,]/g, "") })}
                          disabled={!rows[i]?.matched}
                          className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-right outline-none focus:border-red-400 disabled:bg-gray-50 disabled:text-gray-300" />}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {(() => {
                      // Sama forgangsröð og verðvélin: kostnaður á söluvöru → álagning
                      // (línu-innsláttur > föst álagning vöru > álagning birgis > sama álagning og var).
                      if (!rows[i]?.matched || l.matched_price == null) return <span className="text-gray-300">—</span>;
                      const cur = Number(l.matched_price) || 0;
                      const packN = Number((rows[i]?.pack ?? "").replace(",", ".")) || 1;
                      const ovr = Number((rows[i]?.cost ?? "").replace(",", "."));
                      const cost = ovr > 0 ? ovr : Number(l.line_net) > 0 && inv > 0 ? Number(l.line_net) / (inv * packN) : 0;
                      const mLine = Number((rows[i]?.markup ?? "").replace(",", "."));
                      const mProd = Number(l.matched_markup) || 0;
                      const mSup = Number(receipt.supplier_markup) || 0;
                      const oldCost = Number(l.matched_cost) || 0;
                      const mSame = oldCost > 0 && cur > 0 ? cur / oldCost : 0;
                      const m = mLine > 1 ? mLine : mProd > 1 ? mProd : mSup > 1 ? mSup : mSame > 1 && mSame < 3 ? mSame : 0;
                      const round9 = (n: number) => (n % 10 === 9 ? n : Math.floor(n / 10) * 10 + 9);
                      const next = cost > 0 && m > 0 ? round9(Math.round(cost * m)) : null;
                      const effM = cost > 0 ? (next ?? cur) / cost : 0;
                      const low = effM > 0 && effM < 1.2; // RAUTT: álagning undir ×1,20
                      return (
                        <span className={low ? "text-red-600 font-bold" : "text-gray-600"} title={effM > 0 ? `Virk álagning ×${effM.toFixed(2).replace(".", ",")}${low ? " — UNDIR ×1,20!" : ""}` : ""}>
                          {kr(cur)} → {next != null ? kr(next) : "—"}{low ? " ⚠" : ""}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={!!rows[i]?.reviewed} disabled={booked}
                      onChange={(e) => setRow(i, { reviewed: e.target.checked })}
                      className="w-5 h-5 accent-green-600 cursor-pointer" title="Farið yfir þessa línu" />
                  </td>
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

      {newProd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setNewProd(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-1">Stofna nýja vöru</h2>
            <p className="text-sm text-gray-500 mb-4">Forfyllt úr reikningslínunni — vörunúmer úthlutast sjálfkrafa.</p>
            <label className="block text-xs text-gray-500 mb-1">Heiti *</label>
            <input value={newProd.name} onChange={(e) => setNewProd((p) => p && { ...p, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 mb-3" />
            <label className="block text-xs text-gray-500 mb-1">Strikamerki</label>
            <input value={newProd.barcode} onChange={(e) => setNewProd((p) => p && { ...p, barcode: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 mb-3 font-mono" />
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className="block text-xs text-gray-500 mb-1">Söluverð m/VSK (kr.)</label>
                <input value={newProd.price} onChange={(e) => setNewProd((p) => p && { ...p, price: e.target.value.replace(/[^\d.,]/g, "") })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">VSK-þrep</label>
                <select value={newProd.vat} onChange={(e) => setNewProd((p) => p && { ...p, vat: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="24">24%</option><option value="11">11%</option><option value="0">0%</option>
                </select></div>
            </div>
            {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
            <div className="flex gap-3">
              <button onClick={createProduct} disabled={creating || !newProd.name.trim()} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">{creating ? "Stofna…" : "Stofna og tengja við línu"}</button>
              <button onClick={() => setNewProd(null)} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm">Hætta við</button>
            </div>
          </div>
        </div>
      )}

      {err && !newProd && <p className="text-sm text-red-600 mt-4">{err}</p>}
      {ok && <p className="text-sm text-green-700 mt-4">{ok}</p>}

      {!booked && (
        <div className="mt-5 flex items-center gap-3">
          <button onClick={() => save(true)} disabled={busy} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
            {busy ? "Vinn…" : receipt.book_invoice === false ? "Staðfesta móttöku (birgðir + verð)" : "Staðfesta móttöku og bóka"}
          </button>
          <button onClick={() => save(false)} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50">Vista drög</button>
          <span className="text-xs text-gray-400">
            {autoState === "saving" ? "vistast sjálfkrafa…" : autoState === "saved" ? "✓ vistað sjálfkrafa" : ""}
          </span>
          <button onClick={discard} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-red-600 hover:border-red-200 disabled:opacity-50">Henda móttöku</button>
          <Link href="/bokhald/solukerfi/innkaup/mottaka" className="text-sm text-gray-500 hover:text-gray-800">← Til baka</Link>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-4">
        {receipt.book_invoice === false
          ? "Reikningurinn er ÞEGAR bókaður (pósthólfið) — staðfesting uppfærir aðeins birgðir eftir mótteknu magni og verð eftir álagningu."
          : "Birgðir uppfærast eftir MÓTTEKNU magni; bókhaldið bókast skv. reikningnum. Frávik (vantar/umfram) má gera kröfu á birgi um."}
      </p>
    </div>
  );
}
