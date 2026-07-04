// Client-side helpers for the Kassabrú POS hardware bridge (deploy/kassabru/).
// The bridge runs on the till PC itself and exposes the NCR peripherals on
// http://127.0.0.1:8974 — a secure page may always call localhost, so this
// works both on LAN (http://server:3000) and through https://hlidarkaup.is.

const BASE = process.env.NEXT_PUBLIC_KASSABRU_URL ?? "http://127.0.0.1:8974";

/** True if the bridge answers /health within a second. */
export async function kbHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1000) });
    const d = await r.json();
    return !!d.ok;
  } catch {
    return false;
  }
}

/** Subscribe to scanner events. Returns a cleanup function. */
export function kbScanEvents(onScan: (code: string) => void): () => void {
  const es = new EventSource(`${BASE}/events`);
  es.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.type === "scan" && typeof d.code === "string") onScan(d.code);
    } catch {
      /* ignore malformed events */
    }
  };
  return () => es.close();
}

/** Print a receipt (plain text; !BIG!/!B!/!C! line prefixes). Optionally kick the drawer. */
export async function kbPrint(text: string, opts?: { drawer?: boolean }): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/print`, {
      method: "POST",
      headers: opts?.drawer ? { "X-Drawer": "1" } : undefined,
      body: text,
    });
    const d = await r.json();
    return !!d.ok;
  } catch {
    return false;
  }
}

/** Kick the cash drawer via the printer. */
export async function kbDrawer(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/drawer`, { method: "POST" });
    const d = await r.json();
    return !!d.ok;
  } catch {
    return false;
  }
}

export type WeighResult = { ok: true; kg: number } | { ok: false; message: string };

/** Ask the scale for a stable weight (item must already be on the platter). */
export async function kbWeigh(): Promise<WeighResult> {
  try {
    const r = await fetch(`${BASE}/weigh`, { method: "POST" });
    const d = await r.json();
    if (d.ok) return { ok: true, kg: d.kg };
    return { ok: false, message: d.message ?? "Vigtun mistókst" };
  } catch {
    return { ok: false, message: "Vigt ekki tengd" };
  }
}

// ---------------------------------------------------------------- receipt --

const COLS = 42; // NCR 7197, standard pitch, 80mm

function row(left: string, right: string): string {
  const space = COLS - left.length - right.length;
  return space > 0 ? left + " ".repeat(space) + right : `${left} ${right}`;
}

const kr = (n: number) => `${Math.round(n).toLocaleString("is-IS")} kr.`;

/** Icelandic VAT class letter printed on receipts: A = 24%, B = 11%, C = 0%/undanþegið. */
export const vatClass = (rate: number) => (rate >= 24 ? "A" : rate >= 11 ? "B" : "C");

/** Three-column row for the VSK summary table (12 + 18 + 12 = 42). */
const row3 = (a: string, b: string, c: string) => a.padEnd(12) + b.padStart(18) + c.padStart(12);

interface ReceiptLine {
  name: string;
  quantity: number;
  price: number; // effective unit price
  vatPct?: number;
  discount?: number;
}

/** Render a 42-column receipt for the bridge printer. */
export function formatReceipt(o: {
  invoiceNumber: string;
  lines: ReceiptLine[];
  total: number;
  mode: string;
  change?: number;
  isReturn?: boolean;
}): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const div = "-".repeat(COLS);

  const out: string[] = [];
  out.push("!BIG!HLÍÐARKAUP");
  out.push("!C!— með þér alla daga —");
  out.push("!C!Akurhlíð 1 · 550 Sauðárkrókur");
  out.push("!C!Sími 453-6166 · hlidarkaup.is");
  out.push("");
  if (o.isReturn) out.push("!BIG!ENDURGREIÐSLA");
  out.push(row(`Kvittun ${o.invoiceNumber}`, stamp));
  out.push(div);

  // VAT per class (prices are gross): every line carries its class letter (A/B/C),
  // summarized in the VSK table below — the standard Icelandic receipt layout.
  const vatTotals = new Map<number, { gross: number; vat: number }>();
  for (const l of o.lines) {
    const rate = l.vatPct ?? 24;
    const discount = Math.min(l.discount ?? 0, l.price * l.quantity); // never exceed line gross (matches page + server)
    const lineTotal = l.price * l.quantity - discount;
    const cls = vatTotals.get(rate) ?? { gross: 0, vat: 0 };
    cls.gross += lineTotal;
    cls.vat += lineTotal - lineTotal / (1 + rate / 100);
    vatTotals.set(rate, cls);

    const letter = vatClass(rate);
    const qty = Number.isInteger(l.quantity) ? String(l.quantity) : l.quantity.toFixed(3);
    if (l.quantity !== 1) {
      out.push(l.name.slice(0, COLS));
      out.push(row(`  ${qty} x ${kr(l.price)}`, `${kr(lineTotal + discount)} ${letter}`));
    } else {
      out.push(row(l.name.slice(0, COLS - 14), `${kr(lineTotal + discount)} ${letter}`));
    }
    if (discount > 0) out.push(row("  Afsláttur", `-${kr(discount)}`));
  }

  out.push(div);
  out.push(`!B!${row("SAMTALS", kr(o.total))}`);
  const modeName =
    o.mode === "cash" ? "Reiðufé" : o.mode === "card" ? "Kort" : o.mode === "account" ? "Á reikning" : "Millifærsla";
  out.push(row("Greitt með", modeName));
  if (o.change !== undefined && o.change > 0) out.push(row("Skiptimynt", kr(o.change)));
  out.push("");
  out.push(row3("VSK-flokkur", "Velta m/VSK", "VSK"));
  for (const [rate, cls] of [...vatTotals.entries()].sort((a, b) => b[0] - a[0])) {
    out.push(row3(`${vatClass(rate)} = ${rate}%`, kr(cls.gross), kr(Math.round(cls.vat))));
  }
  out.push("");
  out.push("!C!Takk fyrir viðskiptin!");
  out.push("");
  return out.join("\n");
}
