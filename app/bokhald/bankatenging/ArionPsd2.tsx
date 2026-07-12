"use client";
import { useState, useEffect } from "react";

interface Consent { consentId: string; status?: string; scaRedirect?: string }
interface Account { id: string; iban?: string; name?: string; currency?: string; balance?: number }

/** PSD2 accounts + consent flow. In PRODUCTION this runs entirely on server credentials
 *  (mTLS OAuth + ARION_PSD2_SUBSCRIPTION_KEY + ARION_PSU_ID) and consents persisted server-side —
 *  no pasting, nothing sensitive in the browser. The paste fields are a SANDBOX affordance only. */
export default function ArionPsd2({ sandbox = false, serverReady = false }: { sandbox?: boolean; serverReady?: boolean }) {
  const [token, setToken] = useState("");
  const [subKey, setSubKey] = useState("");
  const [psuId, setPsuId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [consent, setConsent] = useState<Consent | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [back, setBack] = useState(false);
  const [iban, setIban] = useState("");
  const [consentStatus, setConsentStatus] = useState<string | null>(null);

  // SANDBOX: persist tester inputs so they survive the SCA redirect round-trip.
  // PRODUCTION: never store credentials/identity in the browser — and clear any sandbox-era leftovers.
  useEffect(() => {
    try {
      const s = window.localStorage;
      if (!sandbox) {
        ["arion_psd2_token", "arion_psd2_subkey", "arion_psd2_psuid", "arion_psd2_iban", "arion_psd2_consent", "arion_cards_token"].forEach((k) => s.removeItem(k));
        return;
      }
      const t = s.getItem("arion_psd2_token"); if (t) setToken(t);
      const k = s.getItem("arion_psd2_subkey"); if (k) setSubKey(k);
      const p = s.getItem("arion_psd2_psuid"); if (p) setPsuId(p);
      const i = s.getItem("arion_psd2_iban"); if (i) setIban(i);
      const c = s.getItem("arion_psd2_consent"); if (c) setConsent(JSON.parse(c));
      if (window.location.search.length > 1 && c) setBack(true); // came back from SCA
    } catch { /* ignore */ }
  }, [sandbox]);
  useEffect(() => { if (sandbox) try { window.localStorage.setItem("arion_psd2_token", token); } catch { /* */ } }, [token, sandbox]);
  useEffect(() => { if (sandbox) try { window.localStorage.setItem("arion_psd2_subkey", subKey); } catch { /* */ } }, [subKey, sandbox]);
  useEffect(() => { if (sandbox) try { window.localStorage.setItem("arion_psd2_psuid", psuId); } catch { /* */ } }, [psuId, sandbox]);
  useEffect(() => { if (sandbox) try { window.localStorage.setItem("arion_psd2_iban", iban); } catch { /* */ } }, [iban, sandbox]);
  useEffect(() => { if (sandbox) try { if (consent) window.localStorage.setItem("arion_psd2_consent", JSON.stringify(consent)); } catch { /* */ } }, [consent, sandbox]);
  // Let sibling panels (Bankayfirlit) pick up new PSD2 credentials/consent without a page reload.
  useEffect(() => { try { window.dispatchEvent(new Event("arion-psd2-updated")); } catch { /* */ } }, [token, subKey, consent]);

  async function post(payload: Record<string, unknown>) {
    const r = await fetch("/api/bankatenging/psd2", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(sandbox ? { token: token.trim(), subscriptionKey: subKey.trim(), ...payload } : payload),
    });
    return r.json();
  }

  async function createConsent() {
    setBusy(true); setErr(""); setAccounts(null);
    try {
      const d = await post({ action: "consent", psuId: psuId.trim() || undefined, iban: iban.trim() || undefined });
      if (!d.ok) { setErr(d.message || "Villa"); setConsent(null); return; }
      setConsent(d.consent); setBack(false); setConsentStatus(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  async function loadAccounts() {
    setBusy(true); setErr("");
    try {
      // consentId omitted → the server uses the newest stored consent.
      const d = await post({ action: "accounts", ...(consent?.consentId ? { consentId: consent.consentId } : {}) });
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      setAccounts(d.accounts || []); setConsentStatus(d.consentStatus || null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  const kr = (n: number) => Math.round(n).toLocaleString("is-IS");
  const canCreate = sandbox ? !!(token.trim() && subKey.trim() && psuId.trim()) : serverReady;
  const canFetch = sandbox ? !!consent?.consentId : serverReady;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="font-semibold text-sm mb-1">Reikningar og samþykki (PSD2)</p>
      <p className="text-xs text-gray-500 mb-3">
        Sækir bankareikninga og stöður fyrir bankaafstemmingu. Krefst <b>samþykkis (consent)</b>: búðu til samþykki, staðfestu það í banka (SCA), sæktu svo reikningana. Samþykki er vistað í kerfinu og gildir á öllum tækjum.
      </p>

      {sandbox && (
        <>
          <p className="text-[11px] text-amber-600 mb-2">SANDKASSI · PSD2 er sér-áskrift (annar lykill en Cards). Sæktu „Generate Token“ í þróunargáttinni.</p>
          <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={2} placeholder="Límdu Arion aðgangslykil (Generate Token)…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-red-400 mb-2" />
          <input value={subKey} onChange={(e) => setSubKey(e.target.value)} placeholder="PSD2 áskriftarlykill (Ocp-Apim-Subscription-Key)…"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-mono outline-none focus:border-red-400 mb-2" />
          <label className="block text-xs text-gray-500 mb-1">Kennitala reikningseiganda (PSU-ID)</label>
          <input value={psuId} onChange={(e) => setPsuId(e.target.value)} placeholder="kennitala" className="w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm mb-3 tabular-nums" />
        </>
      )}
      {!sandbox && !serverReady && (
        <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-700">
          PSD2 tenging ekki tilbúin — vantar skilríki, ARION_PSD2_SUBSCRIPTION_KEY, ARION_PSU_ID eða ARION_REDIRECT_URI á þjóninum.
        </div>
      )}

      <label className="block text-xs text-gray-500 mb-1">IBAN reiknings <span className="text-gray-400">(tómt = allir reikningar)</span></label>
      <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="ISxx…" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mb-3 font-mono tabular-nums" />

      <div className="flex flex-wrap gap-2">
        <button onClick={createConsent} disabled={busy || !canCreate}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
          {busy ? "…" : "1. Búa til samþykki"}
        </button>
        <button onClick={loadAccounts} disabled={busy || !canFetch}
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
          <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm min-w-[480px]">
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
          </div>
        )
      )}
    </div>
  );
}
