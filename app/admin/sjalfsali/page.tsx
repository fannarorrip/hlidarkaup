"use client";
// Sjálfsali (self-service door access) application admin. Split out of the old combined
// /admin/orders page when the web-order view was retired into Bókhald → Pantanir – Vefverslun.
import { useEffect, useState } from "react";

interface SjalfsaliApp { id: string; createdAt: string; name: string; phone: string; age: number; status: string }

const STATUS_LABELS: Record<string, string> = { new: "Ný", approved: "Samþykkt", rejected: "Hafnað" };
const STATUS_COLORS: Record<string, string> = {
  new: "bg-amber-100 text-amber-800", approved: "bg-[#E4F1F0] text-[#2C687B]", rejected: "bg-red-100 text-[#DB1A1A]",
};

function fmt(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("is-IS", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function SjalfsaliAdminPage() {
  const [apps, setApps] = useState<SjalfsaliApp[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/sjalfsali");
    setApps(await res.json());
    setLoading(false);
  }
  async function setStatus(id: string, status: string) {
    await fetch("/api/admin/sjalfsali", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-[#FFF6F6]">
      <div className="bg-[#2C687B] text-white px-6 py-4 shadow-sm">
        <h1 className="text-xl font-bold">Hlíðarkaup — Sjálfsali umsóknir</h1>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-20 animate-pulse" />)}</div>
        ) : apps.length === 0 ? (
          <div className="text-center py-20 text-[#5C6B72]"><p className="text-4xl mb-2">📋</p><p>Engar umsóknir</p></div>
        ) : (
          <div className="space-y-3">
            {apps.map((app) => (
              <div key={app.id} className="bg-white rounded-2xl border border-[#E4F1F0] px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[#21323A]">{app.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[app.status] ?? "bg-[#E4F1F0] text-[#5C6B72]"}`}>{STATUS_LABELS[app.status] ?? app.status}</span>
                    </div>
                    <div className="text-sm text-[#5C6B72] flex gap-4 flex-wrap">
                      <span>📞 {app.phone}</span>
                      <span>🎂 {app.age} ára</span>
                      <span className="text-[#9DB0B6]">{fmt(app.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {["new", "approved", "rejected"].map((s) => (
                      <button key={s} onClick={() => setStatus(app.id, s)} disabled={app.status === s}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${app.status === s ? "bg-[#2C687B] text-white cursor-default" : "bg-[#E4F1F0] text-[#2C687B] hover:bg-[#d4e9e7]"}`}>
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
