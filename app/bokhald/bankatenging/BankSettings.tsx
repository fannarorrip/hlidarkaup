"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Settings {
  card_liability_account: string; card_expense_account: string | null; default_bank_ledger: string | null;
  statement_contra_in: string | null; statement_contra_out: string | null; auto_sync: boolean;
}
interface Acct { account_number: string; name: string }

export default function BankSettings({ settings, accounts, envStatus }: {
  settings: Settings; accounts: Acct[];
  envStatus: { sandbox: boolean; baseUrl: string; hasCards: boolean; hasPsd2: boolean };
}) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => setS(settings), [settings]);

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/bankatenging/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings: s }) });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      setMsg("Samstillingar vistaðar."); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  const opts = (v: string | null, onChange: (v: string) => void, allowEmpty = true) => (
    <select value={v || ""} onChange={(e) => onChange(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
      {allowEmpty && <option value="">— ekkert —</option>}
      {accounts.map((a) => <option key={a.account_number} value={a.account_number}>{a.account_number} · {a.name}</option>)}
    </select>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="font-semibold text-sm mb-1">Sjálfgefnir lyklar</p>
        <p className="text-xs text-gray-500 mb-4">Notaðir sem sjálfgefin gildi við bókun korta- og bankafærslna og greiðslu reikninga.</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-[11px] text-gray-500 mb-0.5">Skuldalykill korta (kredit)</label>{opts(s.card_liability_account, (v) => setS({ ...s, card_liability_account: v }), false)}</div>
          <div><label className="block text-[11px] text-gray-500 mb-0.5">Sjálfgefinn gjaldalykill korta</label>{opts(s.card_expense_account, (v) => setS({ ...s, card_expense_account: v }))}</div>
          <div><label className="block text-[11px] text-gray-500 mb-0.5">Aðal bankalykill</label>{opts(s.default_bank_ledger, (v) => setS({ ...s, default_bank_ledger: v }))}</div>
          <div></div>
          <div><label className="block text-[11px] text-gray-500 mb-0.5">Mótlykill innborgana (banki inn)</label>{opts(s.statement_contra_in, (v) => setS({ ...s, statement_contra_in: v }))}</div>
          <div><label className="block text-[11px] text-gray-500 mb-0.5">Mótlykill úttekta (banki út)</label>{opts(s.statement_contra_out, (v) => setS({ ...s, statement_contra_out: v }))}</div>
        </div>
        <label className="flex items-center gap-2 text-sm mt-4">
          <input type="checkbox" checked={s.auto_sync} onChange={(e) => setS({ ...s, auto_sync: e.target.checked })} />
          Sjálfvirk samstilling á nóttunni <span className="text-xs text-gray-400">(lesið af þjóni; krefst cron)</span>
        </label>

        {err && <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">✗ {err}</div>}
        {msg && <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700">{msg}</div>}

        <button onClick={save} disabled={busy} className="mt-4 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">
          {busy ? "Vista…" : "Vista samstillingar"}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="font-semibold text-sm mb-1">Arion tenging</p>
        <p className="text-xs text-gray-500 mb-3">Tengistillingar (skilríki, lyklar) eru í <code>.env.local</code> á þjóninum — sjá Tengingar-flipann.</p>
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Umhverfi</span><span className={envStatus.sandbox ? "text-amber-600" : "text-blue-700"}>{envStatus.sandbox ? "Sandkassi" : "Raunumhverfi"}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">API-slóð</span><code className="text-xs">{envStatus.baseUrl}</code></div>
          <div className="flex justify-between"><span className="text-gray-500">Cards áskrift</span><span className={envStatus.hasCards ? "text-green-700" : "text-gray-300"}>{envStatus.hasCards ? "✓" : "vantar"}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">PSD2 áskrift</span><span className={envStatus.hasPsd2 ? "text-green-700" : "text-gray-300"}>{envStatus.hasPsd2 ? "✓" : "vantar"}</span></div>
        </div>
      </div>
    </div>
  );
}
