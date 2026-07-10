"use client";
import { useEffect, useRef, useState } from "react";

// Fljótandi hjálpari (Claude) neðst í hægra horni — litlar spurningar um reksturinn.
interface Msg { role: "user" | "assistant"; content: string }

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && enabled === null) {
      fetch("/api/assistant").then((r) => r.json()).then((j) => setEnabled(!!j.enabled)).catch(() => setEnabled(false));
    }
  }, [open, enabled]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const j = await r.json();
      setMsgs((p) => [...p, { role: "assistant", content: j.ok ? j.reply : `⚠️ ${j.message || "Villa"}` }]);
    } catch {
      setMsgs((p) => [...p, { role: "assistant", content: "⚠️ Villa við tengingu." }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} title="Hjálpari"
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-[#2C687B] text-white shadow-lg shadow-[#2C687B]/30 hover:bg-[#245867] flex items-center justify-center text-2xl">
          💬
        </button>
      )}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(400px,calc(100vw-2.5rem))] h-[560px] max-h-[calc(100vh-2.5rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-[#2C687B] text-white flex items-center justify-between">
            <div>
              <p className="font-bold text-sm">Hjálpari</p>
              <p className="text-[11px] text-[#B9DEDB]">Litlar spurningar um reksturinn</p>
            </div>
            <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg hover:bg-white/15 text-lg">×</button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {enabled === false && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">Hjálpari er ekki virkur — <code>ANTHROPIC_API_KEY</code> vantar í stillingar.</p>
            )}
            {enabled !== false && msgs.length === 0 && (
              <div className="text-sm text-gray-500">
                <p className="mb-2">Spurðu mig um t.d.:</p>
                <div className="space-y-1.5">
                  {["Hvað þarf ég að muna í dag?", "Hvenær er næsti VSK-skiladagur?", "Hvernig bóka ég innkaupareikning?"].map((s) => (
                    <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="block w-full text-left px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-[#2C687B] text-xs">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-[#2C687B] text-white" : "bg-white border border-gray-200 text-gray-800"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <div className="flex justify-start"><div className="rounded-2xl px-3.5 py-2 bg-white border border-gray-200 text-gray-400 text-sm">…</div></div>}
          </div>

          <div className="p-3 border-t border-gray-100 flex items-end gap-2">
            <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Skrifaðu spurningu…" disabled={enabled === false}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm max-h-28 outline-none focus:border-[#2C687B]" />
            <button onClick={send} disabled={busy || !input.trim() || enabled === false}
              className="px-4 py-2 rounded-xl bg-[#DB1A1A] text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">Senda</button>
          </div>
        </div>
      )}
    </>
  );
}
