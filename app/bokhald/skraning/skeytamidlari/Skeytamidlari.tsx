"use client";
import { useEffect, useState } from "react";
import { dags, kr } from "@/lib/format";

// Yfirlit skeytamiðlarans: listinn kemur LIFANDI frá inExchange (GetTransactionList) og hver
// færsla borin saman við pósthólfið. „Vantar" og „Villa" má sækja/endurreyna beint héðan.
interface Row {
  uuid: string; local: "vantar" | "pending" | "approved" | "rejected" | "skipped" | "error";
  supplier: string | null; subject: string | null; total: number | null; error: string | null;
  received_at: string | null;
}

const BADGE: Record<Row["local"], { label: string; cls: string }> = {
  vantar:   { label: "VANTAR",       cls: "bg-red-100 text-red-700" },
  error:    { label: "Villa",        cls: "bg-amber-100 text-amber-700" },
  pending:  { label: "Í pósthólfi",  cls: "bg-blue-50 text-blue-700" },
  approved: { label: "Bókaður",      cls: "bg-green-100 text-green-700" },
  rejected: { label: "Hafnað",       cls: "bg-gray-100 text-gray-500" },
  skipped:  { label: "Sleppt",       cls: "bg-gray-100 text-gray-500" },
};

export default function Skeytamidlari() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setBusy("load"); setErr("");
    try {
      const r = await fetch("/api/inexchange/skeytamidlari");
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "Villa"); setRows(d.rows ?? []); return; }
      setRows(d.rows ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(null); }
  }
  useEffect(() => { load(); }, []);

  async function fetchOne(uuid: string) {
    setBusy(uuid); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/inexchange/skeytamidlari", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uuid }),
      });
      const d = await r.json();
      if (d.created) setMsg("✓ Sóttur — kominn í pósthólfið og móttöku-biðröðina.");
      else if (d.ok) setMsg(d.reason || "Var þegar til.");
      else setErr(`Innlestur mistókst: ${d.error || "villa"} — villuröð með XML-inu er komin í pósthólfið.`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); setBusy(null); }
  }

  async function fetchAll() {
    setBusy("all"); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/inexchange/skeytamidlari", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }),
      });
      const d = await r.json();
      if (!d.ok) setErr(d.error || "Villa");
      else setMsg(`✓ Sótti ${d.created} af ${d.checked}${d.failed ? ` — ${d.failed} með villu (sjá villuraðir í pósthólfinu)` : ""}.`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); setBusy(null); }
  }

  const missing = (rows ?? []).filter((r) => r.local === "vantar" || r.local === "error");

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={load} disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">
          {busy === "load" ? "Sæki lista…" : "↻ Endurhlaða lista"}
        </button>
        {missing.length > 0 && (
          <button onClick={fetchAll} disabled={busy !== null}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50">
            {busy === "all" ? "Sæki…" : `Sækja alla sem vantar (${missing.length})`}
          </button>
        )}
        {rows && <span className="text-xs text-gray-400">{rows.length} hjá miðlaranum · {missing.length} vantar/villa</span>}
      </div>

      {err && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">✗ {err}</div>}
      {msg && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700">{msg}</div>}

      {rows === null ? (
        <p className="text-sm text-gray-400">Sæki listann frá inExchange…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">Skeytamiðlarinn skilaði engum reikningum.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2 font-semibold">Staða</th>
                <th className="px-4 py-2 font-semibold">Birgir / skjal</th>
                <th className="px-4 py-2 font-semibold text-right">Upphæð</th>
                <th className="px-4 py-2 font-semibold">Móttekið</th>
                <th className="px-4 py-2 font-semibold">Færsla (UUID)</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uuid} className={`border-t border-gray-100 ${r.local === "vantar" ? "bg-red-50/40" : ""}`}>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${BADGE[r.local].cls}`}>{BADGE[r.local].label}</span>
                  </td>
                  <td className="px-4 py-2">
                    {r.supplier || <span className="text-gray-300">—</span>}
                    {r.subject && <span className="block text-[11px] text-gray-400">{r.subject}</span>}
                    {r.error && <span className="block text-[11px] text-amber-700">{r.error}</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{r.total != null ? kr(r.total) : "—"}</td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{r.received_at ? dags(r.received_at) : "—"}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-gray-400">{r.uuid.slice(0, 13)}…</td>
                  <td className="px-4 py-2 text-right">
                    {(r.local === "vantar" || r.local === "error") && (
                      <button onClick={() => fetchOne(r.uuid)} disabled={busy !== null}
                        className="px-3 py-1 rounded-lg bg-[#21323A] text-white text-xs font-semibold hover:bg-[#2C687B] disabled:opacity-40">
                        {busy === r.uuid ? "Sæki…" : r.local === "error" ? "Reyna aftur" : "Sækja"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-gray-400">
        Listinn kemur beint frá inExchange í hverri hleðslu. „VANTAR" = reikningurinn liggur hjá miðlaranum en er hvergi í kerfinu —
        „Sækja" les hann inn í pósthólfið (og móttöku-biðröðina). Reikningar sem klikka í innlestri fá gula villuröð með XML-inu
        í pósthólfinu í stað þess að hverfa — „Reyna aftur" endursækir þá.
      </p>
    </div>
  );
}
