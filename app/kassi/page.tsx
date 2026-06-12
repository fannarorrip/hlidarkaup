"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface CartLine {
  id: string;
  name: string;
  price: number;
  stock?: number;
  quantity: number;
}

type Screen = "scan" | "paying" | "done" | "payError";

export default function KassiPage() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [screen, setScreen] = useState<Screen>("scan");
  const [scanError, setScanError] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [payError, setPayError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState("");

  const total = cart.reduce((s, l) => s + l.price * l.quantity, 0);

  // Keep the hidden input focused so USB scanners (keyboard wedge) always land here
  useEffect(() => {
    const t = setInterval(() => {
      if (screen === "scan") inputRef.current?.focus();
    }, 500);
    return () => clearInterval(t);
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
        return;
      }
      setCart((prev) => {
        const existing = prev.find((l) => l.id === data.id);
        if (existing) {
          if (data.stock !== undefined && existing.quantity >= data.stock) {
            setScanError(`Ekki meira til á lager af ${data.name}`);
            return prev;
          }
          return prev.map((l) => (l.id === data.id ? { ...l, quantity: l.quantity + 1 } : l));
        }
        if (data.stock !== undefined && data.stock <= 0) {
          setScanError(`${data.name} er ekki til á lager`);
          return prev;
        }
        return [...prev, { ...data, quantity: 1 }];
      });
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
    // The terminal response fills in stan/last4/processor/verification.
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
    setScreen("scan");
  }

  // ── Payment in progress ──────────────────────────────────────────────────
  if (screen === "paying") {
    return (
      <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center text-white p-8">
        <div className="text-7xl mb-8 animate-pulse">💳</div>
        <h1 className="text-4xl font-extrabold mb-3">Settu kortið á posann</h1>
        <p className="text-gray-300 text-xl">{total.toLocaleString("is-IS")} kr.</p>
        <div className="mt-10 w-16 h-16 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Receipt ──────────────────────────────────────────────────────────────
  if (screen === "done") {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-28 h-28 bg-green-100 rounded-full flex items-center justify-center mb-8">
          <span className="text-6xl">✅</span>
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2">Takk fyrir viðskiptin!</h1>
        <p className="text-gray-500 text-xl mb-1">Kvittun nr. {invoiceNumber}</p>
        <p className="text-gray-400 mb-10">{total.toLocaleString("is-IS")} kr. greitt með korti</p>
        <button
          onClick={newSale}
          className="bg-brand-red hover:bg-brand-red-dark text-white text-2xl font-bold px-16 py-6 rounded-2xl transition-colors"
        >
          Ný sala
        </button>
      </div>
    );
  }

  // ── Payment error ────────────────────────────────────────────────────────
  if (screen === "payError") {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-8 text-center">
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

  // ── Scan screen ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col">
      {/* Hidden input that captures USB scanner keystrokes */}
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

      {/* Header */}
      <header className="bg-brand-red text-white px-8 py-5 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Hlíðarkaup — Sjálfsafgreiðsla</h1>
        <span className="text-red-100 text-lg">Skannaðu vörur til að byrja</span>
      </header>

      {/* Cart */}
      <main className="flex-1 overflow-y-auto p-8">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="text-8xl mb-6">📦</div>
            <p className="text-3xl font-bold text-gray-700 mb-2">Skannaðu fyrstu vöruna</p>
            <p className="text-gray-400 text-xl">Beindu strikamerkinu að skannanum</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {cart.map((l) => (
              <div key={l.id} className="bg-white rounded-2xl shadow-sm px-6 py-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-lg">{l.name}</p>
                  <p className="text-gray-400">{l.price.toLocaleString("is-IS")} kr. stk.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => changeQty(l.id, -1)}
                    className="w-12 h-12 rounded-full bg-gray-100 hover:bg-red-100 text-2xl font-bold text-gray-700">−</button>
                  <span className="w-8 text-center text-2xl font-bold">{l.quantity}</span>
                  <button onClick={() => changeQty(l.id, 1)}
                    disabled={l.stock !== undefined && l.quantity >= l.stock}
                    className="w-12 h-12 rounded-full bg-gray-100 hover:bg-green-100 text-2xl font-bold text-gray-700 disabled:opacity-30">+</button>
                </div>
                <p className="w-28 text-right font-extrabold text-xl">
                  {(l.price * l.quantity).toLocaleString("is-IS")} kr.
                </p>
              </div>
            ))}
          </div>
        )}
        {scanError && (
          <p className="text-center text-red-600 font-bold text-xl mt-6">{scanError}</p>
        )}
      </main>

      {/* Footer / pay */}
      <footer className="bg-white border-t border-gray-200 px-8 py-6 flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-lg">Samtals</p>
          <p className="text-4xl font-extrabold text-gray-900">{total.toLocaleString("is-IS")} kr.</p>
        </div>
        <button
          onClick={pay}
          disabled={cart.length === 0}
          className="bg-brand-red hover:bg-brand-red-dark text-white text-2xl font-bold px-16 py-6 rounded-2xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Greiða með korti →
        </button>
      </footer>
    </div>
  );
}
