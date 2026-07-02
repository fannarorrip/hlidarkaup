"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import SupplierPicker from "../../SupplierPicker";

interface Acct { account_number: string; name: string; account_type: string; }
interface Bank { account_number: string; name: string; }
interface Line { account: string; net: string; vatRate: string; }

const inp = "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400";
const kr = (n: number) => Math.round(n).toLocaleString("is-IS") + " kr.";

export default function PurchaseForm({ accounts, banks }: { accounts: Acct[]; banks: Bank[] }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [invNo, setInvNo] = useState("");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<Line[]>([{ account: "2100", net: "", vatRate: "24" }]);
  const [payment, setPayment] = useState<"credit" | "paid">("credit");
  const [payAccount, setPayAccount] = useState(banks[0]?.account_number ?? "7850");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const setLine = (i: number, k: keyof Line, v: string) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((p) => [...p, { account: "2100", net: "", vatRate: "24" }]);
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i));

  const t = lines.reduce((a, l) => {
    const net = Number(l.net) || 0;
    const vat = Number(l.vatRate) > 0 ? Math.round((net * Number(l.vatRate)) / 100) : 0;
    a.net += net; a.vat += vat; a.gross += net + vat; return a;
  }, { net: 0, vat: 0, gross: 0 });

  async function save() {
    if (!supplier.trim()) { setError("Vantar birgja"); return; }
    setSaving(true); setError(""); setOk("");
    const r = await fetch("/api/purchases", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        supplierName: supplier, supplierId, supplierInvoiceNo: invNo, date: date || undefined,
        payment, payAccount,
        lines: lines.map((l) => ({ account: l.account, net: Number(l.net) || 0, vatRate: Number(l.vatRate) })),
      }),
    });
    const d = await r.json(); setSaving(false);
    if (!r.ok) { setError(d.error ?? "Villa við að skrá innkaup"); return; }
    setOk(d.invoiceNumber); setSupplier(""); setSupplierId(null); setPickerKey((k) => k + 1); setInvNo(""); setDate(""); setLines([{ account: "2100", net: "", vatRate: "24" }]);
    router.refresh();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Nýtt innkaup</p>

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">Birgir *</label>
        <SupplierPicker key={pickerKey} onChange={(id, name) => { setSupplierId(id); setSupplier(name || ""); }} />
      </div>
      <div className="grid md:grid-cols-2 gap-3 mb-4 max-w-md">
        <input value={invNo} onChange={(e) => setInvNo(e.target.value)} placeholder="Reikningsnúmer birgja" className={inp} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
      </div>

      <div className="space-y-2 mb-3">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_8rem_6rem_2rem] gap-2 items-center">
            <select value={l.account} onChange={(e) => setLine(i, "account", e.target.value)} className={`${inp} bg-white`}>
              {accounts.map((a) => <option key={a.account_number} value={a.account_number}>{a.account_number} — {a.name}</option>)}
            </select>
            <input type="number" value={l.net} onChange={(e) => setLine(i, "net", e.target.value)} placeholder="Upphæð án vsk" className={inp} />
            <select value={l.vatRate} onChange={(e) => setLine(i, "vatRate", e.target.value)} className={`${inp} bg-white`}>
              <option value="24">24%</option><option value="11">11%</option><option value="0">0%</option>
            </select>
            <button onClick={() => removeLine(i)} disabled={lines.length === 1} className="text-gray-300 hover:text-red-600 text-lg disabled:opacity-30">×</button>
          </div>
        ))}
      </div>
      <button onClick={addLine} className="text-sm text-red-700 hover:underline mb-4">+ Bæta við línu</button>

      <div className="flex flex-wrap items-center gap-4 mb-4 border-t border-gray-100 pt-4">
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={payment === "credit"} onChange={() => setPayment("credit")} className="accent-red-600" /> Á reikning (lánadrottnar)</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={payment === "paid"} onChange={() => setPayment("paid")} className="accent-red-600" /> Greitt</label>
        {payment === "paid" && (
          <select value={payAccount} onChange={(e) => setPayAccount(e.target.value)} className={`${inp} bg-white`}>
            {banks.map((b) => <option key={b.account_number} value={b.account_number}>{b.account_number} — {b.name}</option>)}
          </select>
        )}
      </div>

      <div className="flex items-end justify-between border-t border-gray-100 pt-4">
        <div className="text-sm text-gray-500">
          <p>Án vsk: <span className="font-medium text-gray-800">{kr(t.net)}</span></p>
          <p>Innskattur: <span className="font-medium text-gray-800">{kr(t.vat)}</span></p>
          <p className="text-base text-gray-900 mt-1">Samtals: <span className="font-bold">{kr(t.gross)}</span></p>
        </div>
        <div className="text-right">
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          {ok && <p className="text-sm text-green-700 mb-2">✓ Skráð: {ok}</p>}
          <button onClick={save} disabled={saving || t.gross <= 0} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">
            {saving ? "Skrái…" : "Skrá innkaup"}
          </button>
        </div>
      </div>
    </div>
  );
}
