"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface CartLine {
  id: string;
  name: string;
  price: number;
  stock?: number;
  quantity: number;
}

type Screen = "idle" | "scan" | "paying" | "done" | "payError";

export default function KassiPage() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [screen, setScreen] = useState<Screen>("idle");
  const [scanError, setScanError] = useState("");
  const [lastScanned, setLastScanned] = useState<CartLine | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [payError, setPayError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState("");
  const lastScanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);

  // Live clock in header
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, []);

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
    let added: CartLine | null = null;
    setCart((prev) => {
      const existing = prev.find((l) => l.id === data.id);
      if (existing) {
        if (data.stock !== undefined && existing.quantity >= data.stock) {
          setScanError(`Ekki meira til á lager af ${data.name}`);
          return prev;
        }
        added = { ...existing, quantity: existing.quantity + 1 };
        return prev.map((l) => (l.id === data.id ? added! : l));
      }
      if (data.stock !== undefined && data.stock <= 0) {
        setScanError(`${data.name} er ekki til á lager`);
        return prev;
      }
      added = { id: data.id, name: data.name, price: data.price, stock: data.stock, quantity: 1 };
      return [...prev, added!];
    });
    if (added) {
      setLastScanned(added);
      if (lastScanTimer.current) clearTimeout(lastScanTimer.current);
      lastScanTimer.current = setTimeout(() => setLastScanned(null), 4000);
    }
  }, []);

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

  // ── Attract / idle screen ────────────────────────────────────────────────
  if (screen === "idle") {
    return (
      <div
        onClick={() => setScreen("scan")}
        className="fixed inset-0 z-50 bg-gradient-to-br from-brand-red via-brand-red to-red-800 flex flex-col items-center justify-center text-white cursor-pointer select-none overflow-hidden"
      >
        {scannerInput}
        {/* Decorative circles */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full bg-white/5" />
        <div className="absolute top-1/4 right-12 w-20 h-20 rounded-full bg-white/10" />

        <p className="text-7xl mb-6">🛒</p>
        <h1 className="text-6xl font-extrabold tracking-tight mb-3">Hlíðarkaup</h1>
        <p className="text-2xl text-red-100 font-medium mb-16">Sjálfsafgreiðslukassi</p>

        <div className="animate-pulse flex flex-col items-center gap-2">
          <p className="text-3xl font-bold">Skannaðu vöru til að byrja</p>
          <p className="text-red-200 text-lg">eða snertu skjáinn</p>
        </div>

        <p className="absolute bottom-8 text-red-200/70 text-sm">
          Akurhlíð 1 · Sauðárkrókur
        </p>
      </div>
    );
  }

  // ── Payment in progress ──────────────────────────────────────────────────
  if (screen === "paying") {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white p-8">
        <div className="relative mb-10">
          <div className="w-40 h-28 bg-gray-800 border-2 border-gray-600 rounded-xl flex items-center justify-center">
            <div className="w-24 h-3 bg-gray-600 rounded-full" />
          </div>
          <div className="absolute -top-8 right-2 text-6xl animate-bounce">💳</div>
        </div>
        <h1 className="text-4xl font-extrabold mb-3">Settu kortið á posann</h1>
        <p className="text-gray-400 text-xl mb-2">Fylgdu leiðbeiningum á posanum</p>
        <p className="text-5xl font-extrabold text-green-400 mt-6">{total.toLocaleString("is-IS")} kr.</p>
        <div className="mt-12 w-14 h-14 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Receipt / done ───────────────────────────────────────────────────────
  if (screen === "done") {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-b from-green-50 to-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center mb-8 shadow-lg shadow-green-200">
          <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-5xl font-extrabold text-gray-900 mb-3">Takk fyrir viðskiptin!</h1>
        <p className="text-2xl text-gray-600 mb-1">{total.toLocaleString("is-IS")} kr. greitt með korti</p>
        <p className="text-gray-400 text-lg mb-12">Kvittun nr. {invoiceNumber}</p>
        <button
          onClick={newSale}
          className="bg-brand-red hover:bg-brand-red-dark text-white text-2xl font-bold px-16 py-6 rounded-2xl transition-colors shadow-lg"
        >
          Ný sala
        </button>
        <p className="text-gray-300 text-sm mt-8">Skjárinn fer sjálfkrafa á byrjunarskjá</p>
      </div>
    );
  }

  // ── Payment error ────────────────────────────────────────────────────────
  if (screen === "payError") {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-28 h-28 bg-red-100 rounded-full flex items-center justify-center mb-8">
          <span className="text-6xl">❌</span>
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-3">Eitthvað fór úrskeiðis</h1>
        <p className="text-gray-500 text-lg mb-10">{payError}</p>
        <div className="flex gap-4">
          <button onClick={() => setScreen("scan")}
            className="bg-white border-2 border-gray-300 text-gray-700 text-xl font-bold px-10 py-5 rounded-2xl">
            Til baka í körfu
          </button>
          <button onClick={() => pay(cart)}
            className="bg-brand-red hover:bg-brand-red-dark text-white text-xl font-bold px-10 py-5 rounded-2xl transition-colors">
            Reyna aftur
          </button>
        </div>
      </div>
    );
  }

  // ── Main scanning screen ─────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col">
      {scannerInput}

      {/* Header */}
      <header className="bg-brand-red text-white px-8 py-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🛒</span>
          <div>
            <h1 className="text-xl font-extrabold leading-tight">Hlíðarkaup</h1>
            <p className="text-red-200 text-xs">Sjálfsafgreiðsla</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-red-100 font-medium hidden sm:block">Skannaðu vörurnar þínar</span>
          <button
            onClick={() => setHelpOpen(true)}
            className="bg-white/15 hover:bg-white/25 px-4 py-1.5 rounded-lg font-bold transition-colors"
          >
            🙋 Fá aðstoð
          </button>
          <span className="bg-white/15 px-3 py-1 rounded-lg font-mono text-lg">{clock}</span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Item list (receipt style) */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-44 h-44 rounded-full bg-white shadow-inner flex items-center justify-center text-8xl mb-8">
                  📦
                </div>
                <p className="text-3xl font-bold text-gray-700 mb-2">Skannaðu fyrstu vöruna</p>
                <p className="text-gray-400 text-xl">Beindu strikamerkinu að skannanum fyrir neðan skjáinn</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-100 flex justify-between text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <span>Vara</span>
                  <span>Verð</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {cart.map((l, i) => (
                    <div
                      key={l.id}
                      className={`px-6 py-3.5 flex items-center gap-4 transition-colors ${
                        lastScanned?.id === l.id ? "bg-green-50" : ""
                      }`}
                    >
                      <span className="text-gray-300 font-mono text-sm w-6">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate">{l.name}</p>
                        <p className="text-gray-400 text-sm">
                          {l.quantity > 1 && `${l.quantity} × `}{l.price.toLocaleString("is-IS")} kr.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => changeQty(l.id, -1)}
                          className="w-10 h-10 rounded-full bg-gray-100 hover:bg-red-100 text-xl font-bold text-gray-600 transition-colors">−</button>
                        <span className="w-7 text-center text-lg font-bold">{l.quantity}</span>
                        <button onClick={() => changeQty(l.id, 1)}
                          disabled={l.stock !== undefined && l.quantity >= l.stock}
                          className="w-10 h-10 rounded-full bg-gray-100 hover:bg-green-100 text-xl font-bold text-gray-600 transition-colors disabled:opacity-30">+</button>
                      </div>
                      <p className="w-24 text-right font-extrabold text-gray-900">
                        {(l.price * l.quantity).toLocaleString("is-IS")} kr.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Last scanned toast / error bar */}
          {(lastScanned || scanError) && (
            <div className={`mx-6 mb-4 px-6 py-4 rounded-2xl flex items-center gap-4 shadow-lg ${
              scanError ? "bg-red-600 text-white" : "bg-gray-900 text-white"
            }`}>
              {scanError ? (
                <>
                  <span className="text-3xl">⚠️</span>
                  <p className="font-bold text-lg">{scanError}</p>
                </>
              ) : lastScanned && (
                <>
                  <span className="text-3xl">✅</span>
                  <div className="flex-1">
                    <p className="font-bold text-lg leading-tight">{lastScanned.name}</p>
                    <p className="text-gray-300 text-sm">bætt í körfu</p>
                  </div>
                  <p className="font-extrabold text-xl">{lastScanned.price.toLocaleString("is-IS")} kr.</p>
                </>
              )}
            </div>
          )}
        </main>

        {/* Side panel — totals & pay */}
        <aside className="w-80 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-6 flex-1">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-5">Karfan þín</h2>
            <div className="space-y-3 text-gray-600">
              <div className="flex justify-between">
                <span>Vörur</span>
                <span className="font-bold text-gray-900">{itemCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Verð m. vsk.</span>
                <span className="font-bold text-gray-900">{total.toLocaleString("is-IS")} kr.</span>
              </div>
            </div>
            <div className="border-t border-gray-100 mt-5 pt-5">
              <div className="flex justify-between items-end">
                <span className="text-gray-500 font-medium">Samtals</span>
                <span className="text-3xl font-extrabold text-gray-900">{total.toLocaleString("is-IS")} kr.</span>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-3">
            <button
              onClick={openSearch}
              className="w-full bg-white border-2 border-gray-300 hover:border-brand-red hover:text-brand-red text-gray-700 text-lg font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              🔍 Leita að vöru
            </button>
            <button
              onClick={startPay}
              disabled={cart.length === 0}
              className="w-full bg-green-600 hover:bg-green-700 text-white text-xl font-extrabold py-5 rounded-2xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-green-100"
            >
              Greiða með korti
            </button>
            <button
              onClick={newSale}
              disabled={cart.length === 0}
              className="w-full bg-white border-2 border-gray-200 hover:border-red-300 hover:text-red-600 text-gray-500 font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-30"
            >
              Hætta við kaup
            </button>
          </div>
        </aside>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <div className="absolute inset-0 z-20 bg-black/40 flex items-start justify-center pt-16" onClick={closeSearch}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-6 max-h-[75vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100 flex items-center gap-3">
              <span className="text-2xl">🔍</span>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Leitaðu að vöru, t.d. bananar..."
                className="flex-1 text-xl font-medium outline-none placeholder:text-gray-300"
              />
              <button
                onClick={closeSearch}
                className="w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 text-xl font-bold text-gray-500"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {searching ? (
                <div className="py-14 text-center">
                  <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Leita...</p>
                </div>
              ) : searchQuery.trim().length < 2 ? (
                <div>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Vinsælar vörur</p>
                  <div className="grid grid-cols-4 gap-3">
                    {QUICK_PICKS.map((q) => (
                      <button
                        key={q.term}
                        onClick={() => setSearchQuery(q.term)}
                        className="bg-gray-50 hover:bg-red-50 border border-gray-100 hover:border-brand-red rounded-2xl p-4 flex flex-col items-center gap-2 transition-colors"
                      >
                        <span className="text-4xl">{q.emoji}</span>
                        <span className="font-bold text-gray-800 text-sm">{q.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : searchResults.length === 0 ? (
                <p className="py-14 text-center text-gray-400 text-lg">Engin vara fannst</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {searchResults.map((p) => {
                    const out = p.stock !== undefined && p.stock <= 0;
                    return (
                      <button
                        key={p.id}
                        disabled={out}
                        onClick={() => {
                          handleScan(p.id);
                          closeSearch();
                        }}
                        className="text-left bg-gray-50 hover:bg-red-50 border border-gray-100 hover:border-brand-red rounded-2xl p-4 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <p className="font-bold text-gray-900 leading-snug line-clamp-2">{p.name}</p>
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-brand-red font-extrabold">{p.price.toLocaleString("is-IS")} kr.</p>
                          {out && <span className="text-xs font-bold text-gray-400">Ekki til á lager</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* On-screen keyboard */}
            <div className="border-t border-gray-100 bg-gray-50 p-3 select-none">
              {(showDigits ? DIGIT_ROWS : LETTER_ROWS).map((row, i) => (
                <div key={i} className="flex justify-center gap-1.5 mb-1.5">
                  {row.map((k) => (
                    <button
                      key={k}
                      onClick={() => setSearchQuery((q) => q + k)}
                      className="w-12 h-12 bg-white border border-gray-200 rounded-xl font-bold text-lg text-gray-800 hover:bg-red-50 hover:border-brand-red active:scale-95 transition-all uppercase"
                    >
                      {k}
                    </button>
                  ))}
                </div>
              ))}
              <div className="flex justify-center gap-1.5">
                <button
                  onClick={() => setShowDigits((d) => !d)}
                  className="w-20 h-12 bg-white border border-gray-200 rounded-xl font-bold text-sm text-gray-600 hover:bg-red-50 active:scale-95 transition-all"
                >
                  {showDigits ? "ABC" : "0-9"}
                </button>
                <button
                  onClick={() => setSearchQuery((q) => q + " ")}
                  className="flex-1 max-w-xs h-12 bg-white border border-gray-200 rounded-xl font-bold text-sm text-gray-600 hover:bg-red-50 active:scale-95 transition-all"
                >
                  BIL
                </button>
                <button
                  onClick={() => setSearchQuery((q) => q.slice(0, -1))}
                  className="w-20 h-12 bg-white border border-gray-200 rounded-xl font-bold text-xl text-gray-600 hover:bg-red-50 active:scale-95 transition-all"
                >
                  ⌫
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bag prompt before payment */}
      {bagModalOpen && (
        <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 text-center">
            <p className="text-6xl mb-4">🛍️</p>
            <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Þarftu poka?</h2>
            <p className="text-gray-500 mb-8">
              {bagProduct
                ? `${bagProduct.name} — ${bagProduct.price.toLocaleString("is-IS")} kr. stk.`
                : "Pokar eru ekki í boði á þessum kassa"}
            </p>

            {bagProduct && (
              <div className="flex items-center justify-center gap-6 mb-10">
                <button
                  onClick={() => setBagCount((c) => Math.max(0, c - 1))}
                  className="w-16 h-16 rounded-full bg-gray-100 hover:bg-red-100 text-3xl font-bold text-gray-700 transition-colors"
                >
                  −
                </button>
                <span className="text-5xl font-extrabold text-gray-900 w-16">{bagCount}</span>
                <button
                  onClick={() => setBagCount((c) => Math.min(9, c + 1))}
                  className="w-16 h-16 rounded-full bg-gray-100 hover:bg-green-100 text-3xl font-bold text-gray-700 transition-colors"
                >
                  +
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setBagCount(0); setBagModalOpen(false); pay(cart); }}
                className="flex-1 bg-white border-2 border-gray-200 hover:border-gray-400 text-gray-600 text-lg font-bold py-4 rounded-2xl transition-colors"
              >
                Nei takk
              </button>
              <button
                onClick={confirmBagsAndPay}
                disabled={!!bagProduct && bagCount === 0}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-lg font-extrabold py-4 rounded-2xl transition-colors disabled:opacity-30"
              >
                {bagCount > 0 && bagProduct
                  ? `Bæta við og greiða (+${(bagCount * bagProduct.price).toLocaleString("is-IS")} kr.)`
                  : "Greiða"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help modal */}
      {helpOpen && (
        <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center p-6" onClick={() => setHelpOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-6xl mb-4">🙋</p>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Aðstoð er á leiðinni</h2>
            <p className="text-gray-500 mb-8">Starfsmaður kemur til þín fljótlega. Þú getur líka hringt í síma 455-4500.</p>
            <button
              onClick={() => setHelpOpen(false)}
              className="bg-brand-red hover:bg-brand-red-dark text-white text-lg font-bold px-10 py-4 rounded-2xl transition-colors"
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
