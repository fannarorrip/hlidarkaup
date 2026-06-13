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
type Lang = "is" | "en";

const STR = {
  is: {
    langName: "Íslenska",
    langFlag: "🇮🇸",
    selfCheckout: "Sjálfsafgreiðslukassi",
    scanToStart: "Skannaðu vöru til að byrja",
    orTouch: "eða snertu skjáinn",
    yourCart: "Karfan þín",
    pcs: "stk.",
    waitingPayment: "Bíð eftir greiðslu",
    followTerminal: "Fylgdu leiðbeiningum á posanum",
    price: "Verð",
    thanks: "Takk fyrir viðskiptin!",
    paidByCard: "greitt með korti",
    receiptNo: "Kvittun nr.",
    newSale: "Ný sala",
    autoReturn: "Skjárinn fer sjálfkrafa á byrjunarskjá",
    somethingWrong: "Eitthvað fór úrskeiðis",
    backToCart: "Til baka í körfu",
    retry: "Reyna aftur",
    scanItem: "Skannaðu vöru",
    pointBarcode: "Beindu strikamerkinu að skannanum",
    searchProduct: "Leita að vöru",
    getHelp: "Fá aðstoð",
    cartEmpty: "Karfan er tóm",
    perPiece: "kr. / stk.",
    totalLabel: "Samtals:",
    vatIncluded: "VSK innifalinn",
    payNow: "Borga",
    searchPromptA: "Leitaðu eftir nafni",
    searchPromptB: "eða veldu vinsæla vöru",
    popular: "Vinsælar",
    typeName: "SLÁÐU INN NAFN",
    searchingNow: "Leita...",
    noResults: "Engin vara fannst",
    outOfStock: "Ekki til",
    space: "BIL",
    back: "Til baka",
    helpComing: "Aðstoð er á leiðinni",
    helpText: "Starfsmaður kemur til þín fljótlega. Þú getur líka hringt í síma 455-4500.",
    close: "Loka",
    receiptPrinting: "Kvittunin er að prentast",
    bagTitle: "Poka?",
    chooseQty: "Veldu magn",
    noBag: "Engan poka",
    thanksShort: "Takk fyrir!",
    sumPrefix: "Samtals",
    sumItems: "vörur og",
    sumLines: "vöruliðir í körfu",
    rememberItems: "Mundu eftir vörunum þínum.",
    printReceipt: "Prenta kvittun",
    eReceipt: "Rafræn kvittun",
    newCheckout: "Ný afgreiðsla",
    comingSoon: "Kemur fljótlega",
  },
  en: {
    langName: "English",
    langFlag: "🇬🇧",
    selfCheckout: "Self-checkout",
    scanToStart: "Scan an item to start",
    orTouch: "or touch the screen",
    yourCart: "Your basket",
    pcs: "pcs",
    waitingPayment: "Waiting for payment",
    followTerminal: "Follow the instructions on the terminal",
    price: "Price",
    thanks: "Thank you for shopping!",
    paidByCard: "paid by card",
    receiptNo: "Receipt no.",
    newSale: "New sale",
    autoReturn: "The screen returns to start automatically",
    somethingWrong: "Something went wrong",
    backToCart: "Back to basket",
    retry: "Try again",
    scanItem: "Scan an item",
    pointBarcode: "Point the barcode at the scanner",
    searchProduct: "Search for item",
    getHelp: "Get help",
    cartEmpty: "Your basket is empty",
    perPiece: "kr. each",
    totalLabel: "Total:",
    vatIncluded: "VAT included",
    payNow: "Pay",
    searchPromptA: "Search by name",
    searchPromptB: "or pick a popular item",
    popular: "Popular",
    typeName: "TYPE A NAME",
    searchingNow: "Searching...",
    noResults: "No items found",
    outOfStock: "Out of stock",
    space: "SPACE",
    back: "Back",
    helpComing: "Help is on the way",
    helpText: "A member of staff will be with you shortly. You can also call 455-4500.",
    close: "Close",
    receiptPrinting: "Your receipt is printing",
    bagTitle: "Bags?",
    chooseQty: "Choose quantity",
    noBag: "No bag",
    thanksShort: "Thank you!",
    sumPrefix: "Total",
    sumItems: "items and",
    sumLines: "product lines in your basket",
    rememberItems: "Don't forget your items.",
    printReceipt: "Print receipt",
    eReceipt: "E-receipt",
    newCheckout: "New checkout",
    comingSoon: "Coming soon",
  },
} as const;

