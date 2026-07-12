"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { kr } from "@/lib/format";
import type { DailySettlement } from "@/lib/accounting-queries";
import type { ZReport } from "@/lib/z-report";

export default function KassaSettlement({ date, s, z }: { date: string; s: DailySettlement; z: ZReport | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [counted, setCounted] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const locked = !!z;

  const n = (x: string) => Number(x) || 0;
  const cash = n(s.cash), card = n(s.card), transfer = n(s.transfer), account = n(s.account);
  const totalMoney = cash + card + transfer + account;
  const veltaNet = n(s.velta24) + n(s.velta11) + n(s.velta0);
  const countedN = Number(counted.replace(/\D/g, "")) || 0;
  const mismunur = countedN - cash;

  async function close() {
    if (!window.confirm("Loka deginum? Z-skýrslan verður læst og ekki hægt að breyta.")) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/kassauppgjor/close", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, counted: counted === "" ? null : countedN }),
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Villa"); return; }
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(false); }
  }

  const Metric = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
    </div>
  );
  const Row = ({ label, value }: { label: string; value: number }) => (
    <div className="flex justify-between px-4 py-2.5 border-t border-gray-100 first:border-t-0">
      <span className="text-gray-600">{label}</span><span className="font-medium tabular-nums">{kr(value)}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">🧾 Kassauppgjör
          {locked && <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-50 text-green-700">🔒 Lokað · Z-{z!.z_number}</span>}
        </h1>
        <input type="date" value={date} onChange={(e) => router.push(`${pathname}?date=${e.target.value}`)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-red-400" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Heildarvelta (án VSK)" value={kr(veltaNet)} />
        <Metric label="Útskattur" value={kr(n(s.output_vat))} />
        <Metric label="Innborgað alls" value={kr(totalMoney)} />
        <Metric label="Sölur / skil" value={`${s.sale_count} / ${s.return_count}`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-600">Greiðslumáti</p>
          <Row label="Reiðufé" value={cash} />
          <Row label="Kort" value={card} />
          <Row label="Símgreiðsla" value={transfer} />
          <Row label="Á reikning" value={account} />
          <div className="flex justify-between px-4 py-2.5 border-t-2 border-gray-200 font-semibold"><span>Samtals</span><span className="tabular-nums">{kr(totalMoney)}</span></div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-600">Velta eftir þrepi (án VSK)</p>
          <Row label="24% þrep" value={n(s.velta24)} />
          <Row label="11% þrep" value={n(s.velta11)} />
          <Row label="0% / undanþegið" value={n(s.velta0)} />
          <div className="flex justify-between px-4 py-2.5 border-t-2 border-gray-200 font-semibold"><span>Samtals</span><span className="tabular-nums">{kr(veltaNet)}</span></div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-md">
        <p className="text-sm font-semibold text-gray-600 mb-3">Sjóðstalning</p>
        <div className="flex justify-between mb-2"><span className="text-gray-500">Væntanlegt reiðufé</span><b className="tabular-nums">{kr(cash)}</b></div>
        {locked ? (
          <>
            <div className="flex justify-between mb-2"><span className="text-gray-500">Talið í skúffu</span><b className="tabular-nums">{z!.cash_counted == null ? "—" : kr(z!.cash_counted)}</b></div>
            {z!.cash_diff != null && (
              <div className="flex justify-between border-t border-gray-100 pt-2"><span className="text-gray-500">Mismunur</span>
                <b className={`tabular-nums ${Math.abs(z!.cash_diff) < 1 ? "text-green-700" : "text-rose-600"}`}>{kr(z!.cash_diff)}</b></div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500">Talið í skúffu</span>
              <input inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-right outline-none focus:border-red-400" />
            </div>
            {counted !== "" && (
              <div className="flex justify-between border-t border-gray-100 pt-2 mb-3"><span className="text-gray-500">Mismunur</span>
                <b className={`tabular-nums ${Math.abs(mismunur) < 1 ? "text-green-700" : "text-rose-600"}`}>{kr(mismunur)}</b></div>
            )}
            <button onClick={close} disabled={busy} className="w-full mt-3 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">
              {busy ? "Loka…" : "🔒 Loka degi (Z-skýrsla)"}
            </button>
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
          </>
        )}
      </div>
      <p className="text-xs text-gray-400">
        {locked
          ? `Lokað ${new Date(z!.closed_at).toLocaleString("is-IS")} · Z-${z!.z_number}. Tölur eru frystar — sölur dagsins eru þegar bókaðar.`
          : "Bráðabirgða-uppgjör reiknað úr bókuðum sölum dagsins. Þegar dagurinn er lokaður frystist Z-skýrslan."}
      </p>
    </div>
  );
}
