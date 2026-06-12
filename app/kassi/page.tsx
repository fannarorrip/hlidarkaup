"use client";

import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";

interface CartLine {
  id: string;
  name: string;
  price: number;
  stock?: number;
  quantity: number;
}

type Screen = "idle" | "scan" | "paying" | "done" | "payError";

// ── Kiosk palette (Krónan-style) ─────────────────────────────────────────────
const YELLOW = "#F6E14B";
const YELLOW_DEEP = "#EFD52E";
const TEAL = "#7ECFC9";
const TEAL_LIGHT = "#DFF1EF";
const INK = "#2B2B2B";

// Subtle guilloche / fingerprint-wave background used behind every screen
const PATTERN_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'>` +
    `<g fill='none' stroke='#9a9a8e' stroke-opacity='0.07' stroke-width='14'>` +
    Array.from({ length: 16 }, (_, i) => `<circle cx='450' cy='450' r='${50 + i * 38}'/>`).join("") +
    `</g></svg>`,
);
const PATTERN_BG: CSSProperties = {
  backgroundColor: "#f7f5ef",
  backgroundImage: `url("data:image/svg+xml,${PATTERN_SVG}")`,
  backgroundSize: "1100px 1100px",
  backgroundPosition: "center",
};

export default function KassiPage() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [screen, setScreen] = useState<Screen>("idle");
  const [scanError, setScanError] = useState("");
  const [lastScanned, setLastScanned] = useState<CartLine | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [payError, setPayError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState("");

  // Product search overlay (for items without barcode, e.g. produce)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; price: number; stock?: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Bag prompt before payment + help modal
  const [bagModalOpen, setBagModalOpen] = useState(false);
  const [bagCount, setBagCount] = useState(0);
  const [bagProduct, setBagProduct] = useState<{ id: string; name: string; price: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showDigits, setShowDigits] = useState(false);

  // Load the bag product once
  useEffect(() => {
    fetch("/api/kassi/bag")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBagProduct(d))
      .catch(() => null);
  }, []);

  const total = cart.reduce((s, l) => s + l.price * l.quantity, 0);

  // Keep hidden input focused so USB scanners (keyboard wedge) always land here
  useEffect(() => {
    const t = setInterval(() => {
      if ((screen === "idle" || screen === "scan") && !searchOpen) inputRef.current?.focus();
    }, 500);
    return () => clearInterval(t);
  }, [screen, searchOpen]);

  // Debounced product search
  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/kassi/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults(
          (data.products ?? []).map((p: { id: string; name: string; price: number; stock?: number }) => ({
            id: p.id, name: p.name, price: p.price, stock: p.stock,
          })),
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery, searchOpen]);

  function openSearch() {
    setSearchOpen(true);
    setSearchQuery("");
    setSearchResults([]);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  // Auto-return to attract screen after a finished sale
  useEffect(() => {
    if (screen !== "done") return;
    const t = setTimeout(() => newSale(), 15_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const addProduct = useCallback((data: { id: string; name: string; price: number; stock?: number }) => {
    const existing = cart.find((l) => l.id === data.id);
    let added: CartLine;
    if (existing) {
      if (data.stock !== undefined && existing.quantity >= data.stock) {
        setScanError(`Ekki meira til á lager af ${data.name}`);
        return;
      }
      added = { ...existing, quantity: existing.quantity + 1 };
      setCart(cart.map((l) => (l.id === data.id ? added : l)));
    } else {
      if (data.stock !== undefined && data.stock <= 0) {
        setScanError(`${data.name} er ekki til á lager`);
        return;
      }
      added = { id: data.id, name: data.name, price: data.price, stock: data.stock, quantity: 1 };
      setCart([...cart, added]);
    }
    // Stays visible in the product card until the next scan (like the real kiosk)
    setLastScanned(added);
  }, [cart]);

  const handleScan = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setScanError("");
    try {
      const res = await fetch(`/api/kassi/scan?code=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Vara fannst ekki");
        setScreen("scan");
        return;
      }
      addProduct(data);
      setScreen("scan");
    } catch {
      setScanError("Villa við að sækja vöru");
    } finally {
      setBusy(false);
    }
  }, [busy, addProduct]);

  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.id !== id) return l;
          const q = l.quantity + delta;
          if (l.stock !== undefined && q > l.stock) return l;
          return { ...l, quantity: q };
        })
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(id: string) {
    setCart((prev) => prev.filter((l) => l.id !== id));
  }

  /** Open the bag prompt before payment (Krónan-style). */
  function startPay() {
    if (cart.length === 0) return;
    setBagCount(0);
    setBagModalOpen(true);
  }

  /** Confirm bag count, add bags to the cart, then charge. */
  function confirmBagsAndPay() {
    setBagModalOpen(false);
    let finalCart = cart;
    if (bagCount > 0 && bagProduct) {
      const existing = cart.find((l) => l.id === bagProduct.id);
      finalCart = existing
        ? cart.map((l) => (l.id === bagProduct.id ? { ...l, quantity: l.quantity + bagCount } : l))
        : [...cart, { ...bagProduct, quantity: bagCount }];
      setCart(finalCart);
    }
    pay(finalCart);
  }

  async function pay(finalCart: CartLine[]) {
    setScreen("paying");
    setPayError("");

    // MOCK terminal: replace this block with the Teya/Verifone terminal call.
    await new Promise((r) => setTimeout(r, 2500));
    const payment = {
      approved: true,
      processor: "MOCK",
      stan: String(Date.now()).slice(-6),
      last4: "0000",
      verification: "contactless",
    };

    try {
      const res = await fetch("/api/kassi/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: finalCart.map(({ id, quantity }) => ({ id, quantity })), payment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error ?? "Villa við að skrá söluna");
        setScreen("payError");
        return;
      }
      setInvoiceNumber(data.invoiceNumber);
      setScreen("done");
    } catch {
      setPayError("Samband við kerfið rofnaði. Reyndu aftur.");
      setScreen("payError");
    }
  }

  function newSale() {
    setCart([]);
    setInvoiceNumber("");
    setPayError("");
    setScanError("");
    setLastScanned(null);
    setBagModalOpen(false);
    setHelpOpen(false);
    setScreen("idle");
  }

  /* Hidden scanner input — rendered on every screen that accepts scans */
  const scannerInput = (
    <input
      ref={inputRef}
      value={buffer}
      onChange={(e) => setBuffer(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          handleScan(buffer);
          setBuffer("");
        }
      }}
      className="absolute opacity-0 pointer-events-none"
      autoFocus
      aria-hidden
    />
  );

  const helpButton = (
    <button
      onClick={() => setHelpOpen(true)}
      className="absolute bottom-6 left-8 z-20 flex items-center gap-3 group"
    >
      <span
        className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-md group-active:scale-95 transition-transform"
        style={{ backgroundColor: YELLOW }}
      >
        🙋
      </span>
      <span className="font-bold text-lg" style={{ color: INK }}>Fá aðstoð</span>
    </button>
  );

  // ── Attract / idle screen ────────────────────────────────────────────────
  if (screen === "idle") {
    return (
      <div
        onClick={() => setScreen("scan")}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden"
        style={PATTERN_BG}
      >
        {scannerInput}
        {/* Organic corner blobs */}
        <svg className="absolute top-0 left-0 w-[45%] h-[55%]" viewBox="0 0 400 400" preserveAspectRatio="none">
          <path d="M0,0 H320 C380,120 260,200 300,320 C200,400 80,330 0,360 Z" fill={YELLOW} />
        </svg>
        <svg className="absolute bottom-0 right-0 w-[40%] h-[50%]" viewBox="0 0 400 400" preserveAspectRatio="none">
          <path d="M400,400 V60 C300,20 240,140 140,120 C60,220 140,330 100,400 Z" fill={TEAL} />
        </svg>

        <p className="relative z-10 text-8xl mb-8">🛒</p>
        <h1 className="relative z-10 text-7xl font-extrabold tracking-tight mb-3" style={{ color: INK }}>
          Hlíðarkaup
        </h1>
        <p className="relative z-10 text-2xl font-medium mb-16 text-gray-500">Sjálfsafgreiðslukassi</p>

        <div className="relative z-10 animate-pulse flex flex-col items-center gap-2">
          <p className="text-3xl font-bold" style={{ color: INK }}>Skannaðu vöru til að byrja</p>
          <p className="text-gray-400 text-lg">eða snertu skjáinn</p>
        </div>

        <p className="absolute bottom-6 z-10 text-gray-400 text-sm">Akurhlíð 1 · Sauðárkrókur</p>
      </div>
    );
  }

  // ── Payment in progress — frosted card over dimmed pattern, like photo ──
  if (screen === "paying") {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden" style={PATTERN_BG}>
        {/* Faded light-blue blobs in the background */}
        <svg className="absolute top-0 left-0 w-[50%] h-[60%] opacity-70" viewBox="0 0 400 400" preserveAspectRatio="none">
          <path d="M0,0 H300 C370,130 250,220 290,340 C190,410 70,340 0,370 Z" fill={TEAL_LIGHT} />
        </svg>
        <svg className="absolute bottom-0 right-0 w-[45%] h-[55%] opacity-70" viewBox="0 0 400 400" preserveAspectRatio="none">
          <path d="M400,400 V50 C290,10 230,150 130,130 C50,230 130,340 90,400 Z" fill={TEAL_LIGHT} />
        </svg>

        {/* Cart summary, dimmed at the edge like the reference */}
        <div className="absolute left-0 inset-y-0 w-72 p-8 hidden lg:flex flex-col opacity-50">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-5">Karfan þín</p>
          <div className="space-y-3 flex-1 overflow-hidden">
            {cart.map((l) => (
              <div key={l.id} className="bg-white/70 rounded-2xl px-4 py-3">
                <p className="font-bold text-sm leading-snug" style={{ color: INK }}>{l.name}</p>
                <p className="text-gray-400 text-xs mt-0.5">{l.quantity} stk. · {(l.price * l.quantity).toLocaleString("is-IS")} kr.</p>
              </div>
            ))}
          </div>
        </div>

        {/* Frosted center card */}
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="bg-white/80 backdrop-blur-md rounded-[2.5rem] shadow-2xl px-16 py-14 flex flex-col items-center max-w-xl w-full border border-white">
            {/* Hand tapping card on terminal — like the Krónan illustration */}
            <svg viewBox="0 0 260 180" className="w-64 h-44 mb-6">
              {/* Terminal */}
              <rect x="95" y="78" width="78" height="92" rx="12" fill="#fff" stroke={INK} strokeWidth="3" />
              <rect x="107" y="92" width="54" height="26" rx="4" fill={TEAL} opacity="0.5" />
              <circle cx="116" cy="132" r="5" fill={YELLOW} />
              {[0, 1, 2].map((r) =>
                [0, 1, 2].map((c) => (
                  <rect key={`${r}${c}`} x={130 + c * 13} y={126 + r * 13} width="9" height="9" rx="2" fill="#e5e5e5" stroke={INK} strokeWidth="1" />
                )),
              )}
              {/* Card */}
              <g transform="rotate(-18 185 65)">
                <rect x="158" y="48" width="56" height="36" rx="6" fill="#fff" stroke={INK} strokeWidth="3" />
                <rect x="166" y="58" width="14" height="11" rx="2" fill={TEAL} />
              </g>
              {/* Hand + thumbs up */}
              <g stroke={INK} strokeWidth="3" fill="#fff" strokeLinejoin="round" strokeLinecap="round">
                <path d="M205 60 C225 50 240 52 248 60 C254 66 252 76 244 80 L214 92 C204 95 196 88 198 78 Z" />
                <path d="M222 52 C220 42 226 34 233 36 C239 38 240 47 236 54" />
              </g>
              {/* Sleeve */}
              <path d="M244 58 L260 50 L260 92 L240 84 Z" fill={YELLOW} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
              {/* Contactless waves */}
              <g stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5">
                <path d="M186 96 a14 14 0 0 1 0 20" />
                <path d="M193 90 a22 22 0 0 1 0 32" />
              </g>
            </svg>

            <h1 className="text-3xl font-extrabold mb-2" style={{ color: INK }}>Bíð eftir greiðslu</h1>
            <p className="text-gray-400 text-lg mb-6">Fylgdu leiðbeiningum á posanum</p>
            <p className="text-4xl font-extrabold mb-8" style={{ color: INK }}>Verð: {total.toLocaleString("is-IS")} kr.</p>
            <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: YELLOW_DEEP, borderTopColor: "transparent" }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Receipt / done ───────────────────────────────────────────────────────
  if (screen === "done") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center overflow-hidden" style={PATTERN_BG}>
        <svg className="absolute bottom-0 left-0 w-[40%] h-[45%] opacity-80" viewBox="0 0 400 400" preserveAspectRatio="none">
          <path d="M0,400 V80 C110,40 170,170 270,150 C350,250 270,360 310,400 Z" fill={TEAL_LIGHT} />
        </svg>
        <div className="relative z-10 w-32 h-32 rounded-full flex items-center justify-center mb-8 shadow-lg" style={{ backgroundColor: YELLOW }}>
          <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke={INK} strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="relative z-10 text-5xl font-extrabold mb-3" style={{ color: INK }}>Takk fyrir viðskiptin!</h1>
        <p className="relative z-10 text-2xl text-gray-600 mb-1">{total.toLocaleString("is-IS")} kr. greitt með korti</p>
        <p className="relative z-10 text-gray-400 text-lg mb-12">Kvittun nr. {invoiceNumber}</p>
        <button
          onClick={newSale}
          className="relative z-10 text-2xl font-extrabold px-16 py-6 rounded-full shadow-lg active:scale-95 transition-transform"
          style={{ backgroundColor: YELLOW, color: INK }}
        >
          Ný sala
        </button>
        <p className="relative z-10 text-gray-300 text-sm mt-8">Skjárinn fer sjálfkrafa á byrjunarskjá</p>
      </div>
    );
  }

  // ── Payment error ────────────────────────────────────────────────────────
  if (screen === "payError") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center" style={PATTERN_BG}>
        <div className="w-28 h-28 bg-red-100 rounded-full flex items-center justify-center mb-8">
          <span className="text-6xl">❌</span>
        </div>
        <h1 className="text-3xl font-extrabold mb-3" style={{ color: INK }}>Eitthvað fór úrskeiðis</h1>
        <p className="text-gray-500 text-lg mb-10">{payError}</p>
        <div className="flex gap-4">
          <button onClick={() => setScreen("scan")}
            className="bg-white border-2 border-gray-300 text-gray-700 text-xl font-bold px-10 py-5 rounded-full">
            Til baka í körfu
          </button>
          <button onClick={() => pay(cart)}
            className="text-xl font-extrabold px-10 py-5 rounded-full active:scale-95 transition-transform"
            style={{ backgroundColor: YELLOW, color: INK }}>
            Reyna aftur
          </button>
        </div>
      </div>
    );
  }

  // ── Main scanning screen — yellow curved panel left, cart right ─────────
  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden select-none" style={PATTERN_BG}>
      {scannerInput}

      {/* Left: yellow organic panel with last-scanned product card */}
      <div className="relative w-[44%] flex flex-col">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 440 900" preserveAspectRatio="none">
          <path d="M0,0 H372 C448,180 340,360 408,540 C460,700 350,810 396,900 H0 Z" fill={YELLOW} />
        </svg>

        <div className="relative z-10 flex flex-col h-full px-10 pt-8 pb-24">
          <h1 className="text-3xl font-extrabold tracking-tight mb-6" style={{ color: INK }}>
            HLÍÐARKAUP
          </h1>

          {/* Product card */}
          <div className="bg-white rounded-[2rem] shadow-sm flex-1 flex flex-col p-8 max-w-md" style={PATTERN_BG}>
            {lastScanned ? (
              <>
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-9xl">🛒</span>
                </div>
                <div className="flex items-end justify-between gap-4">
                  <p className="font-bold text-xl leading-snug" style={{ color: INK }}>{lastScanned.name}</p>
                  <p className="font-bold text-xl whitespace-nowrap" style={{ color: INK }}>
                    {lastScanned.price.toLocaleString("is-IS")} kr.
                  </p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                <span className="text-8xl">📦</span>
                <p className="text-2xl font-bold" style={{ color: INK }}>Skannaðu vöru</p>
                <p className="text-gray-400">Beindu strikamerkinu að skannanum</p>
              </div>
            )}
          </div>

          {scanError && (
            <div className="mt-4 max-w-md bg-red-600 text-white rounded-2xl px-5 py-3 font-bold flex items-center gap-3">
              <span className="text-2xl">⚠️</span> {scanError}
            </div>
          )}
        </div>
      </div>

      {/* Center: search pill straddling the boundary */}
      <button
        onClick={openSearch}
        className="absolute z-30 bottom-6 left-[44%] -translate-x-1/2 flex items-center gap-3 px-8 py-4 rounded-full font-extrabold text-lg shadow-lg border-4 border-white active:scale-95 transition-transform"
        style={{ backgroundColor: YELLOW, color: INK }}
      >
        🔍 Leita að vöru
      </button>

      {helpButton}

      {/* Right: cart list + Samtals + Borga */}
      <div className="flex-1 flex flex-col relative z-10">
        <div className="flex justify-end items-center gap-3 px-8 pt-6 pb-2">
          <span className="font-bold text-lg" style={{ color: INK }}>Íslenska</span>
          <span className="w-10 h-10 rounded-full overflow-hidden shadow flex items-center justify-center text-2xl bg-white">🇮🇸</span>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-2 space-y-3">
          {cart.length === 0 ? (
            <p className="text-gray-300 text-xl font-medium text-center mt-24">Karfan er tóm</p>
          ) : (
            cart.map((l) => (
              <div
                key={l.id}
                className={`flex items-center gap-4 rounded-2xl px-4 py-3 transition-colors ${
                  lastScanned?.id === l.id ? "bg-white shadow-md" : "bg-white/60"
                }`}
              >
                <div
                  className="flex items-center gap-1 rounded-xl px-2 py-2"
                  style={{ backgroundColor: TEAL_LIGHT }}
                >
                  <button onClick={() => changeQty(l.id, -1)} className="w-8 h-8 rounded-lg bg-white font-bold text-lg active:scale-90 transition-transform">−</button>
                  <span className="font-extrabold px-1 whitespace-nowrap" style={{ color: INK }}>{l.quantity} stk.</span>
                  <button
                    onClick={() => changeQty(l.id, 1)}
                    disabled={l.stock !== undefined && l.quantity >= l.stock}
                    className="w-8 h-8 rounded-lg bg-white font-bold text-lg active:scale-90 transition-transform disabled:opacity-30"
                  >+</button>
                </div>
                <div className="flex-1 min-w-0 text-center">
                  <p className="font-bold truncate" style={{ color: INK }}>{l.name}</p>
                  <p className="text-gray-400 text-sm">{l.price.toLocaleString("is-IS")} kr. / stk.</p>
                </div>
                <p className="font-extrabold whitespace-nowrap" style={{ color: INK }}>
                  {(l.price * l.quantity).toLocaleString("is-IS")} kr.
                </p>
                <button onClick={() => removeLine(l.id)} className="text-gray-300 hover:text-red-500 text-xl px-1">🗑</button>
              </div>
            ))
          )}
        </div>

        {/* Totals + Borga bar */}
        <div className="pl-40 pr-8 pt-3 pb-0">
          <div className="flex justify-between items-end border-t border-gray-200 pt-4 pb-3">
            <span className="text-xl font-bold text-gray-500">Samtals:</span>
            <div className="text-right">
              <p className="text-3xl font-extrabold" style={{ color: INK }}>{total.toLocaleString("is-IS")} kr.</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">VSK innifalinn</p>
            </div>
          </div>
        </div>
        <button
          onClick={startPay}
          disabled={cart.length === 0}
          className="h-16 text-xl font-extrabold tracking-wide transition-opacity disabled:opacity-40"
          style={{ backgroundColor: YELLOW, color: INK }}
        >
          Borga
        </button>
      </div>

      {/* Full-screen search — Krónan produce-style */}
      {searchOpen && (
        <div className="absolute inset-0 z-40 flex overflow-hidden" style={PATTERN_BG}>
          {/* Teal blob left, yellow blob right */}
          <svg className="absolute top-0 left-0 w-[55%] h-full" viewBox="0 0 550 900" preserveAspectRatio="none">
            <path d="M0,0 H460 C540,200 420,400 500,580 C540,740 430,830 470,900 H0 Z" fill={TEAL} opacity="0.9" />
          </svg>
          <svg className="absolute top-0 right-0 w-[52%] h-full" viewBox="0 0 520 900" preserveAspectRatio="none">
            <path d="M520,0 H90 C20,180 130,380 60,560 C20,730 120,830 80,900 H520 Z" fill={YELLOW} />
          </svg>

          {/* Left: prompt + popular / results */}
          <div className="relative z-10 w-[48%] shrink-0 flex flex-col px-10 pt-8 pb-20">
            <h1 className="text-2xl font-extrabold tracking-tight mb-5" style={{ color: INK }}>HLÍÐARKAUP</h1>

            <div className="bg-white/95 rounded-[2rem] shadow-sm flex-1 flex flex-col p-7 overflow-hidden" style={PATTERN_BG}>
              <div className="flex items-start gap-3 mb-5">
                <span className="text-3xl">🪄</span>
                <p className="text-lg font-medium leading-snug" style={{ color: INK }}>
                  Leitaðu eftir nafni<br />eða veldu vinsæla vöru
                </p>
              </div>

              {searching ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 border-4 rounded-full animate-spin mb-4" style={{ borderColor: TEAL, borderTopColor: "transparent" }} />
                  <p className="text-gray-400">Leita...</p>
                </div>
              ) : searchQuery.trim().length >= 2 ? (
                searchResults.length === 0 ? (
                  <p className="flex-1 flex items-center justify-center text-gray-400 text-lg">Engin vara fannst</p>
                ) : (
                  <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-3 content-start">
                    {searchResults.map((p) => {
                      const out = p.stock !== undefined && p.stock <= 0;
                      return (
                        <button
                          key={p.id}
                          disabled={out}
                          onClick={() => { handleScan(p.id); closeSearch(); }}
                          className="text-left bg-white rounded-2xl p-4 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
                        >
                          <p className="font-bold leading-snug line-clamp-2" style={{ color: INK }}>{p.name}</p>
                          <div className="flex items-center justify-between mt-2">
                            <p className="font-extrabold" style={{ color: INK }}>{p.price.toLocaleString("is-IS")} kr.</p>
                            {out && <span className="text-xs font-bold text-gray-400">Ekki til</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <>
                  <p className="text-sm font-bold text-gray-500 mb-3">Vinsælar</p>
                  <div className="grid grid-cols-5 gap-3 content-start">
                    {QUICK_PICKS.map((q) => (
                      <button
                        key={q.term}
                        onClick={() => setSearchQuery(q.term)}
                        className="bg-white rounded-2xl p-3 flex flex-col items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
                      >
                        <span className="text-4xl">{q.emoji}</span>
                        <span className="font-bold text-xs" style={{ color: INK }}>{q.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: input + yellow keyboard */}
          <div className="relative z-10 flex-1 flex flex-col px-10 pt-8 pb-8">
            <div className="flex justify-end items-center gap-3 mb-8">
              <span className="font-bold" style={{ color: INK }}>Íslenska</span>
              <span className="w-9 h-9 rounded-full overflow-hidden shadow flex items-center justify-center text-xl bg-white">🇮🇸</span>
            </div>

            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SLÁÐU INN NAFN"
              className="w-full bg-white/95 rounded-2xl px-6 py-4 text-center text-lg font-bold tracking-widest uppercase outline-none placeholder:text-gray-400 shadow-inner mb-6"
              style={{ color: INK }}
            />

            <div className="flex flex-col items-center gap-2">
              {(showDigits ? DIGIT_ROWS : LETTER_ROWS).map((row, i) => (
                <div key={i} className="flex justify-center gap-2">
                  {row.map((k) => (
                    <button
                      key={k}
                      onClick={() => setSearchQuery((q) => q + k)}
                      className="w-12 h-12 rounded-xl font-extrabold text-lg uppercase shadow-sm active:scale-90 transition-transform"
                      style={{ backgroundColor: YELLOW_DEEP, color: INK }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              ))}
              <div className="flex justify-center gap-2 mt-1">
                <button
                  onClick={() => setShowDigits((d) => !d)}
                  className="w-24 h-12 rounded-xl font-extrabold text-sm shadow-sm active:scale-95 transition-transform"
                  style={{ backgroundColor: YELLOW_DEEP, color: INK }}
                >
                  {showDigits ? "ABC" : "0-9"}
                </button>
                <button
                  onClick={() => setSearchQuery((q) => q + " ")}
                  className="w-52 h-12 rounded-xl font-extrabold text-sm shadow-sm active:scale-95 transition-transform"
                  style={{ backgroundColor: YELLOW_DEEP, color: INK }}
                >
                  BIL
                </button>
                <button
                  onClick={() => setSearchQuery((q) => q.slice(0, -1))}
                  className="w-24 h-12 rounded-xl font-extrabold text-xl shadow-sm active:scale-95 transition-transform"
                  style={{ backgroundColor: YELLOW_DEEP, color: INK }}
                >
                  ⌫
                </button>
              </div>
            </div>

            <div className="flex-1" />
            <button
              onClick={closeSearch}
              className="self-end bg-white rounded-2xl px-10 py-4 font-extrabold text-lg shadow-md border-2 active:scale-95 transition-transform"
              style={{ borderColor: YELLOW_DEEP, color: INK }}
            >
              ← Til baka
            </button>
          </div>

          <div className="absolute bottom-6 left-8 z-20">
            <button onClick={() => setHelpOpen(true)} className="flex items-center gap-3 group">
              <span className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-md group-active:scale-95 transition-transform" style={{ backgroundColor: YELLOW }}>🙋</span>
              <span className="font-bold text-lg" style={{ color: INK }}>Fá aðstoð</span>
            </button>
          </div>
        </div>
      )}

      {/* Bag prompt before payment */}
      {bagModalOpen && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 text-center">
            <p className="text-6xl mb-4">🛍️</p>
            <h2 className="text-3xl font-extrabold mb-2" style={{ color: INK }}>Þarftu poka?</h2>
            <p className="text-gray-500 mb-8">
              {bagProduct
                ? `${bagProduct.name} — ${bagProduct.price.toLocaleString("is-IS")} kr. stk.`
                : "Pokar eru ekki í boði á þessum kassa"}
            </p>

            {bagProduct && (
              <div className="flex items-center justify-center gap-6 mb-10">
                <button
                  onClick={() => setBagCount((c) => Math.max(0, c - 1))}
                  className="w-16 h-16 rounded-full text-3xl font-bold active:scale-90 transition-transform"
                  style={{ backgroundColor: TEAL_LIGHT, color: INK }}
                >
                  −
                </button>
                <span className="text-5xl font-extrabold w-16" style={{ color: INK }}>{bagCount}</span>
                <button
                  onClick={() => setBagCount((c) => Math.min(9, c + 1))}
                  className="w-16 h-16 rounded-full text-3xl font-bold active:scale-90 transition-transform"
                  style={{ backgroundColor: TEAL_LIGHT, color: INK }}
                >
                  +
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setBagCount(0); setBagModalOpen(false); pay(cart); }}
                className="flex-1 bg-white border-2 border-gray-200 text-gray-600 text-lg font-bold py-4 rounded-full"
              >
                Nei takk
              </button>
              <button
                onClick={confirmBagsAndPay}
                disabled={!!bagProduct && bagCount === 0}
                className="flex-1 text-lg font-extrabold py-4 rounded-full active:scale-95 transition-transform disabled:opacity-30"
                style={{ backgroundColor: YELLOW, color: INK }}
              >
                {bagCount > 0 && bagProduct
                  ? `Bæta við og borga (+${(bagCount * bagProduct.price).toLocaleString("is-IS")} kr.)`
                  : "Borga"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help modal */}
      {helpOpen && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setHelpOpen(false)}>
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-10 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-6xl mb-4">🙋</p>
            <h2 className="text-2xl font-extrabold mb-2" style={{ color: INK }}>Aðstoð er á leiðinni</h2>
            <p className="text-gray-500 mb-8">Starfsmaður kemur til þín fljótlega. Þú getur líka hringt í síma 455-4500.</p>
            <button
              onClick={() => setHelpOpen(false)}
              className="text-lg font-extrabold px-10 py-4 rounded-full active:scale-95 transition-transform"
              style={{ backgroundColor: YELLOW, color: INK }}
            >
              Loka
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kiosk constants ──────────────────────────────────────────────────────────
const QUICK_PICKS = [
  { emoji: "🍌", label: "Bananar", term: "bananar" },
  { emoji: "🍎", label: "Epli", term: "epli" },
  { emoji: "🍊", label: "Appelsínur", term: "appelsín" },
  { emoji: "🍅", label: "Tómatar", term: "tómat" },
  { emoji: "🫑", label: "Paprika", term: "paprika" },
  { emoji: "🥒", label: "Agúrka", term: "agúrka" },
  { emoji: "🍋", label: "Sítrónur", term: "sítrón" },
  { emoji: "🥑", label: "Avókadó", term: "avókadó" },
  { emoji: "🍄", label: "Sveppir", term: "sveppir" },
  { emoji: "🧅", label: "Laukur", term: "laukur" },
  { emoji: "🥔", label: "Kartöflur", term: "kartöflur" },
  { emoji: "🍇", label: "Vínber", term: "vínber" },
];

const LETTER_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "ð"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "æ", "ö"],
  ["z", "x", "c", "v", "b", "n", "m", "þ", "á", "é", "í"],
  ["ó", "ú", "ý"],
];

const DIGIT_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
];
