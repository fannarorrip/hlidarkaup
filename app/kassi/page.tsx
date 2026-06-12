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
      if (screen === "idle" || screen === "scan") inputRef.current?.focus();
    }, 500);
    return () => clearInterval(t);
  }, [screen]);

  // Auto-return to attract screen after a finished sale
  useEffect(() => {
    if (screen !== "done") return;
    const t = setTimeout(() => newSale(), 15_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

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
        added = { ...data, quantity: 1 };
        return [...prev, added!];
      });
      if (added) {
        setLastScanned(added);
        if (lastScanTimer.current) clearTimeout(lastScanTimer.current);
        lastScanTimer.current = setTimeout(() => setLastScanned(null), 4000);
      }
      setScreen("scan");
    } catch {
      setScanError("Villa við að sækja vöru");
    } finally {
      setBusy(false);
    }
  }, [busy]);

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

  async function pay() {
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
        body: JSON.stringify({ items: cart.map(({ id, quantity }) => ({ id, quantity })), payment }),
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
          <button onClick={pay}
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
        <div className="flex items-center gap-6">
          <span className="text-red-100 font-medium hidden sm:block">Skannaðu vörurnar þínar</span>
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
              onClick={pay}
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
    </div>
  );
}
