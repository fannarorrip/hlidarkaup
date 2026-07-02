"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Staff login — ONE door for everyone (bókhald, kassi, eldhús, sjálfsali). Eldhús palette:
// deep #2C687B, red #DB1A1A, cream #FFF6F6, teal #8CC7C4, tealSoft #E4F1F0, ink #21323A.
export default function StaffLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/auth/staff/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? "Innskráning mistókst"); return; }
    const next = new URLSearchParams(window.location.search).get("next") || "/bokhald";
    router.replace(next);
    router.refresh();
  }

  const inp = "w-full rounded-xl border border-[#E4F1F0] bg-white px-4 py-3 text-sm text-[#21323A] outline-none transition-colors focus:border-[#8CC7C4] focus:ring-2 focus:ring-[#E4F1F0]";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF6F6] p-6">
      <div className="w-full max-w-3xl grid md:grid-cols-5 rounded-3xl overflow-hidden shadow-xl shadow-[#2C687B]/10 border border-[#E4F1F0] bg-white">

        {/* Brand panel */}
        <div className="md:col-span-2 bg-[#2C687B] p-8 md:p-10 flex flex-col justify-between min-h-[160px]">
          <div>
            <p className="text-white font-extrabold text-2xl tracking-tight">
              Hlíðarkaup<span className="text-[#DB1A1A]">.</span>
            </p>
            <p className="text-[#8CC7C4] text-sm mt-2 leading-relaxed">
              Starfsmannakerfi — bókhald, kassi, lager, laun og eldhús á einum stað.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 mt-10">
            {["Bókhald", "Kassi", "Eldhús"].map((t) => (
              <span key={t} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-[#E4F1F0]">{t}</span>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="md:col-span-3 p-8 md:p-10">
          <h1 className="text-xl font-bold text-[#21323A]">Skráðu þig inn</h1>
          <p className="text-sm text-[#5C6B72] mt-1 mb-7">Sama innskráning fyrir öll kerfi — kerfið sýnir þér það sem þitt hlutverk hefur aðgang að.</p>

          <label className="block mb-4">
            <span className="block text-xs font-semibold uppercase tracking-wide text-[#5C6B72] mb-1.5">Netfang</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} autoFocus autoComplete="username" />
          </label>
          <label className="block mb-5">
            <span className="block text-xs font-semibold uppercase tracking-wide text-[#5C6B72] mb-1.5">Lykilorð</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inp} autoComplete="current-password" />
          </label>

          {error && (
            <p className="text-sm font-medium text-[#DB1A1A] bg-[#FFF6F6] border border-[#F3D2D2] rounded-xl px-4 py-2.5 mb-4">{error}</p>
          )}

          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-xl bg-[#DB1A1A] text-white font-bold tracking-wide transition-transform active:scale-[0.99] hover:bg-[#c01414] disabled:opacity-50">
            {busy ? "Skrái inn…" : "Skrá inn"}
          </button>

          <p className="text-[11px] text-[#9DB0B6] mt-6 text-center">Vandamál með aðgang? Hafðu samband við stjórnanda.</p>
        </form>
      </div>
    </div>
  );
}
