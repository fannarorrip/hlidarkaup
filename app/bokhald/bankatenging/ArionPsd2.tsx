"use client";
import { useState, useEffect } from "react";

interface Consent { consentId: string; status?: string; scaRedirect?: string }
interface Account { id: string; iban?: string; name?: string; currency?: string; balance?: number }

export default function ArionPsd2() {
  const [token, setToken] = useState("");
  const [subKey, setSubKey] = useState("");
  const [psuId, setPsuId] = useState("2005711429"); // sandbox test user (Marcin) — change for real
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [consent, setConsent] = useState<Consent | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [back, setBack] = useState(false);
  const [iban, setIban] = useState("IS690310261813452005711429"); // sandbox test account
  const [consentStatus, setConsentStatus] = useState<string | null>(null);

  // Persist inputs so they survive the SCA redirect round-trip (the browser leaves this page
  // to approve the consent, then returns and reloads — React state would otherwise be wiped).
  useEffect(() => {
    try {
      const s = window.localStorage;
      const t = s.getItem("arion_psd2_token"); if (t) setToken(t);
      const k = s.getItem("arion_psd2_subkey"); if (k) setSubKey(k);
      const p = s.getItem("arion_psd2_psuid"); if (p) setPsuId(p);
      const c = s.getItem("arion_psd2_consent"); if (c) setConsent(JSON.parse(c));
      if (window.location.search.length > 1 && c) setBack(true); // came back from SCA
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { window.localStorage.setItem("arion_psd2_token", token); } catch { /* */ } }, [token]);
  useEffect(() => { try { window.localStorage.setItem("arion_psd2_subkey", subKey); } catch { /* */ } }, [subKey]);
  useEffect(() => { try { window.localStorage.setItem("arion_psd2_psuid", psuId); } catch { /* */ } }, [psuId]);
  useEffect(() => { try { const v = window.localStorage.getItem("arion_psd2_iban"); if (v) setIban(v); } catch { /* */ } }, []);
  useEffect(() => { try { window.localStorage.setItem("arion_psd2_iban", iban); } catch { /* */ } }, [iban]);
  useEffect(() => { try { if (consent) window.localStorage.setItem("arion_psd2_consent", JSON.stringify(consent)); } catch { /* */ } }, [consent]);
  // Let sibling panels (Bankayfirlit) pick up new PSD2 credentials/consent without a page reload —
  // all tabs are mounted at once, so a plain mount-time read would miss values entered afterwards.
  useEffect(() => { try { window.dispatchEvent(new Event("arion-psd2-updated")); } catch { /* */ } }, [token, subKey, consent]);

  async function post(payload: Record<string, unknown>) {
    const r = await fetch("/api/bankatenging/psd2", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: token.trim(), subscriptionKey: subKey.trim(), ...payload }),
    });
    return r.json();
  }

  async function createConsent() {
    setBusy(true); setErr(""); setAccounts(null);
    try {
      const d = await post({ action: "consent", psuId: psuId.trim(), iban: iban.trim() || undefined });
      if (!d.ok) { setErr(d.message || "Villa"); setConsent(null); return; }
      setConsent(d.consent); setBack(false); setConsentStatus(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  async function loadAccounts() {
    if (!consent?.consentId) return;
    setBusy(true); setErr("");
    try {
      const d = await post({ action: "accounts", consentId: consent.consentId });
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      setAccounts(d.accounts || []); setConsentStatus(d.consentStatus || null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  const kr = (n: number) => Math.round(n).toLocaleString("is-IS");

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="font-semibold text-sm mb-1">Reikningshreyfingar (PSD2) — prófun</p>
      <p className="text-xs text-gray-500 mb-3">
        Sækir bankareikninga og stöður fyrir bankaafstemmingu. Krefst <b>samþykkis (consent)</b>: búðu til samþykki, staðfestu það í vafra (SCA), sæktu svo reikningana.
      </p>

      <p className="text-[11px] text-amber-600 mb-2">PSD2 er sér-áskrift (annar lykill en Cards). Skráðu forritið á „Accounts and Payments (PSD2)“ í gáttinni og notaðu þann áskriftarlykil hér.</p>
      <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={2} placeholder="Límdu Arion aðgangslykil (Generate Token)…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-red-400 mb-2" />
      <input value={subKey} onChange={(e) => setSubKey(e.target.value)} placeholder="PSD2 áskriftarlykill (Ocp-Apim-Subscription-Key)…"
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-mono outline-none focus:border-red-400 mb-2" />
      <label className="block text-xs text-gray-500 mb-1">Kennitala reikningseiganda (PSU-ID)</label>
      <input value={psuId} onChange={(e) => setPsuId(e.target.value)} className="w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm mb-3 tabular-nums" />
      <label className="block text-xs text-gray-500 mb-1">IBAN reiknings <span className="text-gray-400">(tómt = allir reikningar)</span></label>
      <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="ISxx…" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mb-3 font-mono tabular-nums" />

      <div className="flex flex-wrap gap-2">
        <button onClick={createConsent} disabled={busy || !token.trim() || !psuId.trim() || !subKey.trim()}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
          {busy ? "…" : "1. Búa til samþykki"}
        </button>
        <button onClick={loadAccounts} disabled={busy || !consent?.consentId}
          className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-40">
          3. Sækja reikninga
        </button>
      </div>

      {err && <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">✗ {err}</div>}
      {back && <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700">✓ Komið til baka frá staðfestingu — smelltu á „3. Sækja reikninga“.</div>}

      {consent && (
        <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
          <p>✓ Samþykki búið til <span className="text-gray-400 font-mono text-xs">({consent.consentId?.slice(0, 12)}…)</span>{consent.status && <span className="text-gray-500"> · {consent.status}</span>}</p>
          {consent.scaRedirect && (
            <p className="mt-1">
              <b>2.</b> <a href={consent.scaRedirect} target="_blank" rel="noopener" className="text-red-700 hover:underline">Staðfestu samþykkið hér (SCA) →</a> og smelltu svo á „Sækja reikninga“.
            </p>
          )}
        </div>
      )}

      {consentStatus && (
        <p className={`mt-3 text-xs ${consentStatus === "valid" ? "text-green-600" : "text-amber-600"}`}>
          Staða samþykkis: <b>{consentStatus}</b>{consentStatus !== "valid" && " — samþykkið er ekki staðfest. Opnaðu SCA-hlekkinn að ofan og kláraðu staðfestinguna, reyndu svo aftur."}
        </p>
      )}
      {accounts && (
        accounts.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">Engir reikningar.</p>
        ) : (
          <table className="w-full text-sm mt-3">
            <thead className="text-gray-400 text-left text-xs">
              <tr><th className="py-1 font-medium">Reikningur</th><th className="py-1 font-medium">IBAN</th><th className="py-1 font-medium text-right">Staða</th></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="py-1">{a.name || "—"}</td>
                  <td className="py-1 font-mono text-xs text-gray-500">{a.iban || a.id}</td>
                  <td className="py-1 text-right tabular-nums">{a.balance != null ? `${kr(a.balance)} kr.` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}
