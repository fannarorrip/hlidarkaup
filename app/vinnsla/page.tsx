"use client";

import { useEffect, useState } from "react";
import { OPENS_AT } from "@/lib/site-status";

const pad = (n: number) => String(n).padStart(2, "0");

export default function Vinnsla() {
  // now stays null on the server + first client render (avoids hydration mismatch), then ticks.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ready = now !== null;
  const diff = Math.max(0, OPENS_AT.getTime() - (now ?? OPENS_AT.getTime()));
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1_000);

  const Box = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center">
      <div className="w-16 sm:w-24 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 py-3 sm:py-4 shadow-lg">
        <span className="block text-3xl sm:text-5xl font-extrabold tabular-nums text-white leading-none">
          {ready ? pad(value) : "--"}
        </span>
      </div>
      <span className="mt-2 text-[11px] sm:text-sm font-semibold uppercase tracking-wider text-white/80">{label}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden flex flex-col items-center justify-center px-6 text-center
                    bg-gradient-to-br from-[#ff3333] via-[#eb1515] to-[#c00f0f]">
      {/* soft light/shadow swooshes to echo the logo artwork */}
      <div aria-hidden className="pointer-events-none absolute -top-1/3 -right-1/4 h-[85vh] w-[85vh] rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-1/3 -left-1/4 h-[70vh] w-[70vh] rounded-full bg-black/10 blur-3xl" />

      <div className="relative flex flex-col items-center gap-6 sm:gap-8 max-w-2xl">
        {/* white logo mark */}
        <img
          src="/logo.png"
          alt="Hlíðarkaup"
          className="h-14 sm:h-20 w-auto"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <p className="-mt-3 text-white/90 text-sm sm:text-lg font-medium tracking-wide">— með þér alla daga —</p>

        <div className="mt-2">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white">Þessi síða er í vinnslu</h1>
          <p className="mt-3 text-white/90 text-base sm:text-xl">
            Við opnum <strong className="text-white">1. september</strong>
          </p>
        </div>

        <div className="mt-1 flex gap-3 sm:gap-5">
          <Box value={days} label="Dagar" />
          <Box value={hours} label="Klst" />
          <Box value={mins} label="Mín" />
          <Box value={secs} label="Sek" />
        </div>

        <p className="mt-4 text-white/70 text-xs sm:text-sm">Hlíðarkaup · Akurhlíð 1, Sauðárkrókur</p>
      </div>
    </div>
  );
}
