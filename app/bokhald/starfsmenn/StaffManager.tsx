"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_LABEL, type Role, type StaffRow } from "@/lib/roles";

const inp = "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400";

export default function StaffManager({ staff }: { staff: StaffRow[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("afgreidsla");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!email || !password) { setError("Vantar netfang og lykilorð"); return; }
    setBusy(true); setError(""); setOk("");
    const r = await fetch("/api/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, name, password, role }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setError(d.error ?? "Mistókst"); return; }
    setOk("Starfsmanni bætt við"); setEmail(""); setName(""); setPassword("");
    router.refresh();
  }
  async function update(targetEmail: string, patch: { role?: Role; is_active?: boolean }) {
    await fetch("/api/staff", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: targetEmail, ...patch }) });
    router.refresh();
  }
  async function resetPassword(targetEmail: string) {
    const pw = prompt(`Nýtt lykilorð fyrir ${targetEmail} (a.m.k. 8 stafir):`);
    if (!pw) return;
    const r = await fetch("/api/staff", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: targetEmail, password: pw }) });
    const d = await r.json();
    alert(r.ok ? `Lykilorð uppfært fyrir ${targetEmail}. Láttu starfsmanninn vita.` : (d.error ?? "Mistókst"));
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Nýr starfsmaður</p>
        <div className="grid md:grid-cols-4 gap-3 mb-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Netfang *" className={inp} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nafn" className={inp} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Lykilorð *" className={inp} />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={`${inp} bg-white`}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={add} disabled={busy} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
            {busy ? "Bæti við…" : "Bæta við"}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
          {ok && <span className="text-sm text-green-700">✓ {ok}</span>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Netfang</th>
              <th className="px-4 py-2 font-medium">Nafn</th>
              <th className="px-4 py-2 font-medium">Hlutverk</th>
              <th className="px-4 py-2 font-medium">Virkur</th>
              <th className="px-4 py-2 font-medium">Lykilorð</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((m) => (
              <tr key={m.email} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono text-gray-700">{m.email}</td>
                <td className="px-4 py-2">{m.name ?? "—"}</td>
                <td className="px-4 py-2">
                  <select value={m.role} onChange={(e) => update(m.email, { role: e.target.value as Role })} className={`${inp} bg-white py-1`}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input type="checkbox" checked={m.is_active} onChange={(e) => update(m.email, { is_active: e.target.checked })} className="w-4 h-4 accent-red-600" />
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => resetPassword(m.email)} className="text-xs text-red-600 hover:text-red-800 hover:underline">Endurstilla</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
