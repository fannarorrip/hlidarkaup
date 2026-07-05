"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface Ad { id: number; image_url: string; sort_order: number; is_active: boolean }

export default function AdsManager() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/screen-ads").then((r) => r.json()).then((d) => setAds(d.ads ?? [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setBusy(true); setError("");
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/screen-ads", { method: "POST", body: fd }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { setError(d.error ?? "Upphleðsla mistókst"); return; }
    load();
  }

  async function toggle(ad: Ad) {
    await fetch(`/api/screen-ads/${ad.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isActive: !ad.is_active }) }).catch(() => {});
    load();
  }
  async function move(ad: Ad, dir: -1 | 1) {
    const sorted = [...ads].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const i = sorted.findIndex((a) => a.id === ad.id);
    const other = sorted[i + dir];
    if (!other) return;
    await Promise.all([
      fetch(`/api/screen-ads/${ad.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder: other.sort_order }) }),
      fetch(`/api/screen-ads/${other.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder: ad.sort_order }) }),
    ]).catch(() => {});
    load();
  }
  async function remove(id: number) {
    if (!confirm("Eyða þessari mynd af skjánum?")) return;
    await fetch(`/api/screen-ads/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Hleð upp…" : "+ Bæta við mynd"}
        </button>
        <span className="text-xs text-gray-400">JPG/PNG/WebP, hámark 8MB</span>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {ads.length === 0 ? (
        <p className="text-sm text-gray-400 border border-dashed border-gray-300 rounded-xl p-10 text-center">
          Engar myndir enn — verðskanninn sýnir vörumerkið á meðan.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...ads].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((ad, i, arr) => (
            <div key={ad.id} className={`bg-white border rounded-xl overflow-hidden ${ad.is_active ? "border-gray-200" : "border-gray-200 opacity-50"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* 4:3 preview = exactly how the 1024×768 screen crops it */}
              <img src={ad.image_url} alt="" className="w-full aspect-[4/3] object-cover" />
              <div className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center gap-1">
                  <button onClick={() => move(ad, -1)} disabled={i === 0} className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30" aria-label="Færa framar">↑</button>
                  <button onClick={() => move(ad, 1)} disabled={i === arr.length - 1} className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30" aria-label="Færa aftar">↓</button>
                </div>
                <button onClick={() => toggle(ad)} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ad.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {ad.is_active ? "Virk" : "Óvirk"}
                </button>
                <button onClick={() => remove(ad.id)} className="text-gray-300 hover:text-red-600 text-lg leading-none" aria-label="Eyða">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
