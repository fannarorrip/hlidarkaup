"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

// Reikningar úr pósthólfinu (inExchange + tölvupóstur) — einn hnappur dregur reikning beint í
// móttökudrög: XML les línurnar beint, PDF fer í AI-lesarann.
interface Row {
  id: string; received_at: string; supplier: string; subject: string | null;
  attachment_name: string | null; is_xml: boolean; total: number | null;
  source: "inexchange" | "email"; status: string;
}

export default function MottakaInbox() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [pollMsg, setPollMsg] = useState("");

  const reload = () => fetch("/api/innkaup/inbox").then((r) => r.json()).then((d) => setRows(d.rows ?? [])).catch(() => setRows([]));
  useEffect(() => { reload(); }, []);

  // Sækja beint héðan — sömu leiðir og pósthólfið notar, svo enginn þarf að skipta um síðu
  // til að ná í nýjustu reikningana áður en móttakan hefst.
  async function poll(kind: "email" | "inexchange") {
    setBusy("poll"); setErr(""); setPollMsg("");
    try {
      const r = await fetch(kind === "email" ? "/api/skraning/email/poll" : "/api/inexchange/poll", { method: "POST" });
      const d = await r.json();
      if (!r.ok || d.ok === false) { setErr(d.message || d.error || "Tókst ekki að sækja"); return; }
      const ny = kind === "email" ? d.pending : d.created;
      setPollMsg(`${kind === "email" ? "Tölvupóstur" : "inExchange"} — skoðað: ${d.checked} · nýir reikningar: ${ny ?? 0}${d.errors ? ` · villur: ${d.errors}` : ""}`);
      await reload();
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setBusy(null); }
  }

  async function toReceipt(id: string) {
    setBusy(id); setErr("");
    try {
      const r = await fetch(`/api/innkaup/inbox/${id}/to-receipt`, { method: "POST" });
      const d = await r.json();
      if (!r.ok && !d.receiptId) { setErr(d.error ?? "Villa"); setBusy(null); return; }
      router.push(`/bokhald/solukerfi/innkaup/mottaka/${d.receiptId}`);
    } catch {
      setErr("Villa við að flytja reikning í móttöku"); setBusy(null);
    }
  }

  async function dismiss(id: string) {
    setBusy(id); setErr("");
    try {
      const r = await fetch(`/api/innkaup/inbox/${id}/dismiss`, { method: "POST" });
      if (r.ok) setRows((p) => (p ?? []).filter((x) => x.id !== id));
      else setErr("Tókst ekki að henda");
    } catch { setErr("Tókst ekki að henda"); }
    setBusy(null);
  }

  return (
    <div className="mb-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-[#F0F7F6] flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700">
          Úr pósthólfinu — reikningar sem má draga beint í móttöku ({rows?.length ?? "…"})
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => poll("email")} disabled={busy === "poll"}
            className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">
            {busy === "poll" ? "Sæki…" : "↻ Sækja tölvupóst"}
          </button>
          <button onClick={() => poll("inexchange")} disabled={busy === "poll"}
            className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">
            {busy === "poll" ? "Sæki…" : "↻ Sækja frá inExchange"}
          </button>
        </div>
      </div>
      {pollMsg && <p className="px-4 py-1.5 text-xs text-green-700 border-b border-gray-100">{pollMsg}</p>}
      {(!rows || rows.length === 0) && <p className="px-4 py-3 text-sm text-gray-400">{rows === null ? "Sæki biðröðina…" : "Ekkert í biðröðinni — sæktu að ofan ef von er á reikningum."}</p>}
      <div className="divide-y divide-gray-100">
        {(rows ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.source === "inexchange" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {r.source === "inexchange" ? "inExchange" : "Tölvupóstur"}
            </span>
            {r.status === "approved" && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700" title="Reikningurinn er þegar bókaður — móttakan telur bara inn birgðir og uppfærir verð">
                Bókaður
              </span>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{r.supplier}</p>
              <p className="text-xs text-gray-400 truncate">
                {new Date(r.received_at).toLocaleDateString("is-IS")}{r.subject ? ` · ${r.subject}` : ""}{r.attachment_name ? ` · ${r.attachment_name}` : ""}
              </p>
            </div>
            {r.total != null && <span className="text-sm font-medium tabular-nums whitespace-nowrap">{kr(Number(r.total))}</span>}
            <span className="text-[10px] text-gray-400 w-8 text-center">{r.is_xml ? "XML" : "PDF"}</span>
            <button onClick={() => toReceipt(r.id)} disabled={busy !== null}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#21323A] text-white text-xs font-semibold hover:bg-[#2C687B] disabled:opacity-40">
              {busy === r.id ? "Les…" : "Í móttöku →"}
            </button>
            <button onClick={() => dismiss(r.id)} disabled={busy !== null} title="Henda úr þessari biðröð (snertir ekki pósthólfið)"
              className="shrink-0 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-400 text-xs hover:text-red-600 hover:border-red-200 disabled:opacity-40">
              Henda
            </button>
          </div>
        ))}
      </div>
      {err && <p className="px-4 py-2 text-sm text-red-600 border-t border-gray-100">{err}</p>}
    </div>
  );
}
