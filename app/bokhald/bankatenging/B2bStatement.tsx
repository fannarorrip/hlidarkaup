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
  suggested_contra: string | null;   // learned counterparty→lykill rule (eða mynstur: Straumur→7716 o.fl.)
  matched_series: string | null; matched_number: string | null;   // parað við þegar bókað fylgiskjal
  sug_voucher_id: string | null; sug_series: string | null; sug_number: string | null;
  sug_date: string | null; sug_desc: string | null; sug_candidates: number | null;  // pörunartillaga
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

  /** Para línu við ÞEGAR bókað fylgiskjal (t.d. greidda innheimtukröfu) — engin ný bókun. */
  async function pairOne(row: Row): Promise<boolean> {
    if (!row.sug_voucher_id) return false;
    const r = await fetch("/api/bankatenging/statement/match", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ bankTxId: row.id, voucherId: row.sug_voucher_id }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.message || "Villa");
    setRows((prev) => prev?.map((x) => x.id === row.id
      ? { ...x, status: "matched", matched_series: d.voucher?.series_code ?? row.sug_series, matched_number: d.voucher?.voucher_number ?? row.sug_number }
      : x) ?? null);
    return true;
  }

  async function pair(row: Row) {
    setBookingId(row.id); setErr(""); setMsg("");
    try { await pairOne(row); setMsg("✓ Parað — engin ný bókun (var þegar í bókhaldinu)."); }
    catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBookingId(null); }
  }

  async function unpair(row: Row) {
    setBookingId(row.id); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/bankatenging/statement/match", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bankTxId: row.id, undo: true }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message || "Villa");
      setRows((prev) => prev?.map((x) => x.id === row.id ? { ...x, status: "unmatched", matched_series: null, matched_number: null } : x) ?? null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBookingId(null); }
  }

  /** Para allar línur með ótvíræða tillögu (nákvæmlega eitt fylgiskjal kom til greina). */
  async function pairObvious() {
    const targets = (rows ?? []).filter((r) => r.status === "unmatched" && r.sug_voucher_id && r.sug_candidates === 1);
    if (!targets.length) return;
    setBulkBooking(true); setErr(""); setMsg("");
    let ok = 0;
    for (const row of targets) { try { if (await pairOne(row)) ok++; } catch { /* næsta */ } }
    setMsg(`✓ Paraði ${ok} af ${targets.length} — þessar innborganir voru þegar bókaðar (kröfur/millifærslur).`);
    setBulkBooking(false);
  }

  /** AI stingur upp á mótlyklum fyrir línur sem hvorki lærð regla né pörun skýrir. */
  const [aiBusy, setAiBusy] = useState(false);
  async function aiSuggest() {
    const targets = (rows ?? []).filter((r) => r.status === "unmatched" && !r.sug_voucher_id && !r.suggested_contra && !(contra[r.id] ?? "").trim());
    if (!targets.length) { setMsg("Allar óbókaðar línur eru þegar með tillögu."); return; }
    setAiBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/bankatenging/statement/ai-suggest", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: targets.map((t) => t.id) }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message || "Villa");
      const got = Object.keys(d.suggestions ?? {}).length;
      setContra((p) => ({ ...d.suggestions, ...p }));
      setMsg(`🤖 AI stakk upp á mótlykli fyrir ${got} af ${targets.length} línum — yfirfarðu og bókaðu.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setAiBusy(false); }
  }

  /** Book every ticked, unbooked row with its own mótlykill — one by one, stopping on errors. */
  async function bookSelected() {
    const targets = (rows ?? []).filter((r) => sel[r.id] && r.status === "unmatched");
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

      {rows && rows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {rows.some((r) => r.status === "unmatched" && r.sug_voucher_id && r.sug_candidates === 1) && (
            <button onClick={pairObvious} disabled={bulkBooking || bookingId !== null}
              className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-40">
              ≡ Para augljósar ({rows.filter((r) => r.status === "unmatched" && r.sug_voucher_id && r.sug_candidates === 1).length}) — þegar bókaðar
            </button>
          )}
          {rows.some((r) => r.status === "unmatched" && !r.sug_voucher_id && !r.suggested_contra && !(contra[r.id] ?? "").trim()) && (
            <button onClick={aiSuggest} disabled={aiBusy || bulkBooking}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40">
              {aiBusy ? "AI hugsar…" : "🤖 AI-tillögur á mótlykla"}
            </button>
          )}
        </div>
      )}

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
                  checked={rows.filter((r) => r.status === "unmatched").length > 0 && rows.filter((r) => r.status === "unmatched").every((r) => sel[r.id])}
                  onChange={(e) => setSel(Object.fromEntries(rows.filter((r) => r.status === "unmatched").map((r) => [r.id, e.target.checked])))}
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
                    {r.status === "unmatched" && (
                      <input type="checkbox" checked={!!sel[r.id]} onChange={(e) => setSel((p) => ({ ...p, [r.id]: e.target.checked }))} aria-label="Velja" />
                    )}
                  </td>
                  <td className="py-1.5 text-gray-500 tabular-nums whitespace-nowrap">{dags(r.booking_date)}</td>
                  <td className="py-1.5">
                    {r.counterparty || "—"}
                    {r.remittance && <span className="block text-[11px] text-gray-400">{r.remittance}</span>}
                    {r.status === "unmatched" && r.sug_voucher_id && (
                      <span className="block text-[11px] text-sky-700 mt-0.5">
                        ≡ Stemmir líklega við {vNr(r.sug_series, r.sug_number)} ({dags(r.sug_date)}{r.sug_desc ? ` · ${r.sug_desc.slice(0, 40)}` : ""})
                        {(r.sug_candidates ?? 1) > 1 && <span className="text-amber-600"> · {r.sug_candidates} koma til greina</span>}
                      </span>
                    )}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums whitespace-nowrap ${inbound ? "text-green-700" : "text-gray-700"}`}>
                    {inbound ? "+" : "−"}{kr(Math.abs(r.amount))} kr.
                  </td>
                  <td className="py-1.5">
                    {r.status === "booked" ? (
                      <span className="text-xs text-green-700">✓ {vNr(r.series_code, r.voucher_number)}</span>
                    ) : r.status === "matched" ? (
                      <span className="text-xs text-sky-700" title="Innborgunin var þegar bókuð (t.d. greidd krafa) — pöruð, ekki bókuð aftur">
                        ≡ {vNr(r.matched_series, r.matched_number)}
                        <button onClick={() => unpair(r)} disabled={bookingId !== null || bulkBooking}
                          className="ml-1.5 text-[10px] text-gray-400 hover:text-red-600 underline">aftengja</button>
                      </span>
                    ) : (
                      <input value={contra[r.id] ?? defContra(r)} onChange={(e) => setContra((p) => ({ ...p, [r.id]: e.target.value }))}
                        placeholder={inbound ? "t.d. 7600" : "t.d. 9300"}
                        title={r.suggested_contra ? "Lært af fyrri bókunum / þekkt mynstur" : undefined}
                        className={`w-24 border rounded px-2 py-1 text-xs tabular-nums ${r.suggested_contra && (contra[r.id] ?? defContra(r)) === r.suggested_contra ? "border-emerald-300 bg-emerald-50/50" : "border-gray-300"}`} />
                    )}
                  </td>
                  <td className="py-1.5 whitespace-nowrap">
                    {r.status === "unmatched" && r.sug_voucher_id && (
                      <button onClick={() => pair(r)} disabled={bookingId !== null || bulkBooking}
                        title="Innborgunin er þegar í bókhaldinu — tengja hana við fylgiskjalið í stað þess að bóka aftur"
                        className="mr-1.5 px-3 py-1 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-40">{bookingId === r.id ? "…" : "Para"}</button>
                    )}
                    {r.status === "unmatched" && (
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
        {rows.some((r) => sel[r.id] && r.status === "unmatched") && (
          <button onClick={bookSelected} disabled={bulkBooking || bookingId !== null}
            className="mt-3 px-4 py-1.5 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-40">
            {bulkBooking ? "Bóka…" : `Bóka valdar (${rows.filter((r) => sel[r.id] && r.status === "unmatched").length})`}
          </button>
        )}
        </>
      ))}

      <p className="mt-3 text-[11px] text-gray-400">
        Innborgun (+) bókast: Debet bankalykill / Kredit mótlykill (t.d. 7600 viðskiptakröfur). Úttekt (−): Debet mótlykill / Kredit bankalykill (t.d. 9300 lánardrottnar).
        Kerfið man mótlykilinn fyrir hvern mótaðila (grænt = lært). Sama færsla bókast aðeins einu sinni; innandagsfærslur skila sér daginn eftir.
        <span className="block mt-0.5">≡ = innborgunin var <b>þegar bókuð</b> annars staðar (greidd innheimtukrafa, millifærslusala af kassa) — hún parast við fylgiskjalið í stað þess að bókast aftur, svo ekkert kemur tvisvar inn. Útborgun Straums bókast á 7716 (kort á leiðinni) — afgangurinn á 7716 er þóknun Straums.</span>
      </p>
    </div>
  );
}
