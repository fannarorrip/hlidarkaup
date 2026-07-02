"use client";
import { useEffect, useRef, useState } from "react";

// Reusable birgir (supplier) picker. Used on the Pósthólf approve screen and the
// manual Innkaup form. Given the invoice's extracted name/kennitala it auto-matches
// an existing supplier; otherwise the user searches, or creates one in one click.
interface Match { id: string; name: string; kennitala: string | null; supplier_number: string | null; is_generic: boolean }

export default function SupplierPicker({
  onChange, suggestName, suggestKennitala,
}: {
  onChange: (id: string | null, name: string | null) => void;
  suggestName?: string;
  suggestKennitala?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  async function fetchMatches(term: string): Promise<Match[]> {
    const res = await fetch(`/api/suppliers?q=${encodeURIComponent(term)}`);
    const d = await res.json();
    return d.suppliers || [];
  }

  // Auto-match on mount from the extracted invoice (kennitala first, then exact name).
  useEffect(() => {
    (async () => {
      const kt = (suggestKennitala || "").replace(/\D/g, "");
      const probe = kt || (suggestName || "").trim();
      if (!probe) return;
      const matches = await fetchMatches(probe);
      const byKt = kt ? matches.find((m) => (m.kennitala || "").replace(/\D/g, "") === kt) : null;
      const byName = suggestName ? matches.find((m) => m.name.toLowerCase() === suggestName.trim().toLowerCase()) : null;
      const hit = byKt || byName;
      if (hit) { setSelected(hit); onChange(hit.id, hit.name); setNote("✓ Parað sjálfvirkt"); }
      else { setQ(suggestName || ""); setNote("Enginn birgir paraðist — veldu eða stofnaðu."); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  async function search(term: string) { setQ(term); setOpen(true); setResults(await fetchMatches(term)); }
  function pick(m: Match) { setSelected(m); onChange(m.id, m.name); setOpen(false); setNote(""); }
  function clear() { setSelected(null); onChange(null, null); setQ(""); setResults([]); }

  async function createNew() {
    const name = (suggestName || q).trim(); if (!name) return;
    setBusy(true);
    const res = await fetch("/api/suppliers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, kennitala: (suggestKennitala || "").replace(/\D/g, "") || undefined }),
    });
    const d = await res.json(); setBusy(false);
    if (d.ok) { pick({ id: d.supplier.id, name: d.supplier.name, kennitala: d.supplier.kennitala, supplier_number: null, is_generic: false }); setNote("✓ Nýr birgir stofnaður"); }
    else setNote(d.error || "Villa við stofnun");
  }

  return (
    <div ref={boxRef} className="relative max-w-md">
      {selected ? (
        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <span className="font-medium">{selected.name}</span>
          {selected.kennitala && <span className="text-gray-400 text-xs">kt. {selected.kennitala}</span>}
          <button onClick={clear} className="ml-auto text-red-600 hover:text-red-700 text-xs">breyta</button>
        </div>
      ) : (
        <>
          <input value={q} onChange={(e) => search(e.target.value)} onFocus={() => search(q)} placeholder="Leita að birgi…"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-red-400" />
          {open && (
            <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto text-sm">
              {results.map((m) => (
                <button key={m.id} onClick={() => pick(m)} className="block w-full text-left px-3 py-1.5 hover:bg-red-50">
                  {m.name}{m.kennitala ? <span className="text-gray-400 text-xs"> · kt. {m.kennitala}</span> : null}{m.is_generic ? <span className="text-gray-400 text-xs"> (safnliður)</span> : null}
                </button>
              ))}
              {(suggestName || q).trim() && (
                <button onClick={createNew} disabled={busy} className="block w-full text-left px-3 py-1.5 hover:bg-green-50 text-green-700 border-t border-gray-100">
                  + Nýr birgir: {(suggestName || q).trim()}{suggestKennitala ? ` (kt. ${suggestKennitala})` : ""}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
    </div>
  );
}
