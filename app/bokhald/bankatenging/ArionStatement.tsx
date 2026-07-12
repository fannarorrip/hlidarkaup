"use client";
import { useState, useEffect } from "react";
import { dags, vNr } from "@/lib/format";

interface Account { id: string; iban?: string; name?: string; currency?: string; balance?: number }
interface Row {
  id: string; entry_reference: string; booking_date: string | null; amount: number; currency: string | null;
  counterparty: string | null; remittance: string | null; status: string;
  series_code: string | null; voucher_number: string | null; contra_account: string | null;
  suggested_contra: string | null;   // learned counterparty→lykill rule
}
interface BankAcct { account_number: string; name: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ArionStatement({ bankAccounts, defaultBank, contraIn, contraOut, sandbox = false, serverReady = false }: { bankAccounts: BankAcct[]; defaultBank?: string; contraIn?: string; contraOut?: string; sandbox?: boolean; serverReady?: boolean }) {
  const [token, setToken] = useState("");
  const [subKey, setSubKey] = useState("");
  const [consentId, setConsentId] = useState("");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [ledgerAccount, setLedgerAccount] = useState(defaultBank || bankAccounts[0]?.account_number || "");
  // Mótlykill pre-fill: the LEARNED rule for the counterparty wins; otherwise the direction
  // default from Samstillingar. The system learns on every booking.
  const defContra = (r: { amount: number; suggested_contra?: string | null }) =>
    r.suggested_contra || ((r.amount >= 0 ? contraIn : contraOut) || "");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [bulkBooking, setBulkBooking] = useState(false);
  const [from, setFrom] = useState(iso(new Date(Date.now() - 90 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [contra, setContra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // SANDBOX: reuse the tester credentials + consent from the Bankareikningar tab (localStorage).
  // PRODUCTION: nothing to read — the server uses its own env credentials + the stored consent.
  useEffect(() => {
    if (!sandbox) return;
    const read = () => {
      try {
        const s = window.localStorage;
        const t = s.getItem("arion_psd2_token"); if (t) setToken(t);
        const k = s.getItem("arion_psd2_subkey"); if (k) setSubKey(k);
        const c = s.getItem("arion_psd2_consent"); if (c) { const j = JSON.parse(c); if (j?.consentId) setConsentId(j.consentId); }
      } catch { /* */ }
    };
    read();
    window.addEventListener("arion-psd2-updated", read);
    window.addEventListener("focus", read);
    return () => { window.removeEventListener("arion-psd2-updated", read); window.removeEventListener("focus", read); };
  }, [sandbox]);

  async function post(payload: Record<string, unknown>) {
    if (!sandbox) {
      // Production: server env credentials + newest stored consent (no consentId sent).
      const r = await fetch("/api/bankatenging/psd2", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      return r.json();
    }
    // Sandbox: read the freshest tester credentials straight from localStorage so a consent created
    // moments ago in another tab is used even if React state hasn't caught up yet.
    let t = token.trim(), k = subKey.trim(), cid = consentId.trim();
    try {
      const s = window.localStorage;
      t = (s.getItem("arion_psd2_token") || t).trim();
      k = (s.getItem("arion_psd2_subkey") || k).trim();
      const c = s.getItem("arion_psd2_consent"); if (c) { const j = JSON.parse(c); if (j?.consentId) cid = String(j.consentId).trim(); }
    } catch { /* */ }
    const r = await fetch("/api/bankatenging/psd2", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: t, subscriptionKey: k, consentId: cid, ...payload }),
    });
    return r.json();
  }

  async function loadAccounts() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const d = await post({ action: "accounts" });
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      setAccounts(d.accounts || []);
      if (d.accounts?.[0] && !accountId) setAccountId(d.accounts[0].id);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  async function loadTransactions() {
    if (!accountId) { setErr("Veldu reikning."); return; }
    setBusy(true); setErr(""); setMsg("");
    try {
      const acc = accounts?.find((a) => a.id === accountId);
      const d = await post({ action: "transactions", accountId, iban: acc?.iban, ledgerAccount, dateFrom: from, dateTo: to });
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      setRows(d.transactions || []);
      setMsg(`Sótti ${d.fetched} færslur (${d.stored} nýjar).`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  async function bookOne(row: Row): Promise<boolean> {
    const contraAccount = (contra[row.id] ?? defContra(row)).trim();
    if (!contraAccount) return false;
    const r = await fetch("/api/bankatenging/statement/book", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ bankTxId: row.id, bankAccount: ledgerAccount, contraAccount }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.message || "Villa");
    setRows((prev) => prev?.map((x) => x.id === row.id
      ? { ...x, status: "booked", series_code: d.voucher?.series_code ?? null, voucher_number: d.voucher?.voucher_number ?? null }
      : x) ?? null);
    return true;
  }

  async function book(row: Row) {
    if (!(contra[row.id] ?? defContra(row)).trim()) { setErr("Sláðu inn mótlykil fyrir færsluna."); return; }
    setBookingId(row.id); setErr(""); setMsg("");
    try {
      await bookOne(row);
      setMsg("✓ Bókað.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBookingId(null); }
  }

  /** Book every ticked, unbooked row with its own mótlykill — one by one, stopping on errors. */
  async function bookSelected() {
    const targets = (rows ?? []).filter((r) => sel[r.id] && r.status !== "booked");
    if (!targets.length) return;
    setBulkBooking(true); setErr(""); setMsg("");
    let ok = 0;
    const problems: string[] = [];
    for (const row of targets) {
      try {
        if (await bookOne(row)) ok++;
        else problems.push(`${row.counterparty || row.id}: vantar mótlykil`);
      } catch (e) {
        problems.push(`${row.counterparty || row.id}: ${e instanceof Error ? e.message : "villa"}`);
      }
    }
    setMsg(`✓ Bókaði ${ok} af ${targets.length} völdum færslum.`);
    if (problems.length) setErr(problems.slice(0, 3).join(" · ") + (problems.length > 3 ? ` · +${problems.length - 3}` : ""));
    setSel({});
    setBulkBooking(false);
  }

  const kr = (n: number) => Math.round(n).toLocaleString("is-IS");

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="font-semibold text-sm mb-1">Bankayfirlit (PSD2)</p>
      <p className="text-xs text-gray-500 mb-3">
        Sækir raunverulegar hreyfingar bankareiknings og bókar þær í bókhaldið. Notar PSD2-samþykkið sem búið var til í <b>Bankareikningar</b>-flipanum (aðgangslykill + áskriftarlykill sóttir sjálfkrafa).
      </p>

      {sandbox && !consentId && (
        <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-700">
          Ekkert PSD2-samþykki fannst. Farðu í <b>Bankareikningar</b>, búðu til samþykki og staðfestu það (SCA), komdu svo hingað.
        </div>
      )}
      {!sandbox && !serverReady && (
        <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-700">
          PSD2 tenging ekki tilbúin — vantar skilríki eða lykla á þjóninum (sjá Tengingar-flipann).
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <button onClick={loadAccounts} disabled={busy || (sandbox ? !(token.trim() && subKey.trim() && consentId.trim()) : !serverReady)}
          className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-40">
          Sækja reikninga
        </button>
        {accounts && (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.iban || a.id}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Bankalykill (bókhald)</label>
          <select value={ledgerAccount} onChange={(e) => setLedgerAccount(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {bankAccounts.map((b) => <option key={b.account_number} value={b.account_number}>{b.account_number} · {b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Frá</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm tabular-nums" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Til</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm tabular-nums" />
        </div>
        <button onClick={loadTransactions} disabled={busy || !accountId}
          className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">
          {busy ? "Sæki…" : "Sækja hreyfingar"}
        </button>
      </div>

      {err && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">✗ {err}</div>}
      {msg && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700">{msg}</div>}

      {rows && (rows.length === 0 ? (
        <p className="text-sm text-gray-400">Engar hreyfingar á tímabilinu.</p>
      ) : (
        <>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-gray-400 text-left text-xs">
            <tr>
              <th className="py-1 w-8">
                <input type="checkbox"
                  checked={rows.filter((r) => r.status !== "booked").length > 0 && rows.filter((r) => r.status !== "booked").every((r) => sel[r.id])}
                  onChange={(e) => setSel(Object.fromEntries(rows.filter((r) => r.status !== "booked").map((r) => [r.id, e.target.checked])))}
                  aria-label="Velja allar" />
              </th>
              <th className="py-1 font-medium">Dags.</th>
              <th className="py-1 font-medium">Mótaðili / skýring</th>
              <th className="py-1 font-medium text-right">Upphæð</th>
              <th className="py-1 font-medium">Mótlykill</th>
              <th className="py-1 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const inbound = r.amount >= 0;
              return (
                <tr key={r.id} className="border-t border-gray-100 align-top">
                  <td className="py-1.5">
                    {r.status !== "booked" && (
                      <input type="checkbox" checked={!!sel[r.id]} onChange={(e) => setSel((p) => ({ ...p, [r.id]: e.target.checked }))} aria-label="Velja" />
                    )}
                  </td>
                  <td className="py-1.5 text-gray-500 tabular-nums whitespace-nowrap">{dags(r.booking_date)}</td>
                  <td className="py-1.5">
                    {r.counterparty || "—"}
                    {r.remittance && <span className="block text-[11px] text-gray-400">{r.remittance}</span>}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums whitespace-nowrap ${inbound ? "text-green-700" : "text-gray-700"}`}>
                    {inbound ? "+" : "−"}{kr(Math.abs(r.amount))} kr.
                  </td>
                  <td className="py-1.5">
                    {r.status === "booked" ? (
                      <span className="text-xs text-green-700">✓ {vNr(r.series_code, r.voucher_number)}</span>
                    ) : (
                      <input value={contra[r.id] ?? defContra(r)} onChange={(e) => setContra((p) => ({ ...p, [r.id]: e.target.value }))}
                        placeholder={inbound ? "t.d. 7600" : "t.d. 9300"}
                        title={r.suggested_contra ? "Lært af fyrri bókunum" : undefined}
                        className={`w-24 border rounded px-2 py-1 text-xs tabular-nums ${r.suggested_contra && (contra[r.id] ?? defContra(r)) === r.suggested_contra ? "border-emerald-300 bg-emerald-50/50" : "border-gray-300"}`} />
                    )}
                  </td>
                  <td className="py-1.5">
                    {r.status !== "booked" && (
                      <button onClick={() => book(r)} disabled={bookingId !== null || bulkBooking || !(contra[r.id] ?? defContra(r)).trim()}
                        className="px-3 py-1 rounded-lg bg-gray-800 text-white text-xs font-semibold hover:bg-gray-900 disabled:opacity-40">{bookingId === r.id ? "Bóka…" : "Bóka"}</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {rows.some((r) => sel[r.id] && r.status !== "booked") && (
          <button onClick={bookSelected} disabled={bulkBooking || bookingId !== null}
            className="mt-3 px-4 py-1.5 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-40">
            {bulkBooking ? "Bóka…" : `Bóka valdar (${rows.filter((r) => sel[r.id] && r.status !== "booked").length})`}
          </button>
        )}
        </>
      ))}

      <p className="mt-3 text-[11px] text-gray-400">
        Innborgun (+) bókast: Debet bankalykill / Kredit mótlykill (t.d. 7600 viðskiptakröfur). Úttekt (−): Debet mótlykill / Kredit bankalykill (t.d. 9300 lánardrottnar).
        Kerfið man mótlykilinn fyrir hvern mótaðila og fyllir hann sjálfkrafa næst (grænt = lært). Sama færsla bókast aðeins einu sinni.
      </p>
    </div>
  );
}