// ── Kiosk palette (Hlíðarkaup: red + white + warm cream) ─────────────────────
const RED = "#eb1515";
const RED_DARK = "#c00f0f";
const CREAM = "#F3E9D7";
const PINK = "#FCE7E7";
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
  const [bagProduct, setBagProduct] = useState<{ id: string; name: string; price: number } | null>(null);
  const [eReceiptHint, setEReceiptHint] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showDigits, setShowDigits] = useState(false);
  const [receiptWanted, setReceiptWanted] = useState(false);
  const [lang, setLang] = useState<Lang>("is");
  const t = STR[lang];
  const otherLang = STR[lang === "is" ? "en" : "is"];

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
    const t = setTimeout(() => newSale(), 30_000);
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
    if (!bagProduct) {
      pay(cart);
      return;
    }
    setBagModalOpen(true);
  }

  /** Picking a count on the numpad (or "Engan poka") adds the bags and charges. */
  function payWithBags(count: number) {
    setBagModalOpen(false);
    let finalCart = cart;
    if (count > 0 && bagProduct) {
      const existing = cart.find((l) => l.id === bagProduct.id);
      finalCart = existing
        ? cart.map((l) => (l.id === bagProduct.id ? { ...l, quantity: l.quantity + count } : l))
        : [...cart, { ...bagProduct, quantity: count }];
      setCart(finalCart);
    }
    pay(finalCart);
  }

  async function pay(finalCart: CartLine[]) {
    setScreen("paying");
    setPayError("");

    // MOCK terminal: replace this block with the Straumur terminal call.
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
    setReceiptWanted(false);
    setEReceiptHint(false);
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

  /* Language toggle — shows the language you switch TO */
  const langButton = (onRed = false) => (
    <button
      onClick={() => setLang((l) => (l === "is" ? "en" : "is"))}
      className="flex items-center gap-3 active:scale-95 transition-transform"
    >
      <span className="font-bold text-lg" style={{ color: onRed ? "#fff" : INK }}>{otherLang.langName}</span>
      <span className="w-10 h-10 rounded-full overflow-hidden shadow flex items-center justify-center text-2xl bg-white">
        {otherLang.langFlag}
      </span>
    </button>
  );

  const helpButton = (
    <button
      onClick={() => setHelpOpen(true)}
      className="absolute bottom-6 left-8 z-20 flex items-center gap-3 group"
    >
      <span
        className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-md group-active:scale-95 transition-transform"
        style={{ backgroundColor: RED }}
      >
        🙋
      </span>
      <span className="font-bold text-lg" style={{ color: INK }}>{t.getHelp}</span>
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
          <path d="M0,0 H320 C380,120 260,200 300,320 C200,400 80,330 0,360 Z" fill={RED} />
        </svg>
        <svg className="absolute bottom-0 right-0 w-[40%] h-[50%]" viewBox="0 0 400 400" preserveAspectRatio="none">
          <path d="M400,400 V60 C300,20 240,140 140,120 C60,220 140,330 100,400 Z" fill={CREAM} />
        </svg>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Hlíðarkaup" className="relative z-10 w-[28rem] max-w-[70vw] mb-4" />
        <p className="relative z-10 text-2xl font-medium mb-16 text-gray-500">{t.selfCheckout}</p>

        <div className="relative z-10 animate-pulse flex flex-col items-center gap-2">
          <p className="text-3xl font-bold" style={{ color: INK }}>{t.scanToStart}</p>
          <p className="text-gray-400 text-lg">{t.orTouch}</p>
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
          <path d="M0,0 H300 C370,130 250,220 290,340 C190,410 70,340 0,370 Z" fill={PINK} />
        </svg>
        <svg className="absolute bottom-0 right-0 w-[45%] h-[55%] opacity-70" viewBox="0 0 400 400" preserveAspectRatio="none">
          <path d="M400,400 V50 C290,10 230,150 130,130 C50,230 130,340 90,400 Z" fill={PINK} />
        </svg>

        {/* Cart summary, dimmed at the edge like the reference */}
        <div className="absolute left-0 inset-y-0 w-72 p-8 hidden lg:flex flex-col opacity-50">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-5">{t.yourCart}</p>
          <div className="space-y-3 flex-1 overflow-hidden">
            {cart.map((l) => (
              <div key={l.id} className="bg-white/70 rounded-2xl px-4 py-3">
                <p className="font-bold text-sm leading-snug" style={{ color: INK }}>{l.name}</p>
                <p className="text-gray-400 text-xs mt-0.5">{l.quantity} {t.pcs} · {(l.price * l.quantity).toLocaleString("is-IS")} kr.</p>
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
              <rect x="107" y="92" width="54" height="26" rx="4" fill={CREAM} opacity="0.5" />
              <circle cx="116" cy="132" r="5" fill={RED} />
              {[0, 1, 2].map((r) =>
                [0, 1, 2].map((c) => (
                  <rect key={`${r}${c}`} x={130 + c * 13} y={126 + r * 13} width="9" height="9" rx="2" fill="#e5e5e5" stroke={INK} strokeWidth="1" />
                )),
              )}
              {/* Card */}
              <g transform="rotate(-18 185 65)">
                <rect x="158" y="48" width="56" height="36" rx="6" fill="#fff" stroke={INK} strokeWidth="3" />
                <rect x="166" y="58" width="14" height="11" rx="2" fill={CREAM} />
              </g>
              {/* Hand + thumbs up */}
              <g stroke={INK} strokeWidth="3" fill="#fff" strokeLinejoin="round" strokeLinecap="round">
                <path d="M205 60 C225 50 240 52 248 60 C254 66 252 76 244 80 L214 92 C204 95 196 88 198 78 Z" />
                <path d="M222 52 C220 42 226 34 233 36 C239 38 240 47 236 54" />
              </g>
              {/* Sleeve */}
              <path d="M244 58 L260 50 L260 92 L240 84 Z" fill={RED} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
              {/* Contactless waves */}
              <g stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5">
                <path d="M186 96 a14 14 0 0 1 0 20" />
                <path d="M193 90 a22 22 0 0 1 0 32" />
              </g>
            </svg>

            <h1 className="text-3xl font-extrabold mb-2" style={{ color: INK }}>{t.waitingPayment}</h1>
            <p className="text-gray-400 text-lg mb-6">{t.followTerminal}</p>
            <p className="text-4xl font-extrabold mb-8" style={{ color: INK }}>{t.price}: {total.toLocaleString("is-IS")} kr.</p>
            <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: RED_DARK, borderTopColor: "transparent" }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Receipt / done ───────────────────────────────────────────────────────
  if (screen === "done") {
    const itemCount = cart.reduce((s, l) => s + l.quantity, 0);
    return (
      <div className="fixed inset-0 z-50 flex overflow-hidden" style={PATTERN_BG}>
        {/* Right: big red circle blob with illustration + actions (like the photo) */}
        <svg className="absolute -top-[10%] -right-[12%] w-[65%] h-[130%]" viewBox="0 0 400 400" preserveAspectRatio="none">
          <circle cx="220" cy="200" r="190" fill={RED} />
        </svg>

        {/* Left: thank-you text */}
        <div className="relative z-10 w-[55%] flex flex-col px-12 pt-8 pb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Hlíðarkaup" className="h-12 w-auto self-start mb-10" />
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <h1 className="text-7xl font-extrabold mb-8" style={{ color: INK }}>{t.thanksShort}</h1>
            <p className="text-xl text-gray-600 mb-6 flex items-center gap-2 flex-wrap">
              {t.sumPrefix}
              <span className="inline-flex w-9 h-9 rounded-full items-center justify-center font-extrabold text-white" style={{ backgroundColor: RED }}>
                {itemCount}
              </span>
              {t.sumItems}
              <span className="inline-flex w-9 h-9 rounded-full items-center justify-center font-extrabold text-white" style={{ backgroundColor: RED }}>
                {cart.length}
              </span>
              {t.sumLines}
            </p>
            <p
              className="text-4xl font-extrabold self-start mb-6 pb-1"
              style={{ color: INK, boxShadow: `inset 0 -0.45em 0 ${PINK}` }}
            >
              {total.toLocaleString("is-IS")} kr.
            </p>
            <p className="text-gray-400 mb-2">{t.receiptNo} {invoiceNumber}</p>
            <p className="text-xl font-bold" style={{ color: INK }}>{t.rememberItems}</p>
          </div>

          {/* Bottom-left: e-receipt */}
          <button
            onClick={() => setEReceiptHint(true)}
            className="self-start flex items-center gap-3 active:scale-95 transition-transform"
          >
            <span className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-md" style={{ backgroundColor: PINK }}>
              ✉️
            </span>
            <span className="font-bold text-lg" style={{ color: INK }}>
              {t.eReceipt}{eReceiptHint && <span className="text-gray-400 font-medium"> — {t.comingSoon}</span>}
            </span>
          </button>
        </div>

        {/* Right column content over the red circle */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-10 pr-8">
          {/* Grocery bag illustration */}
          <svg viewBox="0 0 200 140" className="w-72 h-52">
            <path d="M60 12 q8 -10 16 0" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
            <text x="28" y="38" fontSize="26">🥕</text>
            <text x="62" y="28" fontSize="26">🍎</text>
            <text x="98" y="32" fontSize="26">🥛</text>
            <text x="132" y="40" fontSize="26">🥖</text>
            <rect x="30" y="44" width="84" height="78" rx="8" fill="#fff" />
            <path d="M52 44 q0 -16 16 -16 q16 0 16 16" fill="none" stroke={INK} strokeWidth="4" />
            <circle cx="60" cy="84" r="4.5" fill={INK} />
            <circle cx="84" cy="84" r="4.5" fill={INK} />
            <path d="M64 100 q8 7 16 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
            <rect x="122" y="58" width="52" height="64" rx="8" fill={PINK} />
            <path d="M136 58 q0 -12 12 -12 q12 0 12 12" fill="none" stroke={INK} strokeWidth="4" />
          </svg>

          <div className="flex flex-col gap-4 w-72">
            <button
              onClick={() => setReceiptWanted(true)}
              disabled={receiptWanted}
              className="bg-white rounded-full py-5 px-8 text-xl font-extrabold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-3 disabled:opacity-90"
              style={{ color: INK }}
            >
              🧾 {receiptWanted ? `${t.receiptPrinting}…` : t.printReceipt}
            </button>
            <button
              onClick={newSale}
              className="bg-white rounded-full py-5 px-8 text-xl font-extrabold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-3"
              style={{ color: INK }}
            >
              🛍️ {t.newCheckout}
            </button>
          </div>
        </div>
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
        <h1 className="text-3xl font-extrabold mb-3" style={{ color: INK }}>{t.somethingWrong}</h1>
        <p className="text-gray-500 text-lg mb-10">{payError}</p>
        <div className="flex gap-4">
          <button onClick={() => setScreen("scan")}
            className="bg-white border-2 border-gray-300 text-gray-700 text-xl font-bold px-10 py-5 rounded-full">{t.backToCart}</button>
          <button onClick={() => pay(cart)}
            className="text-xl font-extrabold px-10 py-5 rounded-full active:scale-95 transition-transform"
            style={{ backgroundColor: RED, color: "#fff" }}>{t.retry}</button>
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
          <path d="M0,0 H372 C448,180 340,360 408,540 C460,700 350,810 396,900 H0 Z" fill={RED} />
        </svg>

        <div className="relative z-10 flex flex-col h-full px-10 pt-8 pb-24">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Hlíðarkaup"
            className="h-12 w-auto self-start mb-6"
            style={{ filter: "brightness(0) invert(1)" }}
          />

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
                <p className="text-2xl font-bold" style={{ color: INK }}>{t.scanItem}</p>
                <p className="text-gray-400">{t.pointBarcode}</p>
              </div>
            )}
          </div>

          {scanError && (
            <div className="mt-4 max-w-md bg-white rounded-2xl px-5 py-3 font-bold flex items-center gap-3 shadow-md" style={{ color: RED_DARK }}>
              <span className="text-2xl">⚠️</span> {scanError}
            </div>
          )}
        </div>
      </div>

      {/* Center: search pill straddling the boundary */}
      <button
        onClick={openSearch}
        className="absolute z-30 bottom-6 left-[38%] -translate-x-1/2 flex items-center gap-3 px-8 py-4 rounded-full font-extrabold text-lg shadow-lg border-4 border-white active:scale-95 transition-transform"
        style={{ backgroundColor: RED, color: "#fff" }}
      >
        🔍 {t.searchProduct}
      </button>

      {helpButton}

      {/* Right: cart list + Samtals + Borga */}
      <div className="flex-1 flex flex-col relative z-10">
        <div className="flex justify-end items-center px-8 pt-6 pb-2">
          {langButton()}
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-2 space-y-3">
          {cart.length === 0 ? (
            <p className="text-gray-300 text-xl font-medium text-center mt-24">{t.cartEmpty}</p>
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
                  style={{ backgroundColor: PINK }}
                >
                  <button onClick={() => changeQty(l.id, -1)} className="w-8 h-8 rounded-lg bg-white font-bold text-lg active:scale-90 transition-transform">−</button>
                  <span className="font-extrabold px-1 whitespace-nowrap" style={{ color: INK }}>{l.quantity} {t.pcs}</span>
                  <button
                    onClick={() => changeQty(l.id, 1)}
                    disabled={l.stock !== undefined && l.quantity >= l.stock}
                    className="w-8 h-8 rounded-lg bg-white font-bold text-lg active:scale-90 transition-transform disabled:opacity-30"
                  >+</button>
                </div>
                <div className="flex-1 min-w-0 text-center">
                  <p className="font-bold truncate" style={{ color: INK }}>{l.name}</p>
                  <p className="text-gray-400 text-sm">{l.price.toLocaleString("is-IS")} {t.perPiece}</p>
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
            <span className="text-xl font-bold text-gray-500">{t.totalLabel}</span>
            <div className="text-right">
              <p className="text-3xl font-extrabold" style={{ color: INK }}>{total.toLocaleString("is-IS")} kr.</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{t.vatIncluded}</p>
            </div>
          </div>
        </div>
        <button
          onClick={startPay}
          disabled={cart.length === 0}
          className="h-16 text-xl font-extrabold tracking-wide transition-opacity disabled:opacity-40"
          style={{ backgroundColor: RED, color: "#fff" }}
        >{t.payNow}</button>
      </div>

      {/* Full-screen search — Krónan produce-style */}
      {searchOpen && (
        <div className="absolute inset-0 z-40 flex overflow-hidden" style={PATTERN_BG}>
          {/* Teal blob left, yellow blob right */}
          <svg className="absolute top-0 left-0 w-[55%] h-full" viewBox="0 0 550 900" preserveAspectRatio="none">
            <path d="M0,0 H460 C540,200 420,400 500,580 C540,740 430,830 470,900 H0 Z" fill={CREAM} opacity="0.9" />
          </svg>
          <svg className="absolute top-0 right-0 w-[52%] h-full" viewBox="0 0 520 900" preserveAspectRatio="none">
            <path d="M520,0 H90 C20,180 130,380 60,560 C20,730 120,830 80,900 H520 Z" fill={RED} />
          </svg>

          {/* Left: prompt + popular / results */}
          <div className="relative z-10 w-[48%] shrink-0 flex flex-col px-10 pt-8 pb-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Hlíðarkaup" className="h-12 w-auto self-start mb-5" />

            <div className="bg-white/95 rounded-[2rem] shadow-sm flex-1 flex flex-col p-7 overflow-hidden" style={PATTERN_BG}>
              <div className="flex items-start gap-3 mb-5">
                <span className="text-3xl">🪄</span>
                <p className="text-lg font-medium leading-snug" style={{ color: INK }}>
                  {t.searchPromptA}<br />{t.searchPromptB}
                </p>
              </div>

              {searching ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 border-4 rounded-full animate-spin mb-4" style={{ borderColor: RED, borderTopColor: "transparent" }} />
                  <p className="text-gray-400">{t.searchingNow}</p>
                </div>
              ) : searchQuery.trim().length >= 2 ? (
                searchResults.length === 0 ? (
                  <p className="flex-1 flex items-center justify-center text-gray-400 text-lg">{t.noResults}</p>
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
                            {out && <span className="text-xs font-bold text-gray-400">{t.outOfStock}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <>
                  <p className="text-sm font-bold text-gray-500 mb-3">{t.popular}</p>
                  <div className="grid grid-cols-5 gap-3 content-start">
                    {QUICK_PICKS.map((q) => (
                      <button
                        key={q.term}
                        onClick={() => setSearchQuery(q.term)}
                        className="bg-white rounded-2xl p-3 flex flex-col items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={q.img} alt={q.label} className="w-16 h-16 object-contain" />
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
            <div className="flex justify-end items-center mb-8">
              {langButton(true)}
            </div>

            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.typeName}
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
                      style={{ backgroundColor: "#fff", color: RED_DARK }}
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
                  style={{ backgroundColor: "#fff", color: RED_DARK }}
                >
                  {showDigits ? "ABC" : "0-9"}
                </button>
                <button
                  onClick={() => setSearchQuery((q) => q + " ")}
                  className="w-52 h-12 rounded-xl font-extrabold text-sm shadow-sm active:scale-95 transition-transform"
                  style={{ backgroundColor: "#fff", color: RED_DARK }}
                >{t.space}</button>
                <button
                  onClick={() => setSearchQuery((q) => q.slice(0, -1))}
                  className="w-24 h-12 rounded-xl font-extrabold text-xl shadow-sm active:scale-95 transition-transform"
                  style={{ backgroundColor: "#fff", color: RED_DARK }}
                >
                  ⌫
                </button>
              </div>
            </div>

            <div className="flex-1" />
            <button
              onClick={closeSearch}
              className="self-end bg-white rounded-2xl px-10 py-4 font-extrabold text-lg shadow-md border-2 active:scale-95 transition-transform"
              style={{ borderColor: RED_DARK, color: INK }}
            >
              ← {t.back}
            </button>
          </div>

          <div className="absolute bottom-6 left-8 z-20">
            <button onClick={() => setHelpOpen(true)} className="flex items-center gap-3 group">
              <span className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-md group-active:scale-95 transition-transform" style={{ backgroundColor: RED }}>🙋</span>
              <span className="font-bold text-lg" style={{ color: INK }}>{t.getHelp}</span>
            </button>
          </div>
        </div>
      )}

      {/* Bag prompt before payment — Krónan-style: bag illustration + numpad */}
      {bagModalOpen && bagProduct && (
        <div className="absolute inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-8">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl p-10 flex gap-10" style={PATTERN_BG}>
            {/* Left: bag with eyes + price tag */}
            <div className="flex-1 flex flex-col">
              <h2 className="text-3xl font-extrabold mb-4" style={{ color: INK }}>{t.bagTitle}</h2>
              <svg viewBox="0 0 220 200" className="w-full max-w-xs mx-auto">
                {/* Price tag */}
                <g transform="rotate(-14 60 50)">
                  <rect x="14" y="34" width="96" height="34" rx="6" fill={RED} />
                  <text x="62" y="57" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff">
                    {bagProduct.price.toLocaleString("is-IS")} kr. {t.pcs}
                  </text>
                </g>
                <path d="M104 64 q14 10 18 26" fill="none" stroke={INK} strokeWidth="2.5" strokeDasharray="1 6" strokeLinecap="round" />
                {/* Paper bag */}
                <rect x="92" y="88" width="92" height="96" rx="6" fill="#E8C99B" stroke={INK} strokeWidth="3" />
                <path d="M112 88 q0 -22 26 -22 q26 0 26 22" fill="none" stroke={INK} strokeWidth="3.5" />
                <line x1="92" y1="170" x2="184" y2="170" stroke={INK} strokeWidth="2" strokeDasharray="5 5" opacity="0.35" />
                {/* Eyes */}
                <circle cx="156" cy="124" r="6" fill="#fff" stroke={INK} strokeWidth="2.5" />
                <circle cx="174" cy="124" r="6" fill="#fff" stroke={INK} strokeWidth="2.5" />
                <circle cx="157.5" cy="125.5" r="2.2" fill={INK} />
                <circle cx="175.5" cy="125.5" r="2.2" fill={INK} />
              </svg>
            </div>

            {/* Right: choose quantity numpad */}
            <div className="flex-1 flex flex-col items-center justify-center">
              <p className="text-xl font-bold mb-6" style={{ color: INK }}>{t.chooseQty}</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    onClick={() => payWithBags(n)}
                    className="w-20 h-20 rounded-2xl text-2xl font-extrabold shadow-sm active:scale-90 transition-transform"
                    style={{ backgroundColor: PINK, color: INK }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                onClick={() => payWithBags(0)}
                className="w-full max-w-[16.5rem] py-5 rounded-2xl text-xl font-extrabold shadow-md active:scale-95 transition-transform"
                style={{ backgroundColor: RED, color: "#fff" }}
              >
                {t.noBag}
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
            <h2 className="text-2xl font-extrabold mb-2" style={{ color: INK }}>{t.helpComing}</h2>
            <p className="text-gray-500 mb-8">{t.helpText}</p>
            <button
              onClick={() => setHelpOpen(false)}
              className="text-lg font-extrabold px-10 py-4 rounded-full active:scale-95 transition-transform"
              style={{ backgroundColor: RED, color: "#fff" }}
            >{t.close}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kiosk constants ──────────────────────────────────────────────────────────
const QUICK_PICKS = [
  { img: "/kassi/popular/bananar.jpg", label: "Bananar", term: "bananar" },
  { img: "/kassi/popular/epli.jpg", label: "Epli", term: "epli" },
  { img: "/kassi/popular/appelsinur.jpg", label: "Appelsínur", term: "appelsín" },
  { img: "/kassi/popular/tomatar.jpg", label: "Tómatar", term: "tómat" },
  { img: "/kassi/popular/paprika.jpg", label: "Paprika", term: "paprika" },
  { img: "/kassi/popular/agurka.jpg", label: "Agúrka", term: "agúrka" },
  { img: "/kassi/popular/sitronur.jpg", label: "Sítrónur", term: "sítrón" },
  { img: "/kassi/popular/avokado.jpg", label: "Avókadó", term: "avókadó" },
  { img: "/kassi/popular/sveppir.jpg", label: "Sveppir", term: "sveppir" },
  { img: "/kassi/popular/laukur.jpg", label: "Laukur", term: "laukur" },
  { img: "/kassi/popular/kartoflur.jpg", label: "Kartöflur", term: "kartöflur" },
  { img: "/kassi/popular/vinber.jpg", label: "Vínber", term: "vínber" },
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
