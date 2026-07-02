"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { CustomerRow } from "@/lib/accounting-queries";

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="block text-sm text-gray-500 mb-1">{label}</span>{children}</label>;
}

export default function CustomerForm({ customer }: { customer?: CustomerRow | null }) {
  const router = useRouter();
  const editing = !!customer;
  const [f, setF] = useState({
    name: customer?.name ?? "", kennitala: customer?.kennitala ?? "", customer_number: customer?.customer_number ?? "",
    address: customer?.address ?? "", postal_code: customer?.postal_code ?? "", city: customer?.city ?? "",
    phone: customer?.phone ?? "", email: customer?.email ?? "",
    payment_terms_days: String(customer?.payment_terms_days ?? 0),
    is_account: customer?.is_account ?? false, is_active: customer?.is_active ?? true,
    rafraen_vidskipti: customer?.rafraen_vidskipti ?? false,
    billing_mode: customer?.billing_mode === "per_trip" ? "per_trip" : "consolidated",
  });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!f.name.trim()) { setError("Vantar nafn"); return; }
    setSaving(true); setError("");
    const res = await fetch(editing ? `/api/customers/${customer!.id}` : `/api/customers`, {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...f, payment_terms_days: Number(f.payment_terms_days) || 0 }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(d.error ?? "Vistun mistókst"); return; }
    router.push("/bokhald/solukerfi/vidskiptamenn");
    router.refresh();
  }

  async function moveToSupplier() {
    if (!customer) return;
    if (!confirm(`Færa „${customer.name}" yfir í lánadrottna? Aðilinn hverfur úr viðskiptamannalista (færslusaga varðveitist).`)) return;
    setMoving(true); setError("");
    const res = await fetch(`/api/customers/${customer.id}/move-to-supplier`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setMoving(false);
    if (!res.ok) { setError(d.error ?? "Færsla mistókst"); return; }
    router.push("/bokhald/solukerfi/birgjar");
    router.refresh();
  }

  return (
    <div className="space-y-4 max-w-3xl pb-24">
      <div className="bg-white border border-gray-200 rounded-xl p-5 grid md:grid-cols-2 gap-4">
        <Field label="Nafn *"><input value={f.name} onChange={(e) => set("name", e.target.value)} className={inp} /></Field>
        <Field label="Kennitala"><input value={f.kennitala} onChange={(e) => set("kennitala", e.target.value)} className={inp} /></Field>
        <Field label="Viðskiptamannanúmer"><input value={f.customer_number} onChange={(e) => set("customer_number", e.target.value)} className={inp} /></Field>
        <Field label="Sími"><input value={f.phone} onChange={(e) => set("phone", e.target.value)} className={inp} /></Field>
        <Field label="Netfang"><input value={f.email} onChange={(e) => set("email", e.target.value)} className={inp} /></Field>
        <Field label="Heimilisfang"><input value={f.address} onChange={(e) => set("address", e.target.value)} className={inp} /></Field>
        <Field label="Póstnúmer"><input value={f.postal_code} onChange={(e) => set("postal_code", e.target.value)} className={inp} /></Field>
        <Field label="Staður"><input value={f.city} onChange={(e) => set("city", e.target.value)} className={inp} /></Field>
        <Field label="Greiðslufrestur (dagar)"><input type="number" value={f.payment_terms_days} onChange={(e) => set("payment_terms_days", e.target.value)} className={inp} /></Field>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={f.is_account} onChange={(e) => set("is_account", e.target.checked)} className="w-4 h-4 accent-red-600" />
          Reikningsviðskipti leyfð (má kaupa á reikning)
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} className="w-4 h-4 accent-red-600" />
          Virkur viðskiptamaður
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={f.rafraen_vidskipti} onChange={(e) => set("rafraen_vidskipti", e.target.checked)} className="w-4 h-4 accent-red-600" />
          Rafræn viðskipti (fær rafræna reikninga gegnum inExchange)
        </label>
        {f.rafraen_vidskipti && !f.kennitala.trim() && (
          <p className="text-xs text-amber-600 pl-6">Kennitölu vantar — hún þarf að vera skráð til að senda rafræna reikninga.</p>
        )}
        <div className="pt-3 border-t border-gray-100">
          <span className="block text-sm text-gray-500 mb-1">Reikningsmáti (reikningsviðskipti)</span>
          <select value={f.billing_mode} onChange={(e) => set("billing_mode", e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400">
            <option value="consolidated">Safna saman — einn reikningur í lok mánaðar</option>
            <option value="per_trip">Hver verslun — reikningur og krafa strax</option>
          </select>
        </div>
      </div>

      <div className="fixed bottom-0 left-60 right-0 bg-white/90 backdrop-blur border-t border-gray-200 px-8 py-3 flex items-center gap-4">
        <button onClick={save} disabled={saving || moving} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
          {saving ? "Vista…" : editing ? "Vista breytingar" : "Stofna viðskiptamann"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
        {editing && !customer?.is_generic && (
          <button onClick={moveToSupplier} disabled={moving || saving}
            className="ml-auto px-4 py-2 rounded-lg border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50">
            {moving ? "Færi…" : "Færa í lánadrottna →"}
          </button>
        )}
      </div>
    </div>
  );
}
