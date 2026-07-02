"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { TouchKeyboard, NumPad } from "./Keyboard";

interface Line { id: string; name: string; price: number; vatPct?: number; quantity: number; priceOverride?: number; discount?: number; }
interface Customer { id: string; name: string; kennitala: string | null; is_account: boolean; }
interface SItem { id: string; name: string; price: number; vatPct?: number; }
interface Category { group: string; name: string; count: number; }
interface HeldSale { id: string; label: string | null; customer_id: string | null; customer_name: string | null; customer_is_account: boolean | null; total: string; cart: Line[]; created_at: string; }
type Mode = "card" | "cash" | "account" | "transfer";

// Always use a dot as the thousands separator (don't rely on the browser locale).
const kr = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr.";
const effUnit = (l: Line) => l.priceOverride ?? l.price;                              // VERÐ override
const lineTotal = (l: Line) => Math.max(0, effUnit(l) * l.quantity - (l.discount ?? 0)); // AFSL applied

// Brand palette — deep/ink/teal neutrals, red ONLY for the primary action.
const RED = "bg-[#DB1A1A] hover:bg-[#c01414]";
const INK = "bg-[#21323A] hover:bg-[#2d434e]";

export default function StaffTill() {
  const [cart, setCart] = useState<Line[]>([]);
  const [scan, setScan] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SItem[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [grid, setGrid] = useState<SItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custOpen, setCustOpen] = useState(false);
  const [custQ, setCustQ] = useState("");
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cashFor, setCashFor] = useState(false);
  const [cashGot, setCashGot] = useState("");
  const [done, setDone] = useState<{ invoiceNumber: string; total: number; mode: Mode; change?: number; lines: Line[]; isReturn?: boolean } | null>(null);
  const [held, setHeld] = useState<HeldSale[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [returnMode, setReturnMode] = useState(false);
  const [edit, setEdit] = useState<{ id: string; name: string; catalog: number; qty: string; unit: string; disc: string; discPct: boolean } | null>(null);
  const [editField, setEditField] = useState<"qty" | "unit" | "disc">("qty");
  const [editFresh, setEditFresh] = useState(true); // first numpad digit REPLACES a just-selected field
  const [toast, setToast] = useState("");
  const [terminalEnabled, setTerminalEnabled] = useState(false);
  const [waiting, setWaiting] = useState("");
  const [clock, setClock] = useState("");
  const [kb, setKb] = useState<"search" | "customer" | null>(null); // on-screen keyboard target

  const total = cart.reduce((s, l) => s + lineTotal(l), 0);
  const vat = Math.round(cart.reduce((s, l) => { const r = l.vatPct ?? 24; return s + (lineTotal(l) * r) / (100 + r); }, 0));

  useEffect(() => { const f = () => setClock(new Date().toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })); f(); const t = setInterval(f, 20000); return () => clearInterval(t); }, []);
  useEffect(() => { fetch("/api/kassi/categories").then((r) => r.json()).then((d) => { setCats(d.categories ?? []); if (d.categories?.[0]) selectCat(d.categories[0].group); }).catch(() => {}); }, []);
  useEffect(() => { fetch("/api/kassi/terminal/status").then((r) => r.json()).then((d) => setTerminalEnabled(!!d.enabled)).catch(() => {}); }, []);

  const selectCat = useCallback(async (group: string) => {
    setActiveCat(group); setSearch(""); setResults([]);
    const r = await fetch(`/api/kassi/products?group=${encodeURIComponent(group)}&limit=60`);
    setGrid((await r.json()).products ?? []);
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => { const r = await fetch(`/api/kassi/search?q=${encodeURIComponent(q)}`); setResults((await r.json()).products ?? []); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!custOpen) return;
    const t = setTimeout(async () => { const r = await fetch(`/api/customers/search?q=${encodeURIComponent(custQ.trim())}`); setCustResults((await r.json()).customers ?? []); }, 250);
    return () => clearTimeout(t);
  }, [custQ, custOpen]);

  const addItem = (d: SItem) => { setError(""); setCart((p) => { const e = p.find((l) => l.id === d.id); return e ? p.map((l) => l.id === d.id ? { ...l, quantity: l.quantity + 1 } : l) : [...p, { id: d.id, name: d.name, price: d.price, vatPct: d.vatPct, quantity: 1 }]; }); };
  const changeQty = (id: string, d: number) => setCart((p) => p.map((l) => l.id === id ? { ...l, quantity: l.quantity + d } : l).filter((l) => l.quantity > 0));
  const removeLine = (id: string) => setCart((p) => p.filter((l) => l.id !== id));
  const openEdit = (l: Line) => { setEditField("qty"); setEditFresh(true); setEdit({ id: l.id, name: l.name, catalog: l.price, qty: String(l.quantity), unit: String(effUnit(l)), disc: String(l.discount ?? 0), discPct: false }); };
  const selectField = (f: "qty" | "unit" | "disc") => { setEditField(f); setEditFresh(true); };
  function applyEdit() {
    if (!edit) return;
    const qty = Math.max(1, Math.round(Number(edit.qty)) || 1);
    const unit = Math.max(0, Math.round(Number(edit.unit)) || 0);
    const dIn = Math.max(0, Number(edit.disc) || 0);
    const discKr = edit.discPct ? Math.round((unit * qty * dIn) / 100) : Math.round(dIn);
    setCart((p) => p.map((l) => l.id === edit.id ? { ...l, quantity: qty, priceOverride: unit !== l.price ? unit : undefined, discount: discKr > 0 ? Math.min(discKr, unit * qty) : undefined } : l));
    setEdit(null);
  }

  async function addByCode(code: string) {
    const c = code.trim(); if (!c) return;
    const r = await fetch(`/api/kassi/scan?code=${encodeURIComponent(c)}`); const d = await r.json();
    if (!r.ok) { setError(d.error ?? "Vara fannst ekki"); setScan(""); return; }
    addItem(d); setScan(""); scanRef.current?.focus();
  }

  // Global barcode scanner: a keyboard-wedge scan is captured even when the scan box isn't
  // focused. A fast burst of characters ending in Enter (and NOT while typing in a text field)
  // is treated as a scan — human typing has slower gaps so it never triggers.
  // Gated OFF while any overlay is open, so a stray scan can't mutate the cart behind a modal
  // (or corrupt a payment mid-flow).
  const overlayRef = useRef(false);
  useEffect(() => { overlayRef.current = !!(cashFor || edit || custOpen || heldOpen || done || waiting); });
  useEffect(() => {
    let buf = ""; let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (overlayRef.current) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const now = Date.now();
      if (now - last > 80) buf = "";
      last = now;
      if (e.key === "Enter") { if (buf.length >= 3) { e.preventDefault(); addByCode(buf); } buf = ""; return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkout(mode: Mode, change?: number) {
    if (!cart.length) return;
    if (mode === "account" && (!customer || !customer.is_account)) { setError("Veldu reikningsviðskiptamann"); return; }
    setBusy(true); setError("");
    const snapshot = cart;
    const r = await fetch("/api/kassi/sale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: cart.map((l) => ({ id: l.id, quantity: l.quantity, ...(l.priceOverride != null ? { unitPrice: l.priceOverride } : {}), ...(l.discount ? { discount: l.discount } : {}) })), mode, customerId: customer?.id, payment: { approved: true, processor: "STAFF" } }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setError(d.error ?? "Villa við að skrá söluna"); return; }
    setDone({ invoiceNumber: d.invoiceNumber, total, mode, change, lines: snapshot });
    if (mode === "cash") fetch("/api/kassi/drawer", { method: "POST" }).catch(() => {}); // auto-open on cash
    setCart([]); setCustomer(null); setCashFor(false); setCashGot("");
  }
  function pay(mode: Mode) {
    if (!cart.length) { setError("Karfan er tóm"); return; }
    if (mode === "cash") { setCashGot(""); setCashFor(true); return; }
    if (mode === "card" && terminalEnabled) { cardViaTerminal(); return; }
    checkout(mode);
  }
  const terminalAbort = useRef<AbortController | null>(null);
  async function cardViaTerminal() {
    setWaiting("Fylgdu leiðbeiningum á posanum…"); setError("");
    const ac = new AbortController(); terminalAbort.current = ac;
    try {
      const r = await fetch("/api/kassi/terminal/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: total, ref: `till-${Date.now()}` }), signal: ac.signal });
      const d = await r.json().catch(() => ({}));
      setWaiting("");
      if (!d.approved) { setError(d.error ? `Posi: ${d.error}` : "Greiðslu hafnað"); return; }
      await checkout("card");
    } catch (e) {
      setWaiting("");
      if (ac.signal.aborted) { setError("Hætt við — athugaðu stöðu greiðslunnar á posanum áður en þú reynir aftur."); return; }
      setError(e instanceof Error ? e.message : "Villa við posa");
    }
  }
  function newSale() { setDone(null); setError(""); setCart([]); setCustomer(null); setSearch(""); setResults([]); setReturnMode(false); setTimeout(() => scanRef.current?.focus(), 50); }

  const loadHeld = useCallback(() => { fetch("/api/kassi/held").then((r) => r.json()).then((d) => setHeld(d.held ?? [])).catch(() => {}); }, []);
  useEffect(() => { loadHeld(); }, [loadHeld]);

  async function hold() {
    if (!cart.length) return;
    setBusy(true); setError("");
    // Only clear the cart when the save actually succeeded — a network hiccup must not eat the sale.
    const r = await fetch("/api/kassi/held", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: customer?.name ?? null, customerId: customer?.id ?? null, customerName: customer?.name ?? null, customerIsAccount: customer?.is_account ?? null, cart, total }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setError("Tókst ekki að geyma söluna — reyndu aftur."); return; }
    setCart([]); setCustomer(null); loadHeld();
  }
  async function recall(h: HeldSale) {
    setCart(Array.isArray(h.cart) ? h.cart : []);
    // is_account comes from the held row (old rows: null → false, so Á reikning demands re-picking).
    setCustomer(h.customer_id ? { id: h.customer_id, name: h.customer_name ?? "", kennitala: null, is_account: h.customer_is_account === true } : null);
    setHeldOpen(false);
    await fetch(`/api/kassi/held/${h.id}`, { method: "DELETE" }).catch(() => {});
    loadHeld();
  }
  async function discardHeld(id: string) { await fetch(`/api/kassi/held/${id}`, { method: "DELETE" }).catch(() => {}); loadHeld(); }
  async function openDrawer() {
    const r = await fetch("/api/kassi/drawer", { method: "POST" }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setToast(d.ok ? "Skúffa opnuð" : (d.message ?? d.error ?? "Skúffa ekki tengd"));
    setTimeout(() => setToast(""), 4500);
  }

  async function doReturn(mode: Mode) {
    if (!cart.length) return;
    setBusy(true); setError("");
    const snapshot = cart;
    const r = await fetch("/api/kassi/sale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: cart.map((l) => ({ id: l.id, quantity: l.quantity, ...(l.priceOverride != null ? { unitPrice: l.priceOverride } : {}), ...(l.discount ? { discount: l.discount } : {}) })), mode, kind: "return", customerId: customer?.id, payment: { approved: true, processor: "STAFF" } }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setError(d.error ?? "Villa við skil"); return; }
    setDone({ invoiceNumber: d.invoiceNumber, total, mode, lines: snapshot, isReturn: true });
    setCart([]); setCustomer(null); setReturnMode(false);
  }

  const cashGotN = Number(cashGot.replace(/\D/g, "")) || 0;
  const change = cashGotN - total;
  const editPreview = edit ? (() => {
    const q = Math.max(1, Math.round(Number(edit.qty)) || 1), u = Math.max(0, Math.round(Number(edit.unit)) || 0), d = Math.max(0, Number(edit.disc) || 0);
    return Math.max(0, u * q - (edit.discPct ? Math.round((u * q * d) / 100) : Math.round(d)));
  })() : 0;
  const gridItems = search.trim().length >= 2 ? results : grid;

  // On-screen keyboard plumbing (search + customer lookup share the one keyboard).
  const kbValue = kb === "search" ? search : custQ;
  const kbSet = kb === "search" ? setSearch : setCustQ;
  const kbKey = (k: string) => kbSet(kbValue + k);
  const kbBack = () => kbSet(kbValue.slice(0, -1));
  const kbClear = () => kbSet("");
  const closeCust = () => { setCustOpen(false); setKb((t) => (t === "customer" ? null : t)); };

  // Numpad → the line editor's selected field.
  const editSet = (v: string) => setEdit((e) => (e ? { ...e, [editField]: v } : e));
  const editVal = edit ? edit[editField] : "";

  const numInp = (active: boolean) =>
    `w-full border-2 rounded-xl px-4 py-3 text-xl text-right outline-none transition-colors ${active ? "border-[#2C687B] bg-[#E4F1F0]/40" : "border-gray-200"}`;

  return (
    <div className="h-screen flex flex-col bg-[#F2F5F6] text-[#21323A] overflow-hidden">
      <style>{`@media print{body *{visibility:hidden}#rcpt,#rcpt *{visibility:visible}#rcpt{position:absolute;left:0;top:0;width:72mm;font-size:12px}}`}</style>

      {/* Header */}
      <header className="h-16 shrink-0 bg-[#2C687B] flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <span className="text-white font-extrabold text-xl tracking-tight">Hlíðarkaup<span className="text-[#DB1A1A]">.</span></span>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/10 text-[#8CC7C4]">Kassi</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="tabular-nums text-lg text-[#E4F1F0] mr-2">{clock}</span>
          <button onClick={openDrawer} className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.97] text-white font-semibold text-base transition">Opna skúffu</button>
          <a href="/bokhald/solukerfi/kassauppgjor" className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.97] text-white font-semibold text-base transition">Uppgjör</a>
          <a href="/kassi" className="px-4 py-3 rounded-xl text-[#8CC7C4] hover:bg-white/10 text-sm transition">Sjálfsafgr. →</a>
          <a href="/starf" className="px-4 py-3 rounded-xl text-[#8CC7C4] hover:bg-white/10 text-sm transition" aria-label="Starfsmannakerfi">⌂</a>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* CATALOG (left) */}
        <div className="relative flex-1 flex flex-col min-w-0">
          <div className="p-3 flex gap-2.5 bg-white border-b border-gray-200">
            <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addByCode(scan)} onFocus={() => setKb(null)} autoFocus placeholder="Skanna strikamerki…" className="flex-1 border-2 border-gray-200 rounded-xl px-5 py-4 text-lg outline-none focus:border-[#8CC7C4] bg-[#F8FAFA]" />
            <div className="relative w-80">
              <input value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => setKb("search")} onClick={() => setKb("search")} inputMode="none" placeholder="Leita að vöru…" className="w-full border-2 border-gray-200 rounded-xl pl-5 pr-12 py-4 text-lg outline-none focus:border-[#8CC7C4]" />
              <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </div>
          </div>

          {results.length === 0 && (
            <div className="px-3 pt-3 flex gap-2 overflow-x-auto shrink-0 [scrollbar-width:none]">
              {cats.map((c) => { const on = activeCat === c.group; return (
                <button key={c.group} onClick={() => selectCat(c.group)}
                  className={`px-6 py-3.5 rounded-xl text-base font-semibold whitespace-nowrap transition active:scale-[0.97] ${on ? "bg-[#21323A] text-white shadow-sm" : "bg-white border border-gray-200 text-[#21323A] hover:border-[#8CC7C4]"}`}>
                  {c.name}
                </button>
              ); })}
            </div>
          )}

          <div className={`flex-1 overflow-y-auto p-3 ${kb === "search" ? "pb-[320px]" : ""}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {gridItems.map((p) => (
                <button key={p.id} onClick={() => addItem(p)}
                  className="text-left rounded-xl p-4 min-h-[112px] bg-white border border-gray-200 flex flex-col justify-between active:scale-[0.97] transition hover:border-[#8CC7C4] hover:shadow-sm">
                  <p className="text-[15px] font-semibold leading-snug line-clamp-3 text-[#21323A]">{p.name}</p>
                  <p className="text-lg font-bold text-[#2C687B]">{kr(p.price)}</p>
                </button>
              ))}
            </div>
            {gridItems.length === 0 && <p className="text-center text-gray-400 py-16">{search.trim().length >= 2 ? "Engar vörur fundust" : "Veldu flokk"}</p>}
          </div>

          {/* On-screen keyboard for the product search — scoped to this pane so the cart stays visible */}
          {kb === "search" && (
            <TouchKeyboard onKey={kbKey} onBackspace={kbBack} onClear={kbClear} onClose={() => setKb(null)} variant="pane" />
          )}
        </div>

        {/* SALE (right) */}
        <div className="w-[26rem] shrink-0 flex flex-col bg-white border-l border-gray-200">
          <button onClick={() => { setCustOpen(true); setCustQ(""); }} className="shrink-0 m-3 mb-0 flex items-center justify-between px-4 py-3.5 rounded-xl bg-[#F0F7F6] hover:bg-[#E4F1F0] text-left transition">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5C6B72]">Viðskiptamaður</p>
              <p className="font-semibold text-[#21323A]">{customer ? customer.name : "Staðgreitt"}</p>
            </div>
            <span className="text-[#8CC7C4] text-lg">›</span>
          </button>

          <div className="shrink-0 grid grid-cols-3 gap-2 m-3 mb-0">
            <FnBtn label="Geyma" onClick={hold} disabled={!cart.length || busy} />
            <FnBtn label={`Geymdir${held.length ? ` (${held.length})` : ""}`} onClick={() => { loadHeld(); setHeldOpen(true); }} />
            <FnBtn label={returnMode ? "Hætta skil" : "Skila vörum"} active={returnMode} onClick={() => { setReturnMode((v) => !v); setCart([]); setCustomer(null); setError(""); }} />
          </div>
          {returnMode && <div className="shrink-0 mx-3 mt-2 rounded-xl bg-[#DB1A1A] text-white text-center py-2.5 font-semibold">SKILAMÁTI — endurgreiðsla</div>}

          <div className="flex-1 overflow-y-auto p-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-3">
                <svg className="w-14 h-14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M3 4h2l2.4 12.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6" /></svg>
                <p className="text-sm font-medium">Engar vörur</p>
              </div>
            ) : cart.map((l) => (
              <div key={l.id} className="flex items-center gap-2 py-3 border-b border-gray-100">
                <button onClick={() => openEdit(l)} className="flex-1 min-w-0 text-left">
                  <p className="font-medium leading-tight truncate">{l.name}</p>
                  <p className="text-xs text-gray-400">
                    {kr(effUnit(l))}
                    {l.priceOverride != null && <span className="ml-1 text-amber-600">· verð breytt</span>}
                    {l.discount ? <span className="ml-1 text-[#DB1A1A]">· −{kr(l.discount)}</span> : null}
                  </p>
                </button>
                <button onClick={() => changeQty(l.id, -1)} className="w-12 h-12 rounded-xl bg-gray-100 text-2xl leading-none hover:bg-gray-200 active:scale-95 transition">−</button>
                <span className="w-8 text-center font-bold tabular-nums text-lg">{l.quantity}</span>
                <button onClick={() => changeQty(l.id, 1)} className="w-12 h-12 rounded-xl bg-gray-100 text-2xl leading-none hover:bg-gray-200 active:scale-95 transition">+</button>
                <span className="w-20 text-right font-semibold tabular-nums">{kr(lineTotal(l))}</span>
                <button onClick={() => removeLine(l.id)} className="text-gray-300 hover:text-[#DB1A1A] text-xl w-7 h-12" aria-label="Fjarlægja">×</button>
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-gray-200 p-4">
            <div className="flex justify-between text-sm text-gray-500 mb-1"><span>VSK innifalið</span><span className="tabular-nums">{kr(vat)}</span></div>
            <div className="flex justify-between items-end mb-3"><span className="text-lg font-semibold">{returnMode ? "Endurgreiðsla" : "Samtals"}</span><span className={`text-4xl font-bold tabular-nums ${returnMode ? "text-[#DB1A1A]" : "text-[#21323A]"}`}>{returnMode ? "−" : ""}{kr(total)}</span></div>
            {error && <p className="text-sm text-[#DB1A1A] font-medium mb-2">{error}</p>}
            {returnMode ? (
              <div className="grid grid-cols-2 gap-2.5">
                <PayBtn label="Endurgr. reiðufé" cls={`${INK} text-white`} onClick={() => doReturn("cash")} disabled={busy || !cart.length} />
                <PayBtn label="Endurgr. á kort" cls={`${RED} text-white`} onClick={() => doReturn("card")} disabled={busy || !cart.length} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <PayBtn label="Reiðufé" cls={`${INK} text-white`} onClick={() => pay("cash")} disabled={busy || !cart.length} />
                <PayBtn label="Kort" cls={`${RED} text-white`} onClick={() => pay("card")} disabled={busy || !cart.length} />
                <PayBtn label="Á reikning" cls="bg-white border-2 border-[#21323A] text-[#21323A] hover:bg-gray-50" onClick={() => pay("account")} disabled={busy || !cart.length || !customer?.is_account} />
                <PayBtn label="Símgreiðsla" cls="bg-white border-2 border-gray-300 text-gray-600 hover:bg-gray-50" onClick={() => pay("transfer")} disabled={busy || !cart.length} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Customer picker */}
      {custOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-14" onClick={closeCust}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-lg">Veldu viðskiptamann</h2><button onClick={closeCust} className="text-gray-400 text-3xl leading-none w-11 h-11" aria-label="Loka">×</button></div>
            <input autoFocus value={custQ} onChange={(e) => setCustQ(e.target.value)} onFocus={() => setKb("customer")} onClick={() => setKb("customer")} inputMode="none" placeholder="Leita eftir nafni eða kennitölu…" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3.5 text-base outline-none focus:border-[#8CC7C4] mb-3" />
            <button onClick={() => { setCustomer(null); closeCust(); }} className="w-full text-left px-3 py-3.5 rounded-xl hover:bg-gray-50 text-gray-500 mb-1">Staðgreitt (enginn viðskiptamaður)</button>
            <div className={`overflow-y-auto divide-y divide-gray-100 ${kb === "customer" ? "max-h-[24vh]" : "max-h-[38vh]"}`}>
              {custResults.map((c) => (
                <button key={c.id} onClick={() => { setCustomer(c); closeCust(); }} className="w-full text-left px-3 py-3.5 hover:bg-gray-50">
                  <p className="font-medium">{c.name}{!c.is_account && <span className="text-[10px] text-gray-400 ml-2">ekki reikningsv.</span>}</p>
                  <p className="text-xs text-gray-400 font-mono">{c.kennitala ?? "—"}</p>
                </button>
              ))}
            </div>
          </div>
          {kb === "customer" && (
            <div onClick={(e) => e.stopPropagation()}>
              <TouchKeyboard onKey={kbKey} onBackspace={kbBack} onClear={kbClear} onClose={() => setKb(null)} variant="fixed" />
            </div>
          )}
        </div>
      )}

      {/* Line editor — magn / verð / afsláttur, with a number pad for touch */}
      {edit && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-4 truncate">{edit.name}</h2>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Magn</label>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => { setEditField("qty"); setEditFresh(false); setEdit({ ...edit, qty: String(Math.max(1, (Math.round(Number(edit.qty)) || 1) - 1)) }); }} className="w-12 h-12 rounded-xl bg-gray-100 text-2xl active:scale-95 shrink-0">−</button>
                  <input inputMode="none" value={edit.qty} onFocus={() => selectField("qty")} onClick={() => selectField("qty")} onChange={(e) => { setEditFresh(false); setEdit({ ...edit, qty: e.target.value }); }} className={`${numInp(editField === "qty")} text-center`} />
                  <button onClick={() => { setEditField("qty"); setEditFresh(false); setEdit({ ...edit, qty: String((Math.round(Number(edit.qty)) || 0) + 1) }); }} className="w-12 h-12 rounded-xl bg-gray-100 text-2xl active:scale-95 shrink-0">+</button>
                </div>
                <label className="block text-sm text-gray-500 mb-1">Einingaverð (kr)</label>
                <input inputMode="none" value={edit.unit} onFocus={() => selectField("unit")} onClick={() => selectField("unit")} onChange={(e) => { setEditFresh(false); setEdit({ ...edit, unit: e.target.value }); }} className={numInp(editField === "unit")} />
                {Math.round(Number(edit.unit)) !== edit.catalog && <p className="text-xs text-amber-600 mt-1">Listaverð: {kr(edit.catalog)}</p>}
                <label className="block text-sm text-gray-500 mb-1 mt-3">Afsláttur</label>
                <div className="flex items-center gap-2">
                  <input inputMode="none" value={edit.disc} onFocus={() => selectField("disc")} onClick={() => selectField("disc")} onChange={(e) => { setEditFresh(false); setEdit({ ...edit, disc: e.target.value }); }} className={numInp(editField === "disc")} />
                  <div className="flex rounded-xl overflow-hidden border-2 border-gray-200 shrink-0">
                    <button onClick={() => setEdit({ ...edit, discPct: false })} className={`px-4 py-3 font-semibold ${!edit.discPct ? "bg-[#21323A] text-white" : "bg-white"}`}>kr</button>
                    <button onClick={() => setEdit({ ...edit, discPct: true })} className={`px-4 py-3 font-semibold ${edit.discPct ? "bg-[#21323A] text-white" : "bg-white"}`}>%</button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between">
                <NumPad
                  onDigit={(d) => { editSet(editFresh ? d : (editVal === "0" ? "" : editVal) + d); setEditFresh(false); }}
                  onBackspace={() => { editSet(editVal.slice(0, -1)); setEditFresh(false); }}
                  onClear={() => { editSet(""); setEditFresh(false); }}
                />
                <div className="flex justify-between text-lg mt-4"><span className="text-gray-500">Línusamtals</span><span className="font-bold tabular-nums">{kr(editPreview)}</span></div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { removeLine(edit.id); setEdit(null); }} className="px-4 py-3.5 rounded-xl border-2 border-gray-200 text-[#DB1A1A] font-semibold hover:bg-red-50">Fjarlægja</button>
              <button onClick={() => setEdit(null)} className="flex-1 py-3.5 rounded-xl border-2 border-gray-200 font-semibold hover:bg-gray-50">Hætta</button>
              <button onClick={applyEdit} className={`flex-1 py-3.5 rounded-xl ${RED} text-white font-semibold`}>Vista</button>
            </div>
          </div>
        </div>
      )}

      {/* Held sales */}
      {heldOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-20" onClick={() => setHeldOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-lg">Geymdir reikningar</h2><button onClick={() => setHeldOpen(false)} className="text-gray-400 text-3xl leading-none w-11 h-11" aria-label="Loka">×</button></div>
            {held.length === 0 ? <p className="text-gray-400 py-8 text-center">Engir geymdir reikningar</p> : (
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                {held.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 py-3">
                    <button onClick={() => recall(h)} className="flex-1 text-left">
                      <p className="font-medium">{h.customer_name || "Staðgreitt"} <span className="text-gray-400 text-sm font-normal">· {Array.isArray(h.cart) ? h.cart.length : 0} vörur</span></p>
                      <p className="text-xs text-gray-400">{new Date(h.created_at).toLocaleString("is-IS")}</p>
                    </button>
                    <span className="font-semibold tabular-nums">{kr(Number(h.total))}</span>
                    <button onClick={() => discardHeld(h.id)} className="text-gray-300 hover:text-[#DB1A1A] text-xl w-11 h-11" aria-label="Eyða">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cash modal — with number pad */}
      {cashFor && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" onClick={() => setCashFor(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-1">Reiðufé</h2>
            <p className="text-sm text-gray-500 mb-4">Til greiðslu: <b className="text-[#21323A]">{kr(total)}</b></p>
            <input autoFocus inputMode="none" value={cashGot} onChange={(e) => setCashGot(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="Móttekið…" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-2xl text-right outline-none focus:border-[#8CC7C4] mb-2 tabular-nums" />
            <div className="flex gap-2 mb-3 flex-wrap">
              {[total, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                <button key={v} onClick={() => setCashGot(String(v))} className="px-4 py-2.5 rounded-xl bg-gray-100 text-base hover:bg-gray-200 active:scale-95 transition tabular-nums">{kr(v)}</button>
              ))}
            </div>
            <div className="mb-3">
              <NumPad
                onDigit={(d) => setCashGot((v) => (v === "0" ? "" : v) + d)}
                onBackspace={() => setCashGot((v) => v.slice(0, -1))}
                onClear={() => setCashGot("")}
              />
            </div>
            {cashGotN > 0 && <div className="flex justify-between text-xl mb-4"><span className="text-gray-500">Til baka</span><span className={`font-bold tabular-nums ${change < 0 ? "text-[#DB1A1A]" : "text-[#2C687B]"}`}>{kr(Math.max(0, change))}</span></div>}
            {error && <p className="text-sm text-[#DB1A1A] font-medium mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setCashFor(false)} className="flex-1 py-4 rounded-xl border-2 border-gray-200 font-semibold hover:bg-gray-50">Hætta við</button>
              <button onClick={() => checkout("cash", change)} disabled={busy || cashGotN < total} className={`flex-1 py-4 rounded-xl ${INK} text-white font-semibold disabled:opacity-40`}>Staðfesta</button>
            </div>
          </div>
        </div>
      )}

      {waiting && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#E4F1F0] flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-[#2C687B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
            </div>
            <h1 className="text-xl font-bold mb-1">Greiðsla á posa</h1>
            <p className="text-3xl font-bold tabular-nums my-2">{kr(total)}</p>
            <p className="text-gray-500">{waiting}</p>
            <button onClick={() => { terminalAbort.current?.abort(); setWaiting(""); }} className="mt-5 px-6 py-3 rounded-xl border-2 border-gray-200 font-semibold hover:bg-gray-50">Hætta við</button>
          </div>
        </div>
      )}

      {toast && <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#21323A] text-white px-5 py-3 rounded-xl text-sm shadow-lg">{toast}</div>}

      {/* Receipt / done */}
      {done && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#E4F1F0] flex items-center justify-center mb-4">
              <svg className="w-9 h-9 text-[#2C687B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
            </div>
            <h1 className="text-xl font-bold mb-1">{done.isReturn ? "Skil skráð" : "Sala skráð"}</h1>
            <p className="text-gray-500 mb-1">Kvittun <span className="font-mono">{done.invoiceNumber}</span></p>
            {done.isReturn && <p className="text-lg mb-2">Endurgreitt: <b>{kr(done.total)}</b></p>}
            {!done.isReturn && done.mode === "cash" && done.change != null && done.change > 0 && <p className="text-lg mb-2">Til baka: <b>{kr(done.change)}</b></p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => window.print()} className="flex-1 py-4 rounded-xl border-2 border-gray-200 font-semibold hover:bg-gray-50">Prenta</button>
              <button onClick={newSale} className={`flex-1 py-4 rounded-xl ${RED} text-white font-semibold`}>Ný sala</button>
            </div>
          </div>
          <div id="rcpt" className="hidden">
            <p style={{ textAlign: "center", fontWeight: 700 }}>Hlíðarkaup</p>
            <p style={{ textAlign: "center" }}>Kvittun {done.invoiceNumber}</p>
            <hr />
            {done.lines.map((l) => (<div key={l.id} style={{ display: "flex", justifyContent: "space-between" }}><span>{l.quantity}× {l.name}</span><span>{kr(lineTotal(l))}</span></div>))}
            <hr />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>Samtals</span><span>{kr(done.total)}</span></div>
            {done.mode === "cash" && done.change != null && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Til baka</span><span>{kr(done.change)}</span></div>}
          </div>
        </div>
      )}
    </div>
  );
}

function PayBtn({ label, cls, onClick, disabled }: { label: string; cls: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`h-20 rounded-xl font-bold text-lg active:scale-[0.97] transition disabled:opacity-40 disabled:active:scale-100 ${cls}`}>{label}</button>
  );
}

function FnBtn({ label, onClick, disabled, active }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`py-4 rounded-xl text-base font-semibold active:scale-[0.97] transition disabled:opacity-40 ${active ? "bg-[#DB1A1A] text-white" : "bg-gray-100 text-[#21323A] hover:bg-gray-200"}`}>{label}</button>
  );
}
