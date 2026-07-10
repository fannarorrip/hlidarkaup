"use client";
import { useEffect, useState } from "react";
import { dags, vNr } from "@/lib/format";

// Bankayfirlit um Arion/RB B2B (hreyfingaryfirlit) — FRAMLEIÐSLULEIÐIN (PSD2 fer aldrei í framleiðslu).
// Sækir hreyfingar um B2B Bridge, geymir þær í acc.bank_transactions (sama pípa og áður) og bókar
// með sömu leið: /api/bankatenging/statement/book + lærðir mótlyklar. Innandagsfærslur fá
// TransactionID hjá RB daginn eftir og skila sér þá — engin tvítekning.
interface Row {
  id: string; entry_reference: string; booking_date: string | null; amount: number; currency: string | null;
  counterparty: string | null; remittance: string | null; status: string;
  series_code: string | null; voucher_number: string | null; contra_account: string | null;
  suggested_contra: string | null;   // learned counterparty→lykill rule
}
interface BankAcct { account_number: string; name: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ACCOUNT_KEY = "b2b_statement_account";

export default function B2bStatement({ bankAccounts, defaultBank, contraIn, contraOut, configured, defaultAccount }: {
  bankAccounts: BankAcct[]; defaultBank?: string; contraIn?: string; contraOut?: string;
  configured: boolean; defaultAccount?: string;
}) {
  const [account, setAccount] = useState(defaultAccount || "");
  const [ledgerAccount, setLedgerAccount] = useState(defaultBank || bankAccounts[0]?.account_number || "");
  const [from, setFrom] = useState(iso(new Date(Date.now() - 90 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [accountInfo, setAccountInfo] = useState<string>("");
  // Mótlykill pre-fill: the LEARNED rule for the counterparty wins; otherwise the direction
  // default from Samstillingar. The system learns on every booking.
  const defContra = (r: { amount: number; suggested_contra?: string | null }) =>
    r.suggested_contra || ((r.amount >= 0 ? contraIn : contraOut) || "");
  const [contra, setContra] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bulkBooking, setBulkBooking] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Remember the last-used reikningur locally (not sensitive — a 12-digit account number).
  useEffect(() => {
    if (defaultAccount) return;
    try { const s = window.localStorage.getItem(ACCOUNT_KEY); if (s) setAccount(s); } catch { /* */ }
  }, [defaultAccount]);
  useEffect(() => {
    try { if (account.replace(/\D/g, "").length === 12) window.localStorage.setItem(ACCOUNT_KEY, account.replace(/\D/g, "")); } catch { /* */ }
  }, [account]);

  async function loadTransactions() {
    const acc = account.replace(/\D/g, "");
    if (acc.length !== 12) { setErr("Bankareikningur verður að vera 12 tölustafir: útibú (4) + höfuðbók (2) + reikningur (6)."); return; }
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/bankatenging/b2b-statement", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: acc, dateFrom: from, dateTo: to, ledgerAccount }),
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      setRows(d.transactions || []);
      setBalance(typeof d.balance === "number" ? d.balance : null);
      setAccountInfo(d.accountInformation || "");
      setMsg(`Sótti ${d.fetched} færslur (${d.stored} nýjar${d.intraday ? `, ${d.intraday} innandags — skila sér á morgun` : ""}).`);
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
      <div className="flex items-center justify-between mb-1">
        <p className="font-semibold text-sm">Bankayfirlit (B2B)</p>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${configured ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {configured ? "B2B tengt" : "Bridge óvirk"}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Sækir hreyfingar bankareiknings beint úr Arion/RB (B2B) og bókar þær í bókhaldið. Kerfið man mótlykil hvers mótaðila.
      </p>

      {!configured && (
        <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-700">
          B2B Bridge er ekki tengd enn — yfirlit virkar þegar <code>ARION_B2B_ACCOUNTS_URL</code> er stillt (sjá <code>deploy/ARION_B2B_BRIDGE.md</code>).
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Bankareikningur (12 stafir: útibú+hb+nr)</label>
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="t.d. 030326001234"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm tabular-nums w-44" />
        </div>
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
        <button onClick={loadTransactions} disabled={busy || !configured}
          className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">
          {busy ? "Sæki…" : "Sækja hreyfingar"}
        </button>
      </div>

      {(balance !== null || accountInfo) && (
        <p className="mb-3 text-xs text-gray-500">
          {accountInfo && <span>{accountInfo} · </span>}
          {balance !== null && <span>Staða: <b className="tabular-nums">{kr(balance)} kr.</b></span>}
        </p>
      )}

      {err && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">✗ {err}</div>}
      {msg && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700">{msg}</div>}

      {rows && (rows.length === 0 ? (
        <p className="text-sm text-gray-400">Engar hreyfingar á tímabilinu.</p>
      ) : (
        <>
        <table className="w-full text-sm">
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
        Kerfið man mótlykilinn fyrir hvern mótaðila (grænt = lært). Sama færsla bókast aðeins einu sinni; innandagsfærslur skila sér daginn eftir.
      </p>
    </div>
  );
}
