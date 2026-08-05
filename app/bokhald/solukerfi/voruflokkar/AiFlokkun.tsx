"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// AI-flokkun í lotum: hnappurinn kallar á /api/products/ai-flokkun þar til engin framvinda
// verður (allt flokkað, eða aðeins óvissu-vörurnar eftir — þær eru handflokkaðar).
export default function AiFlokkun({ unclassified }: { unclassified: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const stop = useRef(false);

  async function run() {
    setRunning(true); setErr(""); setMsg(""); stop.current = false;
    let done = 0, skipped = 0;
    try {
      for (let round = 0; round < 200 && !stop.current; round++) {
        const r = await fetch("/api/products/ai-flokkun", { method: "POST" });
        const d = await r.json();
        if (!r.ok) { setErr(d.error ?? "Villa"); break; }
        done += d.classified; skipped += d.skipped;
        setMsg(`Flokkaðar ${done} vörur… ${d.remaining} eftir${skipped ? ` (${skipped} óvissar)` : ""}`);
        if (d.remaining === 0 || d.classified === 0) {
          setMsg(`Búið: ${done} vörur AI-flokkaðar${d.remaining ? ` — ${d.remaining} óvissar eftir (handflokkast á vöruspjaldi)` : ""}.`);
          break;
        }
      }
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Villa"); }
    finally { setRunning(false); }
  }

  if (unclassified === 0 && !msg) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={run} disabled={running}
        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
        {running ? "Flokka…" : `🤖 AI-flokka óflokkaðar vörur (${unclassified})`}
      </button>
      {running && <button onClick={() => { stop.current = true; }} className="text-sm text-gray-500 hover:text-red-600">Stöðva eftir lotu</button>}
      {msg && <span className="text-sm text-green-700">{msg}</span>}
      {err && <span className="text-sm text-red-600">{err}</span>}
    </div>
  );
}
