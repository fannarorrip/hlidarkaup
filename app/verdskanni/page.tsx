"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Verðskanni — in-store price checker (8" Android kiosk, scanner = keyboard wedge).
// Idle: slideshow of skjáauglýsingar (tilboð) with a "skannaðu vöru" hint bar.
// On scan: product card (photo, name, price, per-kg / verðmerki info), then back.
// LAN-only like the other kiosk surfaces — 404 through the tunnel.
// ─────────────────────────────────────────────────────────────────────────────

const RED = "#DB1A1A";
const INK = "#21323A";
const CREAM = "#FFF6F2";

const krDot = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr.";

interface Product {
  id: string; name: string; price: number; vatPct?: number; image?: string;
  useScale?: boolean; embeddedPrice?: number; embeddedKg?: number | null; embeddedWeightKg?: number;
  stock?: number;
}

const SLIDE_MS = 8000;      // slideshow interval
const SHOW_MS = 9000;       // how long a scanned product stays up
const ERROR_MS = 4000;

export default function Verdskanni() {
  const [ads, setAds] = useState<{ id: number; image_url: string }[]>([]);
  const [slide, setSlide] = useState(0);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ads: load at start, refresh every 10 minutes so new tilboð appear without a reboot.
  useEffect(() => {
    const load = () => fetch("/api/kassi/ads").then((r) => r.json()).then((d) => setAds(d.ads ?? [])).catch(() => {});
    load();
    const t = setInterval(load, 10 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Slideshow ticker
  useEffect(() => {
    if (ads.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % ads.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [ads.length]);

  const backToIdle = useCallback((ms: number) => {
    if (backTimer.current) clearTimeout(backTimer.current);
    backTimer.current = setTimeout(() => { setProduct(null); setError(""); }, ms);
  }, []);

  const lookup = useCallback(async (code: string) => {
    try {
      const r = await fetch(`/api/kassi/scan?code=${encodeURIComponent(code)}`);
      const d = await r.json();
      if (!r.ok) { setProduct(null); setError("Vara fannst ekki"); backToIdle(ERROR_MS); return; }
      setError(""); setProduct(d); backToIdle(SHOW_MS);
    } catch {
      setProduct(null); setError("Samband við kerfið rofnaði"); backToIdle(ERROR_MS);
    }
  }, [backToIdle]);

  // Barcode scanner as keyboard wedge: fast character burst ending in Enter.
  useEffect(() => {
    let buf = ""; let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - last > 100) buf = "";
      last = now;
      if (e.key === "Enter") { if (buf.length >= 6) lookup(buf); buf = ""; return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lookup]);

  // ── Product / error view ──────────────────────────────────────────────────
  if (product || error) {
    const p = product;
    const packPrice = p?.embeddedPrice;
    const packKg = p?.embeddedWeightKg ?? p?.embeddedKg ?? null;
    const shownPrice = packPrice ?? (p ? (p.embeddedWeightKg ? Math.round(p.embeddedWeightKg * p.price) : p.price) : 0);
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-center" style={{ background: CREAM }}>
        {error ? (
          <>
            <p className="text-6xl mb-6">🔍</p>
            <h1 className="text-4xl font-extrabold" style={{ color: INK }}>{error}</h1>
            <p className="mt-4 text-xl text-gray-500">Leitaðu til starfsmanns</p>
          </>
        ) : p && (
          <>
            {p.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="h-56 w-56 object-contain mb-6 rounded-2xl bg-white shadow-sm" />
            )}
            <h1 className="text-4xl font-extrabold leading-tight max-w-3xl" style={{ color: INK }}>{p.name}</h1>
            <p className="mt-5 text-7xl font-extrabold tabular-nums" style={{ color: RED }}>{krDot(shownPrice)}</p>
            {p.useScale && !packPrice && !p.embeddedWeightKg && (
              <p className="mt-3 text-2xl text-gray-500">verð á kg — vigtað við kassa</p>
            )}
            {packKg != null && (
              <p className="mt-3 text-2xl text-gray-500">
                {packKg.toFixed(3).replace(".", ",")} kg{packPrice ? ` · ${krDot(p.price)} pr. kg` : ` × ${krDot(p.price)} pr. kg`}
              </p>
            )}
          </>
        )}
        <div className="absolute bottom-0 inset-x-0 py-4 text-center text-white text-lg font-semibold" style={{ background: RED }}>
          Skannaðu aðra vöru til að sjá verð
        </div>
      </div>
    );
  }

  // ── Idle: slideshow (or branded rest screen when no ads exist) ────────────
  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: CREAM }}>
      {ads.length > 0 ? (
        ads.map((a, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={a.id}
            src={a.image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
            style={{ opacity: i === slide ? 1 : 0 }}
          />
        ))
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-splash.png" alt="Hlíðarkaup" className="w-2/3 max-w-md" />
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 py-5 text-center text-white text-2xl font-bold" style={{ background: RED }}>
        Skannaðu vöru til að sjá verð
      </div>
    </div>
  );
}
