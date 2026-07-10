"use client";
import { useState } from "react";

// Ógreiddar kröfur Á OKKUR (Hlíðarkaup sem greiðandi) — sóttar úr Arion/RB B2B (GetBills) um Bridge.
// Aðgreint frá "Payables" (okkar eigin bókuðu reikningar); þetta er það sem bankinn sýnir ógreitt.
// „Borga" notar B2B DoPayment (Claim) — RAUNVERULEG greiðsla — og bókar Dr lánadrottinn / Kr banki.
interface Bill {
  id: string; number: string | null; due_date: string | null; final_due_date: string | null;
  description: string | null; identifier: string | null; amount_due: number; currency: string;
  claimant_id: string | null; claimant_name: string | null; claim_type: string | null;
  bill_type: string | null; is_debited: boolean; days_until_due: number | null;
}
interface BankAccount { account_number: string; name: string }

const kr = (n: number) => Math.round(n).toLocaleString("is-IS");

export default function BankBills({ bills: initial, configured, payReady, bankAccounts, defaultBank }: {
  bills: Bill[]; configured: boolean; payReady: boolean; bankAccounts: BankAccount[]; defaultBank?: string;
}) {
  const [bills, setBills] = useState<Bill[]>(initial);
  const [busy, setBusy] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [bankAccount, setBankAccount] = useState<string>(defaultBank || bankAccounts[0]?.account_number || "");

  const total = bills.reduce((a, b) => a + (Number(b.amount_due) || 0), 0);

  async function fetchFromBank() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/bankatenging/bank-bills", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "fetch" }),
      });
      const j = await r.json();
      if (j.ok) {
        setBills(j.bills || []);
        setMsg(`Sótt: ${j.fetched} kröfur (${j.open} ógreiddar${j.gone ? `, ${j.gone} horfnar` : ""}).`);
      } else {
        setMsg(j.message || "Sókn mistókst.");
      }
    } catch {
      setMsg("Villa við sókn.");
    } finally {
      setBusy(false);
    }
  }

  async function pay(b: Bill) {
    const who = b.claimant_name || b.claimant_id || "óþekktan kröfuhafa";
    if (!window.confirm(`Borga ${kr(b.amount_due)} kr. til ${who}?\n\nÞetta er raunveruleg greiðsla úr bankanum. Krafan er greidd að fullu (kostnaður getur bæst við).`)) return;
    setPayingId(b.id); setMsg(null);
    try {
      const r = await fetch(`/api/bankatenging/bank-bills/${b.id}/pay`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bankAccount }),
      });
      const j = await r.json();
      if (j.ok) {
        if (!j.needsConfirmation) setBills((prev) => prev.filter((x) => x.id !== b.id));
        setMsg(j.message || (j.voucher ? `Greitt og bókað (${j.voucher.series_code}-${j.voucher.voucher_number}).` : "Greitt."));
      } else {
        setMsg(j.message || "Greiðsla mistókst.");
      }
    } catch {
      setMsg("Villa við greiðslu.");
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="font-semibold text-sm">Kröfur á okkur (frá banka)</p>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${configured ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {configured ? "B2B tengt" : "Bridge óvirk"}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Ógreiddar kröfur og greiðsluseðlar sem aðrir hafa stofnað á Hlíðarkaup í bankanum (við sem greiðandi) — sótt beint úr Arion/RB.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-400">Ógreiddar kröfur</p>
          <p className="text-lg font-bold tabular-nums">{bills.length}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-400">Samtals til greiðslu</p>
          <p className="text-lg font-bold tabular-nums">{kr(total)} kr.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          onClick={fetchFromBank}
          disabled={busy || !configured}
          className="px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold disabled:opacity-40 hover:bg-red-800"
        >
          {busy ? "Sæki…" : "Sækja kröfur frá banka"}
        </button>
        {payReady && bills.length > 0 && (
          <label className="text-xs text-gray-500 flex items-center gap-2">
            Bóka greiðslur á:
            <select value={bankAccount} onChange={(e) => setBankAccount(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              {bankAccounts.map((a) => (
                <option key={a.account_number} value={a.account_number}>{a.account_number} — {a.name}</option>
              ))}
            </select>
          </label>
        )}
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>

      {!configured && (
        <div className="text-xs text-amber-700 bg-amber-50/60 border border-amber-100 rounded-lg p-3 leading-relaxed">
          B2B Bridge er ekki tengd enn. Til að sækja ógreiddar kröfur úr bankanum þarf B2B Bridge á Windows-vél
          (t.d. kassatölvunni) og að Arion virki búnaðarskilríkið fyrir <code>BillService</code>. Sjá
          <code> deploy/ARION_B2B_BRIDGE.md</code>.
        </div>
      )}

      {bills.length > 0 && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium">Kröfuhafi</th>
                <th className="py-2 font-medium">Skýring</th>
                <th className="py-2 font-medium">Gjalddagi</th>
                <th className="py-2 font-medium text-right">Upphæð</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const overdue = b.days_until_due != null && b.days_until_due < 0;
                return (
                  <tr key={b.id} className="border-b border-gray-50">
                    <td className="py-2">{b.claimant_name || b.claimant_id || "—"}</td>
                    <td className="py-2 text-gray-600">{b.description || b.identifier || b.number || "—"}</td>
                    <td className={`py-2 tabular-nums ${overdue ? "text-red-700 font-semibold" : ""}`}>
                      {b.due_date || "—"}{overdue && <span className="ml-1 text-[10px]">í vanskilum</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold">{kr(b.amount_due)} kr.</td>
                    <td className="py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        {b.is_debited && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">beingreiðsla</span>}
                        {payReady && !b.is_debited && (
                          <button
                            onClick={() => pay(b)}
                            disabled={payingId !== null || !bankAccount}
                            className="px-3 py-1 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                          >
                            {payingId === b.id ? "Greiði…" : "Borga"}
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-400">
            „Borga" greiðir kröfuna að fullu úr útgreiðslureikningnum (kostnaður getur bæst við) og bókar
            Dr lánadrottinn / Kr banki. Kröfur í beingreiðslu greiðast sjálfkrafa.
          </p>
        </div>
      )}
    </div>
  );
}
