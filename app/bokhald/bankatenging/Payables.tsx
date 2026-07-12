"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { dags } from "@/lib/format";

interface Payable {
  id: string; supplier_name: string | null; supplier_iban: string | null; invoice_number: string | null;
  invoice_date: string | null; due_date: string | null; amount: number; ap_account: string; status: string;
  payment_ref: string | null; days_overdue: number | null; series_code: string | null; voucher_number: string | null;
}
interface BankAcct { account_number: string; name: string }

const kr = (n: number) => Math.round(n).toLocaleString("is-IS");

function Aging({ d }: { d: number | null }) {
  if (d == null) return <span className="text-gray-400">—</span>;
  if (d > 0) return <span className="text-red-700">{d} d. yfir</span>;
  if (d === 0) return <span className="text-amber-600">á gjalddaga</span>;
  return <span className="text-gray-500">eftir {-d} d.</span>;
}

export default function Payables({ payables, bankAccounts, defaultBank, sandbox = false, psd2Ready = false }: { payables: Payable[]; bankAccounts: BankAcct[]; defaultBank?: string; sandbox?: boolean; psd2Ready?: boolean }) {
  const router = useRouter();
  const [bankAccount, setBankAccount] = useState(defaultBank || bankAccounts[0]?.account_number || "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // PSD2 payment (one row at a time)
  const [payId, setPayId] = useState<string | null>(null);       // payable row with the form open
  const [debtorIban, setDebtorIban] = useState("");
  const [creditorIban, setCreditorIban] = useState("");
  const [psd2, setPsd2] = useState<{ paymentId: string; scaRedirect?: string } | null>(null);
  const [creds, setCreds] = useState<{ token: string; subKey: string; psuId: string }>({ token: "", subKey: "", psuId: "" });

  // SANDBOX ONLY: tester credentials from the Bankareikningar tab. Production sends nothing —
  // the server runs on env credentials and its own PSU-ID.
  useEffect(() => {
    if (!sandbox) return;
    const read = () => {
      try {
        const s = window.localStorage;
        setCreds({ token: s.getItem("arion_psd2_token") || "", subKey: s.getItem("arion_psd2_subkey") || "", psuId: s.getItem("arion_psd2_psuid") || "" });
        setDebtorIban((prev) => prev || s.getItem("arion_psd2_iban") || "");
      } catch { /* */ }
    };
    read();
    // Pick up PSD2 credentials entered in the Bankareikningar tab without a reload (all tabs mounted).
    window.addEventListener("arion-psd2-updated", read);
    window.addEventListener("focus", read);
    return () => { window.removeEventListener("arion-psd2-updated", read); window.removeEventListener("focus", read); };
  }, [sandbox]);

  const total = payables.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const overdue = payables.filter((p) => (p.days_overdue ?? -1) > 0);

  async function backfill() {
    setBusyId("backfill"); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/bankatenging/payables", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "backfill" }) });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      setMsg(`Flutti inn ${d.imported} reikninga úr bókhaldi.`); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusyId(null); }
  }

  async function settle(p: Payable) {
    if (!bankAccount) { setErr("Veldu bankalykil efst."); return; }
    setBusyId(p.id); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/bankatenging/payables", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settle", payableId: p.id, bankAccount }) });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      setMsg(`✓ Greitt — fylgiskjal ${d.voucher?.series_code}-${d.voucher?.voucher_number}.`); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusyId(null); }
  }

  function openPsd2(p: Payable) {
    setPayId(p.id); setPsd2(null); setErr(""); setMsg("");
    setCreditorIban(p.supplier_iban || "");
  }

  async function initiatePayment(p: Payable) {
    if (!debtorIban.trim() || !creditorIban.trim()) { setErr("Vantar IBAN (greiðandi/móttakandi)."); return; }
    setBusyId(p.id); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/bankatenging/payments", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "initiate", payableId: p.id, debtorIban, creditorIban, psuId: creds.psuId, token: creds.token, subscriptionKey: creds.subKey }),
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      setPsd2({ paymentId: d.paymentId, scaRedirect: d.scaRedirect });
      setMsg("Greiðsla stofnuð — staðfestu í banka (SCA), athugaðu svo stöðu.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusyId(null); }
  }

  // Check a payment's status (and settle if executed). paymentId comes from the just-initiated
  // payment (psd2) for open rows, or the stored payment_ref for a row already in 'pending'.
  async function checkStatus(p: Payable, paymentId: string | null) {
    if (!paymentId) { setErr("Ekkert greiðslunúmer fyrir þessa færslu."); return; }
    if (!bankAccount) { setErr("Veldu bankalykil efst."); return; }
    setBusyId(p.id); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/bankatenging/payments", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status", paymentId, payableId: p.id, bankAccount, token: creds.token, subscriptionKey: creds.subKey }),
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      if (d.settled) { setMsg(`✓ Greitt (${d.status}) — fylgiskjal ${d.settled.series_code}-${d.settled.voucher_number}.`); setPayId(null); setPsd2(null); router.refresh(); }
      else setMsg(`Staða greiðslu: ${d.status}${d.settleError ? ` · ${d.settleError}` : " — ekki frágengið enn (bíð eftir staðfestingu)."}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="font-semibold text-sm">Ógreiddir reikningar (lánardrottnar)</p>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">Virkt</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Ógreiddir reikningar á reikning (9300). Merktu greitt (bókar Debet 9300 / Kredit banki) eða greiddu beint um PSD2.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">Ógreiddir</p><p className="text-lg font-bold tabular-nums">{payables.length}</p></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">Í vanskilum</p><p className="text-lg font-bold tabular-nums text-red-700">{overdue.length}</p></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">Samtals</p><p className="text-lg font-bold tabular-nums">{kr(total)} kr.</p></div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <label className="text-xs text-gray-500">Greitt af banka:</label>
        <select value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          {bankAccounts.map((b) => <option key={b.account_number} value={b.account_number}>{b.account_number} · {b.name}</option>)}
        </select>
        <button onClick={backfill} disabled={busyId === "backfill"} className="ml-auto px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          {busyId === "backfill" ? "Flyt inn…" : "Flytja inn eldri úr bókhaldi"}
        </button>
      </div>

      {err && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">✗ {err}</div>}
      {msg && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700">{msg}</div>}

      {payables.length === 0 ? (
        <p className="text-sm text-gray-400">Engir ógreiddir reikningar skráðir. Nýir innkaupareikningar á reikning birtast hér — eða smelltu „Flytja inn eldri“.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="text-gray-400 text-left text-xs">
            <tr>
              <th className="py-1 font-medium">Birgir</th>
              <th className="py-1 font-medium">Reikn.nr.</th>
              <th className="py-1 font-medium">Gjalddagi</th>
              <th className="py-1 font-medium text-right">Upphæð</th>
              <th className="py-1 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {payables.map((p) => (
              <tr key={p.id} className="border-t border-gray-100 align-top">
                <td className="py-1.5">
                  {p.supplier_name || "—"}
                  {p.status === "pending" && <span className="ml-1 text-[11px] text-amber-600">(greiðsla í vinnslu)</span>}
                </td>
                <td className="py-1.5 text-gray-500">{p.invoice_number || "—"}</td>
                <td className="py-1.5 whitespace-nowrap">{dags(p.due_date)} <span className="text-xs">· <Aging d={p.days_overdue} /></span></td>
                <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{kr(p.amount)} kr.</td>
                <td className="py-1.5">
                  <div className="flex flex-col items-end gap-1">
                    {p.status === "pending" ? (
                      // PSD2 payment already initiated — re-check its status (settles when executed).
                      <button onClick={() => checkStatus(p, p.payment_ref)} disabled={busyId !== null} className="px-2.5 py-1 rounded-lg bg-gray-800 text-white text-xs font-semibold hover:bg-gray-900 disabled:opacity-40">{busyId === p.id ? "Athuga…" : "Athuga stöðu & bóka"}</button>
                    ) : (
                      <>
                        <div className="flex gap-1">
                          <button onClick={() => settle(p)} disabled={busyId !== null} className="px-2.5 py-1 rounded-lg bg-gray-800 text-white text-xs font-semibold hover:bg-gray-900 disabled:opacity-40">{busyId === p.id ? "…" : "Merkja greitt"}</button>
                          {(sandbox || psd2Ready) && (
                            <button onClick={() => (payId === p.id ? setPayId(null) : openPsd2(p))} disabled={busyId !== null} className="px-2.5 py-1 rounded-lg border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 disabled:opacity-40">Greiða (PSD2)</button>
                          )}
                        </div>
                        {payId === p.id && (
                          <div className="mt-1 w-72 border border-gray-200 rounded-lg p-2 bg-gray-50 text-left">
                            <label className="block text-[11px] text-gray-500">IBAN greiðanda (þinn reikningur)</label>
                            <input value={debtorIban} onChange={(e) => setDebtorIban(e.target.value)} placeholder="ISxx…" className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono mb-1" />
                            <label className="block text-[11px] text-gray-500">IBAN móttakanda (birgir)</label>
                            <input value={creditorIban} onChange={(e) => setCreditorIban(e.target.value)} placeholder="ISxx…" className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono mb-2" />
                            {!psd2 ? (
                              <button onClick={() => initiatePayment(p)} disabled={busyId !== null} className="w-full px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-40">{busyId === p.id ? "Stofna…" : "Hefja greiðslu"}</button>
                            ) : (
                              <div className="space-y-1">
                                {psd2.scaRedirect && <a href={psd2.scaRedirect} target="_blank" rel="noopener" className="block text-xs text-red-700 hover:underline">Staðfestu í banka (SCA) →</a>}
                                <button onClick={() => checkStatus(p, psd2.paymentId)} disabled={busyId !== null} className="w-full px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs font-semibold hover:bg-gray-900 disabled:opacity-40">{busyId === p.id ? "Athuga…" : "Athuga stöðu & bóka"}</button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-400">PSD2-greiðsla notar aðgangslykil/áskriftarlykil úr Bankareikningar-flipanum. „Merkja greitt“ hentar ef þú greiðir í netbanka og vilt bara bóka færsluna.</p>
    </div>
  );
}
