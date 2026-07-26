"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400";

export default function NyVara() {
  const router = useRouter();
  const [f, setF] = useState({
    product_number: "", name: "", barcode: "", price_gross: "", vat_rate: "24",
    product_group: "", stock_quantity: "0", use_scale: false, is_stock_controlled: true,
  });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Prefill the next free product number (6-digit running sequence) — editable if needed.
  useEffect(() => {
    fetch("/api/products/next-number").then((r) => r.json())
      .then((d) => { if (d.next) setF((p) => (p.product_number ? p : { ...p, product_number: d.next })); })
      .catch(() => {});
  }, []);

  const gross = Number(f.price_gross) || 0;
  const vat = Number(f.vat_rate);
  const net = gross / (1 + vat / 100);

  async function create() {
    if (!f.name.trim()) { setError("Heiti er skylda."); return; } // vörunúmer úthlutast sjálfkrafa ef tómt
    setSaving(true); setError("");
    const r = await fetch("/api/products", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...f, price_gross: gross, vat_rate: vat, stock_quantity: Number(f.stock_quantity) || 0 }),
    });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setError(d.error ?? "Stofnun mistókst"); return; }
    router.push(`/bokhald/solukerfi/vorur/${encodeURIComponent(d.product_number)}`); // fulli ritillinn: mynd, innihald, fleiri strikamerki
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Búa til nýja vöru</h1>
      <p className="text-sm text-gray-500 mb-5">Grunnupplýsingar — eftir stofnun opnast fulli ritillinn (mynd, innihald, fleiri strikamerki).</p>

      <div className="bg-white border border-gray-200 rounded-xl p-5 grid md:grid-cols-2 gap-4">
        <label className="block"><span className="block text-sm text-gray-500 mb-1">Vörunúmer (sjálfvirkt næsta)</span>
          <input value={f.product_number} onChange={(e) => set("product_number", e.target.value)} placeholder="úthlutast sjálfkrafa…" className={inp} /></label>
        <label className="block"><span className="block text-sm text-gray-500 mb-1">Heiti *</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inp} /></label>
        <label className="block"><span className="block text-sm text-gray-500 mb-1">Strikamerki (valfrjálst)</span>
          <input value={f.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="Skannaðu eða sláðu inn…" className={inp} /></label>
        <label className="block"><span className="block text-sm text-gray-500 mb-1">Vöruflokkur</span>
          <input value={f.product_group} onChange={(e) => set("product_group", e.target.value)} placeholder="—" className={inp} /></label>
        <label className="block"><span className="block text-sm text-gray-500 mb-1">Söluverð m/VSK (kr.)</span>
          <input type="number" value={f.price_gross} onChange={(e) => set("price_gross", e.target.value)} className={inp} /></label>
        <label className="block"><span className="block text-sm text-gray-500 mb-1">VSK þrep</span>
          <select value={f.vat_rate} onChange={(e) => set("vat_rate", e.target.value)} className={`${inp} bg-white`}>
            <option value="24">24%</option><option value="11">11%</option><option value="0">0% / undanþegið</option>
          </select></label>
        <label className="block"><span className="block text-sm text-gray-500 mb-1">Birgðastaða (stk.)</span>
          <input type="number" value={f.stock_quantity} onChange={(e) => set("stock_quantity", e.target.value)} className={inp} /></label>
        <div className="text-sm text-gray-500 self-end pb-2">
          {gross > 0 && <p>Án VSK: <b className="text-gray-700">{Math.round(net)} kr.</b> · VSK: <b className="text-gray-700">{Math.round(gross - net)} kr.</b></p>}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={f.use_scale} onChange={(e) => set("use_scale", e.target.checked)} className="w-4 h-4 accent-red-600" />
          Vigtarvara (vog)
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={f.is_stock_controlled} onChange={(e) => set("is_stock_controlled", e.target.checked)} className="w-4 h-4 accent-red-600" />
          Birgðastýring virk
        </label>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      <div className="flex items-center gap-4 mt-4">
        <button onClick={create} disabled={saving} className="px-5 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">
          {saving ? "Stofna…" : "Stofna vöru"}
        </button>
        <Link href="/bokhald/solukerfi/vorur" className="text-sm text-gray-500 hover:underline">Hætta við</Link>
      </div>
    </div>
  );
}
