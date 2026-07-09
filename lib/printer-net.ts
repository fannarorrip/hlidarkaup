// ── Network receipt printing (ESC/POS over TCP 9100) — SERVER ONLY ──────────
// For Ethernet printers (Volcora). The server connects straight to the printer,
// so the till PC needs NO local software (no kassabrú) — just a browser.
//
// Per-register printers, same pattern as the card terminals:
//   PRINTER_IP_<REG>=192.168.1.x[:9100]   e.g. PRINTER_IP_KASSI1=192.168.1.200
// with PRINTER_IP as the shared fallback. Optional: PRINTER_PORT (default 9100),
// PRINTER_CODEPAGE (ESC t n — default 16 = WPC1252 on Epson-compatible printers;
// NCR used 8). Text format is identical to kassabrú: !BIG! / !B! / !C! prefixes.
import net from "net";

export interface NetPrinter {
  host: string;
  port: number;
}

function parseHostPort(v: string, defPort: number): NetPrinter {
  const m = v.trim().match(/^(.*?)(?::(\d+))?$/);
  return { host: (m?.[1] ?? v).trim(), port: m?.[2] ? parseInt(m[2], 10) : defPort };
}

/** Resolve the printer for a register (or the shared fallback). Null = not configured. */
export function registerPrinter(regId?: string | null): NetPrinter | null {
  const defPort = parseInt(process.env.PRINTER_PORT || "9100", 10);
  if (regId) {
    const v = process.env[`PRINTER_IP_${regId.toUpperCase()}`];
    if (v) return parseHostPort(v, defPort);
  }
  const shared = process.env.PRINTER_IP;
  return shared ? parseHostPort(shared, defPort) : null;
}

const ESC = 0x1b;
const GS = 0x1d;
const codepageByte = () => {
  const n = parseInt(process.env.PRINTER_CODEPAGE || "16", 10);
  return Number.isFinite(n) ? n & 0xff : 16;
};

/** CP1252 bytes — for Icelandic letters latin1 (ISO-8859-1) is byte-identical. */
const enc = (s: string) => Buffer.from(s, "latin1");

/** Build the ESC/POS job — mirrors deploy/kassabru/kassabru.cs exactly:
 *  init, codepage, per-line !BIG!/!B!/!C! (size/bold/align), feed+cut, drawer kick. */
export function buildReceiptBytes(text: string, opts?: { drawer?: boolean }): Buffer {
  const parts: Buffer[] = [];
  parts.push(Buffer.from([ESC, 0x40])); // ESC @  init
  parts.push(Buffer.from([ESC, 0x74, codepageByte()])); // ESC t n  codepage

  for (let line of text.split("\n")) {
    let big = false, bold = false, center = false;
    if (line.startsWith("!BIG!")) { big = true; bold = true; center = true; line = line.slice(5); }
    else if (line.startsWith("!B!")) { bold = true; line = line.slice(3); }
    else if (line.startsWith("!C!")) { center = true; line = line.slice(3); }

    parts.push(Buffer.from([ESC, 0x61, center ? 1 : 0])); // ESC a  align
    parts.push(Buffer.from([GS, 0x21, big ? 0x11 : 0x00])); // GS !  double w+h / normal
    parts.push(Buffer.from([ESC, 0x45, bold ? 1 : 0])); // ESC E  bold
    parts.push(enc(line));
    parts.push(Buffer.from([0x0a]));
  }

  parts.push(Buffer.from([GS, 0x56, 0x42, 0x00])); // GS V 66 0  feed + cut
  if (opts?.drawer) parts.push(Buffer.from([ESC, 0x70, 0x00, 0x32, 0xfa])); // ESC p  drawer kick
  return Buffer.concat(parts);
}

/** Drawer-kick-only job. */
export function buildDrawerBytes(): Buffer {
  return Buffer.from([ESC, 0x40, ESC, 0x70, 0x00, 0x32, 0xfa]);
}

/** Send raw bytes to the printer over TCP. Resolves when the socket flushes. */
export function sendToPrinter(p: NetPrinter, data: Buffer, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      reject(err);
    };
    sock.setTimeout(timeoutMs, () => fail(new Error("Prentari svarar ekki (timeout)")));
    sock.once("error", fail);
    sock.connect(p.port, p.host, () => {
      sock.end(data, () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
    });
  });
}

export async function netPrint(
  regId: string | null | undefined,
  text: string,
  opts?: { drawer?: boolean }
): Promise<{ ok: boolean; configured: boolean; error?: string }> {
  const p = registerPrinter(regId);
  if (!p) return { ok: false, configured: false };
  try {
    await sendToPrinter(p, buildReceiptBytes(text, opts));
    return { ok: true, configured: true };
  } catch (e) {
    return { ok: false, configured: true, error: e instanceof Error ? e.message : "Villa við prentun" };
  }
}

export async function netDrawer(
  regId: string | null | undefined
): Promise<{ ok: boolean; configured: boolean; error?: string }> {
  const p = registerPrinter(regId);
  if (!p) return { ok: false, configured: false };
  try {
    await sendToPrinter(p, buildDrawerBytes());
    return { ok: true, configured: true };
  } catch (e) {
    return { ok: false, configured: true, error: e instanceof Error ? e.message : "Villa við skúffu" };
  }
}
