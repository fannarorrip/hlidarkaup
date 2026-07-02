"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Profile {
  id: string; code: string; name: string; settlement_iban: string | null; settlement_ledger: string | null;
  claim_type: string; interest_rule: string | null; notify_fee_paper: number; notify_fee_paperless: number;
  late_fee: number; dunning: boolean; dunning_count: number; to_collection_days: number | null;
  print_mode: string; is_default: boolean; is_active: boolean;
}
interface Settings { kennitala_krofuhafa: string | null; agreement_signed: boolean; agreement_note: string | null }
interface BankAcct { account_number: string; name: string }

const blank: Partial<Profile> = { code: "", name: "", claim_type: "krafa", print_mode: "rb", is_default: false, is_active: true, dunning: false };

export default function CollectionProfiles({ profiles, settings, bankAccounts }: { profiles: Profile[]; settings: Settings; bankAccounts: BankAcct[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<Profile> | null>(null);
  const [set, setSet] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Re-sync local settings state to server props after router.refresh() (server normalises kennitala).
  useEffect(() => setSet(settings), [settings]);

  async function api(body: Record<string, unknown>) {
    const r = await fetch("/api/bankatenging/collection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  }

  async function saveSettings() {
    setBusy(true); setErr(""); setMsg("");
    const d = await api({ action: "saveSettings", settings: set });
    setBusy(false);
    if (!d.ok) { setErr(d.message || "Villa"); return; }
    setMsg("Stillingar vistaðar."); router.refresh();
  }

  async function saveProfile() {
    if (!edit) return;
    setBusy(true); setErr(""); setMsg("");
    const d = await api({ action: "saveProfile", profile: edit });
    setBusy(false);
    if (!d.ok) { setErr(d.message || "Villa"); return; }
    setMsg("Kröfusnið vistað."); setEdit(null); router.refresh();
  }

  async function del(id: string) {
    if (!window.confirm("Eyða þessu kröfusniði?")) return;
    setBusy(true); setErr(""); setMsg("");
    const d = await api({ action: "deleteProfile", id });
    setBusy(false);
    if (!d.ok) { setErr(d.message || "Villa"); return; }
    setMsg("Kröfusnið eytt."); router.refresh();
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="max-w-3xl space-y-4">
      {/* Agreement / settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="font-semibold text-sm mb-1">Innheimtusamningur</p>
        <p className="text-xs text-gray-500 mb-3">Grunnstaða innheimtu. Kröfur er ekki hægt að senda fyrr en samningur er kominn og kröfusnið skráð.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Kennitala kröfuhafa</label>
            <input value={set.kennitala_krofuhafa || ""} onChange={(e) => setSet({ ...set, kennitala_krofuhafa: e.target.value })} className="w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm tabular-nums" placeholder="6507250420" />
          </div>
          <label className="flex items-center gap-2 text-sm pb-1.5">
            <input type="checkbox" checked={set.agreement_signed} onChange={(e) => setSet({ ...set, agreement_signed: e.target.checked })} /> Samningur undirritaður
          </label>
          <button onClick={saveSettings} disabled={busy} className="px-4 py-1.5 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-40">Vista</button>
        </div>
      </div>

      {/* Profiles */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-sm">Kröfusnið (innheimtuauðkenni)</p>
          <button onClick={() => setEdit({ ...blank })} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">+ Nýtt kröfusnið</button>
        </div>

        {err && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">✗ {err}</div>}
        {msg && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700">{msg}</div>}

        {profiles.length === 0 && !edit && <p className="text-sm text-gray-400">Ekkert kröfusnið skráð enn. Bættu við því sem Arion úthlutar þér.</p>}

        {profiles.length > 0 && (
          <table className="w-full text-sm mb-3">
            <thead className="text-gray-400 text-left text-xs"><tr><th className="py-1 font-medium">Kóði</th><th className="py-1 font-medium">Heiti</th><th className="py-1 font-medium">Ráðstöfun</th><th className="py-1 font-medium"></th></tr></thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="py-1.5 font-mono">{p.code}{p.is_default && <span className="ml-1 text-[10px] text-green-700">sjálfgefið</span>}{!p.is_active && <span className="ml-1 text-[10px] text-gray-400">óvirkt</span>}</td>
                  <td className="py-1.5">{p.name}</td>
                  <td className="py-1.5 text-gray-500">{p.settlement_ledger || "—"}{p.settlement_iban ? ` · ${p.settlement_iban}` : ""}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => setEdit(p)} className="text-xs text-red-700 hover:underline mr-3">Breyta</button>
                    <button onClick={() => del(p.id)} disabled={busy} className="text-xs text-gray-400 hover:text-red-700 disabled:opacity-40">Eyða</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {edit && (
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 mt-2 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-[11px] text-gray-500 mb-0.5">Kröfusnið (kóði)</label><input value={edit.code || ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="t.d. 001" /></div>
              <div><label className="block text-[11px] text-gray-500 mb-0.5">Heiti</label><input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Almenn innheimta" /></div>
              <div><label className="block text-[11px] text-gray-500 mb-0.5">Ráðstöfunarreikningur (IBAN)</label><input value={edit.settlement_iban || ""} onChange={(e) => setEdit({ ...edit, settlement_iban: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="ISxx…" /></div>
              <div><label className="block text-[11px] text-gray-500 mb-0.5">Bankalykill (bókhald)</label>
                <select value={edit.settlement_ledger || ""} onChange={(e) => setEdit({ ...edit, settlement_ledger: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  <option value="">— veldu —</option>
                  {bankAccounts.map((b) => <option key={b.account_number} value={b.account_number}>{b.account_number} · {b.name}</option>)}
                </select>
              </div>
              <div><label className="block text-[11px] text-gray-500 mb-0.5">Tilkynningagjald (pappír)</label><input type="number" value={edit.notify_fee_paper ?? 0} onChange={(e) => setEdit({ ...edit, notify_fee_paper: num(e.target.value) })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm tabular-nums" /></div>
              <div><label className="block text-[11px] text-gray-500 mb-0.5">Tilkynningagjald (rafrænt)</label><input type="number" value={edit.notify_fee_paperless ?? 0} onChange={(e) => setEdit({ ...edit, notify_fee_paperless: num(e.target.value) })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm tabular-nums" /></div>
              <div><label className="block text-[11px] text-gray-500 mb-0.5">Vanskilagjald</label><input type="number" value={edit.late_fee ?? 0} onChange={(e) => setEdit({ ...edit, late_fee: num(e.target.value) })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm tabular-nums" /></div>
              <div><label className="block text-[11px] text-gray-500 mb-0.5">Í milliinnheimtu eftir (daga)</label><input type="number" value={edit.to_collection_days ?? ""} onChange={(e) => setEdit({ ...edit, to_collection_days: e.target.value === "" ? null : num(e.target.value) })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm tabular-nums" placeholder="tómt = aldrei" /></div>
              <div><label className="block text-[11px] text-gray-500 mb-0.5">Prentun</label>
                <select value={edit.print_mode || "rb"} onChange={(e) => setEdit({ ...edit, print_mode: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  <option value="rb">RB prentar + póstar</option><option value="self">Við prentum sjálf</option><option value="electronic">Rafrænt í netbanka</option>
                </select>
              </div>
              <div><label className="block text-[11px] text-gray-500 mb-0.5">Tegund</label>
                <select value={edit.claim_type || "krafa"} onChange={(e) => setEdit({ ...edit, claim_type: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  <option value="krafa">Venjuleg krafa</option><option value="valgreidsla">Valgreiðslukrafa</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!edit.dunning} onChange={(e) => setEdit({ ...edit, dunning: e.target.checked })} /> Ítrekanir</label>
              {edit.dunning && (
                <label className="flex items-center gap-1.5 text-xs text-gray-500">fjöldi
                  <input type="number" min={0} value={edit.dunning_count ?? 0} onChange={(e) => setEdit({ ...edit, dunning_count: e.target.value === "" ? 0 : Number(e.target.value) })} className="w-16 border border-gray-300 rounded px-2 py-1 text-xs tabular-nums" />
                </label>
              )}
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!edit.is_default} onChange={(e) => setEdit({ ...edit, is_default: e.target.checked })} /> Sjálfgefið</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Virkt</label>
            </div>
            <div className="flex gap-2">
              <button onClick={saveProfile} disabled={busy} className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">Vista kröfusnið</button>
              <button onClick={() => setEdit(null)} className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Hætta við</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
