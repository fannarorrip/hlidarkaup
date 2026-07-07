"use client";
import { useState } from "react";
import Link from "next/link";

const NUTRI_LABEL: Record<string, string> = {
  orka_kj: "kJ", orka_kcal: "kcal", fita: "Fita", mettadar_fitusyrur: "Mettuð",
  kolvetni: "Kolvetni", sykrur: "Sykrur", trefjar: "Trefjar", protein: "Prótein", salt: "Salt",
};

interface MatchedRow {
  product_number: string; matchedName: string; supplierName: string; matchType: "barcode" | "name";
  ean: string; innihald: string; ofnaemisvaldar: string; netto_magn: string; uppruni: string;
  naeringargildi: Record<string, number | null> | null;
}
interface UnmatchedRow { supplierName: string; ean: string; reason: "no_match" | "no_data" }
interface Preview {
  filename: string; mapping: Record<string, string | null>; nutritionBasis: string; warnings: string[];
  counts: { total: number; matched: number; unmatched: number };
  matched: MatchedRow[]; unmatched: UnmatchedRow[]; unmatchedTruncated: boolean;
}

const badge = "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide";

export default function ImportClient() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ updated: number; missing: number } | null>(null);

  async function upload(file: File) {
    setBusy(true); setError(""); setPreview(null); setResult(null);
    try {
      const fd = new FormData(); fd.set("file", file);
      const res = await fetch("/api/products/import/preview", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Lestur mistókst"); return; }
      setPreview(d);
      setSelected(Object.fromEntries((d.matched as MatchedRow[]).map((r) => [r.product_number, true])));
    } catch { setError("Samband rofnaði"); } finally { setBusy(false); }
  }

  async function apply() {
    if (!preview) return;
    const rows = preview.matched.filter((r) => selected[r.product_number]);
    if (!rows.length) { setError("Engin lína valin."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/products/import/apply", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Vistun mistókst"); return; }
      setResult({ updated: d.updated, missing: d.missing });
      setPreview(null);
    } catch { setError("Samband rofnaði"); } finally { setBusy(false); }
  }

  const selCount = preview ? preview.matched.filter((r) => selected[r.product_number]).length : 0;
  const mappedFields = preview ? Object.entries(preview.mapping).filter(([, v]) => v) : [];

  return (
    <div className="space-y-5">
      {/* Upload */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <label className={`inline-block px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${busy ? "bg-gray-200 text-gray-400" : "bg-red-600 text-white hover:bg-red-700"}`}>
          {busy ? "Vinn…" : "Velja skrá frá birgja"}
          <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ""; }} />
        </label>
        <p className="mt-2 text-xs text-gray-400">.xlsx, .xls eða .csv — hámark 20MB.</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* Result */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <p className="text-green-800 font-semibold">✓ {result.updated} vörur uppfærðar.</p>
          {result.missing > 0 && <p className="text-sm text-amber-700 mt-1">{result.missing} línur fundust ekki við vistun.</p>}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="font-semibold">{preview.filename}</span>
              <span className="text-gray-500">{preview.counts.total} línur</span>
              <span className="text-green-700">{preview.counts.matched} pöruð</span>
              <span className="text-gray-400">{preview.counts.unmatched} óparaðar</span>
            </div>
            <div className="text-xs text-gray-500">
              <span className="font-medium text-gray-600">Kortlagðir dálkar: </span>
              {mappedFields.length ? mappedFields.map(([f, c]) => `${f} → „${c}“`).join("  ·  ") : "engir"}
            </div>
            {preview.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">⚠ {w}</p>
            ))}
          </div>

          {/* Matched */}
          {preview.matched.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold">Pöraðar vörur — yfirfarðu og veldu</p>
                <div className="flex items-center gap-3 text-xs">
                  <button onClick={() => setSelected(Object.fromEntries(preview.matched.map((r) => [r.product_number, true])))} className="text-red-600 hover:underline">Velja allt</button>
                  <button onClick={() => setSelected({})} className="text-gray-400 hover:underline">Hreinsa</button>
                </div>
              </div>
              <div className="max-h-[460px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-left sticky top-0">
                    <tr>
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 font-medium">Vara</th>
                      <th className="px-3 py-2 font-medium">Innflutt gögn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.matched.map((r) => {
                      const nutri = r.naeringargildi ? Object.entries(r.naeringargildi).filter(([, v]) => v != null) : [];
                      return (
                        <tr key={r.product_number} className="border-t border-gray-100 align-top">
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={!!selected[r.product_number]}
                              onChange={(e) => setSelected((s) => ({ ...s, [r.product_number]: e.target.checked }))}
                              className="w-4 h-4 accent-red-600 mt-0.5" />
                          </td>
                          <td className="px-3 py-2">
                            <Link href={`/bokhald/solukerfi/vorur/${r.product_number}`} target="_blank" className="font-medium text-red-700 hover:underline">{r.matchedName}</Link>
                            <div className="text-xs text-gray-400 font-mono">{r.product_number}</div>
                            <span className={`${badge} ${r.matchType === "barcode" ? "bg-gray-100 text-gray-500" : "bg-amber-50 text-amber-700"}`}>
                              {r.matchType === "barcode" ? `strikam. ${r.ean}` : "nafn"}
                            </span>
                            {r.supplierName && r.supplierName.toLowerCase() !== r.matchedName.toLowerCase() && (
                              <div className="text-xs text-gray-400 mt-0.5">birgir: {r.supplierName}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600 space-y-1">
                            {r.innihald && <div><b className="text-gray-400">Innihald:</b> {r.innihald.length > 140 ? r.innihald.slice(0, 140) + "…" : r.innihald}</div>}
                            {r.ofnaemisvaldar && <div><b className="text-gray-400">Ofnæmi:</b> {r.ofnaemisvaldar}</div>}
                            {r.netto_magn && <div><b className="text-gray-400">Magn:</b> {r.netto_magn}</div>}
                            {r.uppruni && <div><b className="text-gray-400">Uppruni:</b> {r.uppruni}</div>}
                            {nutri.length > 0 && <div><b className="text-gray-400">Næring/100g:</b> {nutri.map(([k, v]) => `${NUTRI_LABEL[k] ?? k} ${v}`).join(", ")}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unmatched */}
          {preview.unmatched.length > 0 && (
            <details className="bg-white border border-gray-200 rounded-xl p-4">
              <summary className="text-sm font-semibold cursor-pointer text-gray-600">
                {preview.counts.unmatched} óparaðar línur {preview.unmatchedTruncated && "(sýni fyrstu 300)"}
              </summary>
              <div className="mt-3 max-h-64 overflow-auto text-xs text-gray-500 space-y-1">
                {preview.unmatched.map((u, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`${badge} ${u.reason === "no_data" ? "bg-gray-100 text-gray-400" : "bg-red-50 text-red-500"}`}>
                      {u.reason === "no_data" ? "engin gögn" : "engin vara"}
                    </span>
                    <span>{u.supplierName}{u.ean ? ` · ${u.ean}` : ""}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400">„engin vara“ = strikamerki/nafn fannst ekki hjá okkur (skráðu strikamerkið á vöruna og reyndu aftur). „engin gögn“ = línan hafði ekkert innihald/næringu.</p>
            </details>
          )}

          {/* Apply bar */}
          <div className="flex items-center gap-4 sticky bottom-0 bg-white/90 backdrop-blur border border-gray-200 rounded-xl px-5 py-3">
            <button onClick={apply} disabled={busy || selCount === 0}
              className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
              {busy ? "Vista…" : `Flytja inn ${selCount} vörur`}
            </button>
            <span className="text-xs text-gray-400">Aðeins valdar, pöraðar vörur eru uppfærðar.</span>
          </div>
        </>
      )}
    </div>
  );
}
