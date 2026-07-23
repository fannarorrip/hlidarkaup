"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { kr } from "@/lib/format";

interface Customer { id: string; name: string; kennitala: string | null; is_account: boolean }
interface Line { description: string; quantity: string; unitPrice: string; vatRate: number }
interface ProdHit { id: string; name: string; price: number; vatPct: number }
interface Booked { voucherId: string; invoiceNumber: string; claimQueued: boolean; customer: { rafraen: boolean; email: string | null; hasKennitala: boolean; name: string } }
type Sent = "" | "einvoice" | "email" | "none";

const inp = "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400";
const blankLine = (): Line => ({ description: "", quantity: "1", unitPrice: "", vatRate: 24 });
const lineGross = (l: Line) => Math.max(0, Math.round((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)));

export default function NyrReikningur() {
  const [cust, setCust] = useState<Customer | null>(null);
  const [custQuery, setCustQuery] = useState("");
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<Booked | null>(null);
  const [deliverMsg, setDeliverMsg] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [sent, setSent] = useState<Sent>("");
  // Per-line product search — picking a catalog product just PREFILLS the line (name/price/vat).
  // Typing freely keeps a custom line; nothing here creates or saves a product.
  const [search, setSearch] = useState<{ i: number; hits: ProdHit[] } | null>(null);

  const total = useMemo(() => lines.reduce((a, l) => a + lineGross(l), 0), [lines]);
  const vatOf = (rate: number) => lines.filter((l) => l.vatRate === rate).reduce((a, l) => { const g = lineGross(l); return a + (g - Math.round((g * 100) / (100 + rate))); }, 0);

  async function searchCust(q: string) {
    setCustQuery(q); setCust(null);
    if (q.trim().length < 2) { setCustResults([]); return; }
    const r = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    setCustResults(d.customers ?? []);
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((p) => [...p, blankLine()]);
  const removeLine = (i: number) => setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  async function onDescChange(i: number, v: string) {
    setLine(i, { description: v });
    if (v.trim().length < 2) { setSearch(null); return; }
    const r = await fetch(`/api/kassi/search?q=${encodeURIComponent(v.trim())}`).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    const hits: ProdHit[] = (d.products ?? []).slice(0, 8);
    setSearch(hits.length ? { i, hits } : null);
  }
  function pickProduct(i: number, p: ProdHit) {
    // Prefill from catalog; it becomes an ordinary invoice line (no product link, no stock move).
    setLine(i, { description: p.name, unitPrice: String(Math.round(p.price)), vatRate: p.vatPct });
    setSearch(null);
  }

  async function book() {
    setError("");
    if (!cust) { setError("Veldu viðskiptamann."); return; }
    const payload = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
      .map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), vatRate: l.vatRate }));
    if (!payload.length) { setError("Bættu við a.m.k. einni gildri línu."); return; }
    setBusy(true);
    const r = await fetch("/api/reikningur/create", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId: cust.id, lines: payload, reference, description }),
    });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setError(d.error ?? "Bókun mistókst"); return; }
    setBooked(d);
    setEmailTo(d.customer?.email ?? "");
  }

  async function sendEinvoice() {
    if (!booked) return;
    setBusy(true); setDeliverMsg("");
    // force: this is a per-invoice choice, independent of the customer's saved rafræn-setting.
    const r = await fetch(`/api/einvoice/${booked.voucherId}/send`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: true }),
    });
    const d = await r.json(); setBusy(false);
    if (r.ok && d.ok) { setSent("einvoice"); setDeliverMsg("✓ Rafrænn reikningur sendur (inExchange)."); }
    else setDeliverMsg(`Villa: ${d.error ?? "sending mistókst"}`);
  }
  async function sendEmail() {
    if (!booked) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) { setDeliverMsg("Sláðu inn gilt netfang."); return; }
    setBusy(true); setDeliverMsg("");
    const r = await fetch(`/api/reikningur/${booked.voucherId}/email`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: emailTo }),
    });
    const d = await r.json(); setBusy(false);
    if (r.ok && d.ok) { setSent("email"); setDeliverMsg(`✓ Reikningur sendur í tölvupósti á ${emailTo}.`); }
    else setDeliverMsg(`Villa: ${d.error ?? "sending mistókst"}`);
  }

  // ---- Booked: delivery step ----
  if (booked) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Reikningur bókaður</h1>
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-5 text-sm text-green-900">
          Reikningur <b>{booked.invoiceNumber}</b> bókaður á {booked.customer.name}.
          {booked.claimQueued ? " Krafa stofnuð (fer í bankann þegar kröfusending er keyrð)." : " (Krafa var ekki stofnuð — sjá kröfustillingar.)"}
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Hvernig viltu senda reikninginn?</p>
        <p className="text-xs text-gray-500 mb-3">Þetta er val fyrir þennan reikning — óháð stillingum viðskiptamannsins.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className={`border rounded-xl p-4 ${sent === "einvoice" ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
            <p className="font-semibold text-sm mb-1">Rafrænt (inExchange)</p>
            <p className="text-xs text-gray-500 mb-3">{booked.customer.hasKennitala ? "Sent sem rafrænn reikningur." : "⚠︎ Kennitölu vantar — rafræn sending ekki möguleg."}</p>
            <button onClick={sendEinvoice} disabled={busy || !booked.customer.hasKennitala || sent === "einvoice"} className="w-full px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">{sent === "einvoice" ? "✓ Sent" : "Senda rafrænt"}</button>
          </div>
          <div className={`border rounded-xl p-4 ${sent === "email" ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
            <p className="font-semibold text-sm mb-1">PDF í tölvupósti</p>
            <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="netfang@..." className={`${inp} w-full mb-2`} />
            <button onClick={sendEmail} disabled={busy} className="w-full px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-50">Senda PDF</button>
          </div>
          <div className={`border rounded-xl p-4 ${sent === "none" ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
            <p className="font-semibold text-sm mb-1">Ekki senda</p>
            <p className="text-xs text-gray-500 mb-3">Bara bóka — sendu handvirkt síðar af reikningnum.</p>
            <button onClick={() => { setSent("none"); setDeliverMsg("Reikningur bókaður án sendingar."); }} disabled={busy} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">Sleppa sendingu</button>
          </div>
        </div>
        {deliverMsg && <p className="text-sm mt-4 font-medium text-gray-700">{deliverMsg}</p>}
        <div className="flex gap-4 mt-6 text-sm">
          <Link href={`/bokhald/solukerfi/reikningar/${booked.voucherId}`} className="text-red-700 hover:underline">Skoða reikning →</Link>
          <a href={`/api/reikningur/${booked.voucherId}/pdf`} target="_blank" rel="noopener" className="text-red-700 hover:underline">PDF</a>
          <a href="/bokhald/solukerfi/reikningar/nyr" className="text-gray-500 hover:underline">Nýr reikningur</a>
        </div>
      </div>
    );
  }

  // ---- Build step ----
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Búa til reikning</h1>
      <p className="text-sm text-gray-500 mb-5">Handvirkur sölureikningur á reikning. Við bókun stofnast krafa og þú velur sendingu.</p>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Viðskiptamaður</p>
        {cust ? (
          <div className="flex items-center gap-3">
            <span className="font-medium">{cust.name}</span>
            {cust.kennitala && <span className="font-mono text-xs text-gray-500">{cust.kennitala}</span>}
            <button onClick={() => { setCust(null); setCustQuery(""); }} className="text-xs text-red-600 hover:underline ml-auto">Breyta</button>
          </div>
        ) : (
          <div className="relative">
            <input value={custQuery} onChange={(e) => searchCust(e.target.value)} placeholder="Leita eftir nafni eða kennitölu…" className={`${inp} w-full`} />
            {custResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                {custResults.map((c) => (
                  <button key={c.id} onClick={() => { setCust(c); setCustResults([]); }} disabled={!c.is_account}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-40 flex justify-between">
                    <span>{c.name}{!c.is_account && " (má ekki á reikning)"}</span>
                    <span className="font-mono text-xs text-gray-400">{c.kennitala}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-3 py-2 font-medium">Lýsing</th><th className="px-3 py-2 font-medium w-20">Magn</th><th className="px-3 py-2 font-medium w-28">Verð (m/VSK)</th><th className="px-3 py-2 font-medium w-20">VSK</th><th className="px-3 py-2 font-medium w-28 text-right">Samtals</th><th className="w-8"></th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-1.5 relative">
                  <input value={l.description} onChange={(e) => onDescChange(i, e.target.value)} onFocus={() => onDescChange(i, l.description)} onBlur={() => setTimeout(() => setSearch((s) => (s?.i === i ? null : s)), 150)} placeholder="Leita að vöru eða skrifa frjálst…" className={`${inp} w-full`} />
                  {search?.i === i && (
                    <div className="absolute z-20 left-3 right-3 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {search.hits.map((p) => (
                        <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickProduct(i, p); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex justify-between gap-3">
                          <span className="truncate">{p.name}</span>
                          <span className="text-gray-400 whitespace-nowrap">{kr(p.price)} · {p.vatPct}%</span>
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-1.5"><input value={l.quantity} inputMode="decimal" onChange={(e) => setLine(i, { quantity: e.target.value.replace(/[^\d.,]/g, "") })} className={`${inp} w-full text-right`} /></td>
                <td className="px-3 py-1.5"><input value={l.unitPrice} inputMode="numeric" onChange={(e) => setLine(i, { unitPrice: e.target.value.replace(/\D/g, "") })} className={`${inp} w-full text-right`} /></td>
                <td className="px-3 py-1.5">
                  <select value={l.vatRate} onChange={(e) => setLine(i, { vatRate: Number(e.target.value) })} className={`${inp} w-full bg-white`}>
                    <option value={24}>24%</option><option value={11}>11%</option><option value={0}>0%</option>
                  </select>
                </td>
                <td className="px-3 py-1.5 text-right font-medium">{kr(lineGross(l))}</td>
                <td className="px-1 text-center"><button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-600" title="Eyða línu">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t border-gray-100"><button onClick={addLine} className="text-sm text-red-600 hover:underline">+ Bæta við línu</button></div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Tilvísun (valfrjálst)" className={inp} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Lýsing á reikningi (valfrjálst)" className={inp} />
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4 text-sm flex flex-wrap gap-x-8 gap-y-1 justify-end font-mono">
        {[24, 11].map((r) => vatOf(r) > 0 && <span key={r}>VSK {r}%: <b>{kr(vatOf(r))}</b></span>)}
        <span>Samtals: <b className="text-base">{kr(total)}</b></span>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="flex items-center gap-4">
        <button onClick={book} disabled={busy || !cust || total <= 0} className="px-6 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-40">{busy ? "Bóka…" : "Bóka reikning"}</button>
        <Link href="/bokhald/solukerfi/reikningar" className="text-sm text-gray-500 hover:underline">Hætta við</Link>
      </div>
    </div>
  );
}
