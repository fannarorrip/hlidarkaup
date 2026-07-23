"use client";
import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

// Password reset / activation landing. The Supabase recovery link drops a recovery
// session into the URL; supabase-js (detectSessionInUrl) picks it up. We then set the
// new password (min 12 chars) and send the user to the login page.
export default function NyttLykilord() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) { setReady("invalid"); return; }
    // supabase-js processes the recovery token from the URL hash on load.
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady("ok");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady("ok");
      else setTimeout(() => setReady((s) => (s === "checking" ? "invalid" : s)), 1500);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 12) { setError("Lykilorð verður að vera a.m.k. 12 stafir."); return; }
    if (pw !== pw2) { setError("Lykilorðin eru ekki eins."); return; }
    if (!supabase) { setError("Kerfið er ekki tengt."); return; }
    setBusy(true); setError("");
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) { setError(err.message || "Tókst ekki að setja lykilorð."); return; }
    await supabase.auth.signOut().catch(() => {});
    setDone(true);
    setTimeout(() => router.replace("/starf/login"), 1800);
  }

  const inp = "w-full rounded-xl border border-[#E4F1F0] bg-white px-4 py-3 text-sm text-[#21323A] outline-none focus:border-[#8CC7C4] focus:ring-2 focus:ring-[#E4F1F0]";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF6F6] p-6">
      <div className="w-full max-w-md rounded-3xl border border-[#E4F1F0] bg-white shadow-xl shadow-[#2C687B]/10 p-8">
        <p className="text-[#2C687B] font-extrabold text-xl mb-1">Hlíðarkaup<span className="text-[#DB1A1A]">.</span></p>
        <h1 className="text-lg font-bold text-[#21323A] mb-5">Setja nýtt lykilorð</h1>

        {ready === "checking" && <p className="text-sm text-[#5C6B72]">Athuga hlekk…</p>}
        {ready === "invalid" && (
          <p className="text-sm text-[#DB1A1A] bg-[#FFF6F6] border border-[#F3D2D2] rounded-xl px-4 py-3">
            Hlekkurinn er útrunninn eða ógildur. Biddu um nýjan á innskráningarsíðunni.
          </p>
        )}
        {ready === "ok" && !done && (
          <form onSubmit={submit}>
            <label className="block mb-4">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[#5C6B72] mb-1.5">Nýtt lykilorð</span>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={inp} autoComplete="new-password" autoFocus />
            </label>
            <label className="block mb-2">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[#5C6B72] mb-1.5">Staðfesta lykilorð</span>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inp} autoComplete="new-password" />
            </label>
            <p className="text-[11px] text-[#9DB0B6] mb-4">Minnst 12 stafir.</p>
            {error && <p className="text-sm font-medium text-[#DB1A1A] bg-[#FFF6F6] border border-[#F3D2D2] rounded-xl px-4 py-2.5 mb-4">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full py-3 rounded-xl bg-[#DB1A1A] text-white font-bold hover:bg-[#c01414] disabled:opacity-50">
              {busy ? "Vista…" : "Setja lykilorð"}
            </button>
          </form>
        )}
        {done && <p className="text-sm font-medium text-[#2C687B] bg-[#E4F1F0] border border-[#8CC7C4] rounded-xl px-4 py-3">Lykilorð vistað. Beini þér á innskráningu…</p>}
      </div>
    </div>
  );
}
