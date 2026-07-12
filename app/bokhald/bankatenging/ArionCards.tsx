"use client";
import { useState, useEffect } from "react";
import { dags } from "@/lib/format";

interface Card { id: string; name?: string; maskedNumber?: string; holder?: string; available?: number }
interface Tx { id: string; date: string; amount: number; currency?: string; description?: string; merchant?: string; suggestedAccount?: string }

export default function ArionCards({ defaultLiability = "9310", defaultExpense, sandbox = false, serverReady = false }: { defaultLiability?: string; defaultExpense?: string; sandbox?: boolean; serverReady?: boolean }) {
  const [token, setToken] = useState("");
  // Token paste + persistence are SANDBOX affordances; production runs on server env (mTLS OAuth).
  useEffect(() => { if (!sandbox) return; try { const t = window.localStorage.getItem("arion_cards_token"); if (t) setToken(t); } catch { /* */ } }, [sandbox]);
  useEffect(() => { if (sandbox) try { window.localStorage.setItem("arion_cards_token", token); } catch { /* */ } }, [token, sandbox]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [cardId, setCardId] = useState("");
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);
  const [debitAcct, setDebitAcct] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookMsg, setBookMsg] = useState("");
  // Per-transaction categorization: tick which to book + a lykill per row (pre-filled from
  // the learned rules; falls back to the shared default below).
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [rowAcct, setRowAcct] = useState<Record<string, string>>({});
  useEffect(() => { try { const v = window.localStorage.getItem("arion_card_debit"); if (v) setDebitAcct(v); else if (defaultExpense) setDebitAcct(defaultExpense); } catch { /* */ } }, []);
  useEffect(() => { try { window.localStorage.setItem("arion_card_debit", debitAcct); } catch { /* */ } }, [debitAcct]);

  const selected = (txs ?? []).filter((t) => sel[t.id]);

  async function book() {
    if (!selected.length) return;
    setBooking(true); setBookMsg("");
    const card = cards.find((c) => c.id === cardId) || cards[0];
    try {
      const r = await fetch("/api/bankatenging/cards/book", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transactions: selected.map((t) => ({ ...t, debitAccount: (rowAcct[t.id] || debitAcct).trim() })),
          debitAccount: debitAcct.trim(), liabilityAccount: defaultLiability, maskedPan: card?.maskedNumber,
        }),
      });
      const d = await r.json();
      if (!d.ok) { setBookMsg("✗ " + (d.message || "Villa")); return; }
      setBookMsg(`✓ Bókaði ${d.booked} færslur${d.skipped ? ` (${d.skipped} áður bókaðar)` : ""}${d.errors?.length ? ` · ${d.errors.length} villa/villur` : ""}`);
      setSel({});
    } catch (e) { setBookMsg("✗ " + (e instanceof Error ? e.message : "Villa")); }
    finally { setBooking(false); }
  }

  async function load(cid?: string) {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/bankatenging/cards", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.trim(), cardId: cid }),
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); setTxs(null); return; }
      const list: Tx[] = d.transactions || [];
      setCards(d.cards || []); setCardId(d.cardId || ""); setTxs(list); setTxErr(d.txError || null);
      // select everything by default; pre-fill each row's lykill from the learned rules
      setSel(Object.fromEntries(list.map((t) => [t.id, true])));
      setRowAcct(Object.fromEntries(list.filter((t) => t.suggestedAccount).map((t) => [t.id, t.suggestedAccount as string])));
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  const kr = (n: number) => Math.round(n).toLocaleString("is-IS");
  const shown = cards.find((c) => c.id === cardId) || cards[0];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="font-semibold text-sm mb-1">Kortafærslur (Cards API)</p>
      <p className="text-xs text-gray-500 mb-3">
        Sækir fyrirtækjakortin og færslur þeirra frá Arion og bókar þær í bókhaldið.
      </p>
      {sandbox && (
        <>
          <p className="text-[11px] text-amber-600 mb-2">SANDKASSI · Sæktu aðgangslykil í <a href="https://developer.arionbanki.is" target="_blank" rel="noopener" className="underline">þróunargáttinni</a> („Generate Token“, rennur út eftir ~1 klst.).</p>
          <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} placeholder="Límdu Arion aðgangslykil (Generate Token)…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-red-400 mb-3" />
        </>
      )}
      {!sandbox && !serverReady && (
        <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-700">
          Kortatenging ekki tilbúin — vantar skilríki eða lykla á þjóninum (sjá Tengingar-flipann).
        </div>
      )}
      <button onClick={() => load()} disabled={busy || (sandbox ? !token.trim() : !serverReady)}
        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
        {busy ? "Sæki…" : "Sækja kortafærslur"}
      </button>

      {err && <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">✗ {err}</div>}

      {cards.length > 1 && (
        <select value={cardId} onChange={(e) => { setCardId(e.target.value); load(e.target.value); }}
          className="mt-3 border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          {cards.map((c) => <option key={c.id} value={c.id}>{c.name || c.maskedNumber || c.id}{c.maskedNumber ? ` · ${c.maskedNumber}` : ""}</option>)}
        </select>
      )}

      {shown && (
        <div className="mt-3 flex items-baseline justify-between bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm">
          <span>✓ <span className="font-semibold">{shown.name || "Kort"}</span> <span className="text-gray-400">{shown.maskedNumber}</span>{shown.holder && <span className="text-gray-400"> · {shown.holder}</span>}</span>
          {shown.available != null && <span className="tabular-nums text-gray-600">{kr(shown.available)} kr. laust</span>}
        </div>
      )}

      {txErr && <p className="mt-2 text-xs text-amber-600">Kortafærslur: {txErr}</p>}
      {txs && txs.length > 0 && (
        <div className="overflow-x-auto mt-3">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="text-gray-400 text-left text-xs">
            <tr>
              <th className="py-1 w-8">
                <input type="checkbox" checked={selected.length === txs.length && txs.length > 0}
                  onChange={(e) => setSel(Object.fromEntries(txs.map((t) => [t.id, e.target.checked])))} aria-label="Velja allar" />
              </th>
              <th className="py-1 font-medium">Dags.</th><th className="py-1 font-medium">Lýsing</th>
              <th className="py-1 font-medium">Lykill</th><th className="py-1 font-medium text-right">Upphæð</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t, i) => (
              <tr key={t.id || i} className={`border-t border-gray-100 ${sel[t.id] ? "" : "opacity-50"}`}>
                <td className="py-1">
                  <input type="checkbox" checked={!!sel[t.id]} onChange={(e) => setSel((p) => ({ ...p, [t.id]: e.target.checked }))} aria-label="Velja" />
                </td>
                <td className="py-1 text-gray-500 tabular-nums">{dags(t.date)}</td>
                <td className="py-1">{t.merchant || t.description || "—"}</td>
                <td className="py-1">
                  <input
                    value={rowAcct[t.id] ?? ""}
                    onChange={(e) => setRowAcct((p) => ({ ...p, [t.id]: e.target.value }))}
                    placeholder={debitAcct || "lykill"}
                    className={`w-24 border rounded-lg px-2 py-1 text-sm tabular-nums ${t.suggestedAccount && rowAcct[t.id] === t.suggestedAccount ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200"}`}
                    title={t.suggestedAccount ? "Lært af fyrri bókunum" : undefined}
                  />
                </td>
                <td className="py-1 text-right tabular-nums">{kr(t.amount)}{t.currency && t.currency !== "ISK" ? ` ${t.currency}` : " kr."}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {txs && txs.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">Bóka í bókhald</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={debitAcct}
              onChange={(e) => setDebitAcct(e.target.value)}
              placeholder="Sjálfgefinn gjaldalykill, t.d. 2100"
              className="w-56 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <span className="text-xs text-gray-400">→ {defaultLiability} skuld (kredit)</span>
            <button
              onClick={book}
              disabled={booking || !selected.length || (!debitAcct.trim() && selected.some((t) => !(rowAcct[t.id] || "").trim()))}
              className="px-4 py-1.5 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-40"
            >
              {booking ? "Bóka…" : `Bóka valdar (${selected.length})`}
            </button>
          </div>
          {bookMsg && (
            <p className={`mt-2 text-sm ${bookMsg.startsWith("✓") ? "text-green-700" : "text-red-700"}`}>{bookMsg}</p>
          )}
          <p className="mt-1 text-[11px] text-gray-400">
            Hver færsla bókast: Debet lykill línunnar (eða sjálfgefni lykillinn) / Kredit {defaultLiability}. Kerfið man lykilinn
            fyrir hvern söluaðila og fyllir hann sjálfkrafa næst. Sama færsla tvíbókast ekki.
          </p>
        </div>
      )}
    </div>
  );
}
