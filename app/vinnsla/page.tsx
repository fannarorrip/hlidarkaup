"use client";

import { useEffect, useState } from "react";
import { OPENS_AT } from "@/lib/site-status";

const pad = (n: number) => String(n).padStart(2, "0");

// Bag artwork colours (sampled from the print design):
const BASE = "#e52c1a"; // Pantone 200C — field
const BAND = "#cb2618"; // Pantone 208C — thin darker band
const SWOOSH = "#f33008"; // Pantone 185C — bright swoosh

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
      <div className="w-[68px] sm:w-28 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 py-3 sm:py-5 shadow-lg">
        <span className="block text-3xl sm:text-6xl font-extrabold tabular-nums text-white leading-none">
          {ready ? pad(value) : "--"}
        </span>
      </div>
      <span className="mt-2 text-[11px] sm:text-sm font-semibold uppercase tracking-wider text-white/80">{label}</span>
    </div>
  );

  // Concentric arcs from below the frame — bright swoosh core, thin darker band, base field.
  const circle = (size: string, color: string) => ({
    position: "absolute" as const,
    width: size,
    height: size,
    left: "58%",
    top: "128%",
    transform: "translate(-50%, -50%)",
    borderRadius: "9999px",
    background: color,
  });

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: BASE }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div style={circle("196vmax", BAND)} />
        <div style={circle("182vmax", SWOOSH)} />
      </div>

      <div className="relative flex flex-col items-center gap-8 sm:gap-10 max-w-3xl">
        {/* full logo lockup (wordmark + slogan), white on the red field, large */}
        <img
          src="/logo-splash.png"
          alt="Hlíðarkaup — með þér alla daga"
          className="w-full max-w-md sm:max-w-2xl h-auto drop-shadow-md"
          style={{ filter: "brightness(0) invert(1)" }}
        />

        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white">Þessi síða er í vinnslu</h1>
          <p className="mt-3 text-white/95 text-lg sm:text-2xl">
            Við opnum <strong className="text-white">1. september</strong>
          </p>
        </div>

        <div className="flex gap-3 sm:gap-5">
          <Box value={days} label="Dagar" />
          <Box value={hours} label="Klst" />
          <Box value={mins} label="Mín" />
          <Box value={secs} label="Sek" />
        </div>

        <p className="text-white/75 text-xs sm:text-sm">Hlíðarkaup · Akurhlíð 1, Sauðárkrókur</p>
      </div>
    </div>
  );
}
