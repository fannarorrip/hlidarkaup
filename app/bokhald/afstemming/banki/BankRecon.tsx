"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { dags, kr, vNr } from "@/lib/format";
import type { ReconEntry } from "@/lib/accounting-queries";

interface Bank { account_number: string; name: string; }
interface OpenRecon { id: string; statement_balance: string | null; cleared: string[]; as_of_date: string; note: string | null; }

export default function BankRecon({ banks, account, acctName, date, entries, ledgerBalance, open }:
  { banks: Bank[]; account: string; acctName: string; date: string; entries: ReconEntry[]; ledgerBalance: number; open: OpenRecon | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (acc: string, d: string) => router.push(`${pathname}?account=${acc}&date=${d}`);

  const [statement, setStatement] = useState<string>(open?.statement_balance ?? "");
  const [cleared, setCleared] = useState<Set<string>>(new Set(open?.cleared ?? []));
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const toggle = (id: string) => setCleared((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allClear = () => setCleared(new Set(entries.map((e) => e.id)));
  const noneClear = () => setCleared(new Set());

  const stmt = Number(statement) || 0;
  const mismunur = ledgerBalance - stmt;
  const unclearedSum = entries.filter((e) => !cleared.has(e.id)).reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0);
  const skyrdur = mismunur - unclearedSum;
  const reconciled = Math.round(skyrdur) === 0 && entries.length > 0;

  async function save(status: "open" | "done") {
    setBusy(status); setMsg("");
    const r = await fetch("/api/afstemming/save", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: open?.id, recon_type: "bank", account_number: account, as_of_date: date, statement_balance: stmt, ledger_balance: ledgerBalance, cleared: [...cleared], status }),
    });
    setBusy("");
    if (!r.ok) { setMsg("Villa við vistun"); return; }
    setMsg(status === "done" ? "Afstemming kláruð ✓" : "Vistað ✓");
    router.refresh();
  }

  const card = "bg-white border border-gray-200 rounded-xl p-4";

  return (
    <div>
      <Link href="/bokhald/afstemming" className="text-sm text-gray-500 hover:underline">← Afstemming</Link>
      <h1 className="text-2xl font-bold mb-1 mt-1 flex items-center gap-2">🏦 Bankaafstemming</h1>
      <p className="text-sm text-gray-500 mb-5">Berðu bókhaldslykilinn saman við bankayfirlitið.</p>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Bankareikningur</span>
          <select value={account} onChange={(e) => go(e.target.value, date)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[16rem]">
            <option value="">— veldu reikning —</option>
            {banks.map((b) => <option key={b.account_number} value={b.account_number}>{b.account_number} — {b.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Miðað við dagsetningu</span>
          <input type="date" value={date} onChange={(e) => go(account, e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Staða skv. bankayfirliti</span>
          <input value={statement} onChange={(e) => setStatement(e.target.value.replace(/[^\d.-]/g, ""))} inputMode="numeric" placeholder="0"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-right w-44" />
        </label>
      </div>

      {!account ? (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-10 text-center text-gray-400">Veldu bankareikning til að hefja afstemmingu.</div>
      ) : (
        <>
          {open && <p className="text-xs text-amber-600 mb-3">Opin afstemming í vinnslu — hlaðin inn (vistuð {dags(open.as_of_date)}).</p>}

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <div className={card}><p className="text-xs text-gray-500">Bókhaldsstaða</p><p className="text-lg font-bold mt-1">{kr(ledgerBalance)}</p></div>
            <div className={card}><p className="text-xs text-gray-500">Staða skv. banka</p><p className="text-lg font-bold mt-1">{kr(stmt)}</p></div>
            <div className={card}><p className="text-xs text-gray-500">Mismunur</p><p className={`text-lg font-bold mt-1 ${Math.round(mismunur) ? "text-red-600" : ""}`}>{kr(mismunur)}</p></div>
            <div className={card}><p className="text-xs text-gray-500">Óstemmdar færslur</p><p className="text-lg font-bold mt-1">{kr(unclearedSum)}</p></div>
            <div className={`${card} ${reconciled ? "border-green-300 bg-green-50/40" : ""}`}>
              <p className="text-xs text-gray-500">Skýrður mismunur</p>
              <p className={`text-lg font-bold mt-1 ${reconciled ? "text-green-700" : "text-red-600"}`}>{kr(skyrdur)}</p>
            </div>
          </div>

          {reconciled && <p className="text-sm text-green-700 mb-3">✓ Stemmir — mismunurinn skýrist af óstemmdum færslum.</p>}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button onClick={allClear} className="text-sm text-gray-600 hover:underline">Merkja allt stemmt</button>
            <button onClick={noneClear} className="text-sm text-gray-600 hover:underline">Afmerkja allt</button>
            <span className="text-xs text-gray-400">{cleared.size}/{entries.length} stemmt</span>
            <div className="flex-1" />
            <button onClick={() => save("open")} disabled={!!busy} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50">{busy === "open" ? "Vista…" : "Vista drög"}</button>
            <button onClick={() => save("done")} disabled={!!busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">{busy === "done" ? "…" : "Ljúka afstemmingu"}</button>
            {msg && <span className="text-sm text-green-700">{msg}</span>}
          </div>

          {/* Entries */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium w-16 text-center">Stemmt</th>
                  <th className="px-3 py-2 font-medium">Dags.</th>
                  <th className="px-3 py-2 font-medium">Fylgiskjal</th>
                  <th className="px-3 py-2 font-medium">Lýsing</th>
                  <th className="px-3 py-2 font-medium text-right">Debet</th>
                  <th className="px-3 py-2 font-medium text-right">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Engar færslur á lyklinum til {dags(date)}</td></tr>
                ) : entries.map((e) => {
                  const on = cleared.has(e.id);
                  return (
                    <tr key={e.id} className={`border-t border-gray-100 ${on ? "bg-green-50/40" : ""}`}>
                      <td className="px-3 py-2 text-center"><input type="checkbox" checked={on} onChange={() => toggle(e.id)} className="accent-green-600" /></td>
                      <td className="px-3 py-2 text-gray-600">{dags(e.voucher_date)}</td>
                      <td className="px-3 py-2"><Link href={`/bokhald/fylgiskjol/${e.voucher_id}`} className="font-mono text-red-700 hover:underline">{vNr(e.series_code, e.voucher_number)}</Link></td>
                      <td className="px-3 py-2 text-gray-600">{e.line_description || e.description}</td>
                      <td className="px-3 py-2 text-right">{Number(e.debit) ? kr(e.debit) : ""}</td>
                      <td className="px-3 py-2 text-right">{Number(e.credit) ? kr(e.credit) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
