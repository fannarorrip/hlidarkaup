// ============================================================================
// Kassabrú — Hlíðarkaup POS hardware bridge
// ----------------------------------------------------------------------------
// Bridges the browser-based till (https://hlidarkaup.is/kassi/starf) to the
// NCR peripherals on this PC over their serial COM ports:
//   COM3  NCR 7197 receipt printer (9600 8N1) + cash drawer (kick via printer)
//   COM4  NCR RealScan 7874 scanner/scale (9600 7O1, NCR framed protocol:
//         [addr][cmd][data][ETX][BCC], BCC = XOR of all bytes incl. ETX)
//   The scanner port ALSO understands raw ASCII labels (Datalogic Magellan in
//   USB-COM mode, e.g. COM7): a label ended by CR/LF — or by ≥250 ms silence
//   when no suffix is configured — is treated as a scan. NCR frames still end
//   at ETX+BCC, so both protocols coexist on the same port. /weigh speaks BOTH
//   scale protocols too — NCR framed AND Datalogic single-cable ("S14"+CR →
//   "S14"+status+grams) — picked automatically, silence falls back to the other.
//
// HTTP API on http://127.0.0.1:8974 (localhost only — never exposed to LAN):
//   GET  /health   -> {"ok":true,"printer":true,"scanner":true}
//   GET  /events   -> Server-Sent Events stream; scan events:
//                     data: {"type":"scan","code":"5690..."}
//   POST /print    -> body = plain UTF-8 text, one receipt line per \n.
//                     Line prefixes: !BIG! (centered, double size, bold),
//                     !B! (bold), !C! (centered). Header X-Drawer: 1 also
//                     kicks the drawer. Prints CP1252 (Icelandic) + cuts.
//   POST /drawer   -> kicks the cash drawer
//   POST /weigh    -> asks the scale for a stable weight:
//                     {"ok":true,"kg":1.235}  or  {"ok":false,"reason":"zero",
//                     "message":"Ekkert á vigtinni"}
//
// Build (no tooling needed — uses the compiler built into Windows):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /out:kassabru.exe kassabru.cs
// Run:  kassabru.exe [printerPort] [scannerPort] [httpPort] [codepage]
//   defaults: COM3 COM4 8974 8
//   printerPort: a COM port (serial, e.g. NCR 7197) OR "win:<queue name>" for a
//     USB printer installed as a Windows printer (e.g. Volcora → win:POS80).
//   scannerPort: a COM port, or "none" when the till has no serial scanner
//     (USB scanners type like keyboards and need no bridge).
//   codepage: the ESC t value for Icelandic text — 8 on the NCR 7197,
//     16 (WPC1252) on Epson-compatible printers like Volcora.
// See install.ps1 for one-shot install (compile + URL ACL + autostart).
// ============================================================================
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Ports;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace Kassabru
{
    static class Program
    {
        static string PrinterPort = "COM3";
        static string ScannerPort = "COM4";
        static int HttpPort = 8974;
        static byte CodePage = 0x08;   // ESC t n: 8 = CP1252 on NCR 7197; 16 = WPC1252 on Epson/Volcora

        static bool IsWinPrinter { get { return PrinterPort.StartsWith("win:", StringComparison.OrdinalIgnoreCase); } }
        static string WinPrinterName { get { return PrinterPort.Substring(4); } }

        // Only these web origins may talk to the bridge (the till page).
        static readonly string[] AllowedOrigins = new string[] {
            "https://hlidarkaup.is",
            "https://www.hlidarkaup.is",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        };

        static SerialPort printer;                 // guarded by printerLock
        static readonly object printerLock = new object();
        static SerialPort scanner;                 // reader thread owns reads; writes via scannerWriteLock
        static readonly object scannerWriteLock = new object();

        // SSE clients (till pages listening for scan events). Each handler thread is the sole
        // writer for its own socket — PushScan only enqueues, so a stuck client can't stall scans.
        class SseClient
        {
            public StreamWriter W;
            public readonly Queue<string> Q = new Queue<string>();
            public readonly AutoResetEvent Signal = new AutoResetEvent(false);
        }
        static readonly List<SseClient> sseClients = new List<SseClient>();
        static readonly object sseLock = new object();

        // One in-flight scale request at a time (single till) — enforced via scaleLock
        static volatile ScaleWait scaleWait;
        static readonly object scaleLock = new object();

        // True once ANY raw (non-NCR) traffic arrived on the scanner port — i.e. the attached
        // device is a Datalogic in USB-COM mode, so /weigh should speak S-protocol first.
        static volatile bool rawMode;

        class ScaleWait
        {
            public readonly ManualResetEvent Done = new ManualResetEvent(false);
            public string Frame;        // scale frame content (e.g. "1105500"), without ETX/BCC
            public string Expect = "11"; // frame kind this waiter is for ("11" weight, "13" status) —
                                         // stale frames from an earlier request must not satisfy it
        }

        static void Main(string[] args)
        {
            if (args.Length > 0) PrinterPort = args[0];
            if (args.Length > 1) ScannerPort = args[1];
            if (args.Length > 2) HttpPort = int.Parse(args[2]);
            if (args.Length > 3) CodePage = (byte)int.Parse(args[3]);

            Log("Kassabrú startar — prentari={0} skanni/vigt={1} http={2} codepage={3}", PrinterPort, ScannerPort, HttpPort, CodePage);

            TryOpenPrinter();
            TryOpenScanner();

            var scanThread = new Thread(ScannerReadLoop);
            scanThread.IsBackground = true;
            scanThread.Start();

            var listener = new HttpListener();
            listener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", HttpPort));
            try { listener.Start(); }
            catch (HttpListenerException)
            {
                // Another instance already serves this port (double start via task + hand start).
                // The running one also holds the COM ports — this copy has nothing to offer.
                Log("Kassabrú er þegar í gangi á porti {0} — þetta eintak hættir.", HttpPort);
                return;
            }
            Log("Hlusta á http://127.0.0.1:{0}/", HttpPort);

            while (true)
            {
                HttpListenerContext ctx;
                try { ctx = listener.GetContext(); }
                catch (Exception ex) { Log("listener: {0}", ex.Message); continue; }
                ThreadPool.QueueUserWorkItem(delegate(object o) { Handle((HttpListenerContext)o); }, ctx);
            }
        }

        // ------------------------------------------------------------ HTTP --
        static void Handle(HttpListenerContext ctx)
        {
            var req = ctx.Request;
            var resp = ctx.Response;
            try
            {
                string origin = req.Headers["Origin"];
                bool originOk = false;
                if (origin != null)
                {
                    foreach (var a in AllowedOrigins) if (string.Equals(a, origin, StringComparison.OrdinalIgnoreCase)) { originOk = true; break; }
                    // The till may also run off the store server's LAN address (http://192.168.x.x:3000).
                    // Must be a real IPv4 LITERAL — a DNS name like 192.168.evil.com must NOT pass.
                    if (!originOk)
                    {
                        Uri u; System.Net.IPAddress ip;
                        if (Uri.TryCreate(origin, UriKind.Absolute, out u) && u.Scheme == "http" && u.Port == 3000 &&
                            System.Net.IPAddress.TryParse(u.Host, out ip) &&
                            ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork &&
                            (u.Host.StartsWith("192.168.") || u.Host.StartsWith("10.")))
                            originOk = true;
                    }
                }
                if (originOk)
                {
                    resp.Headers["Access-Control-Allow-Origin"] = origin;
                    resp.Headers["Vary"] = "Origin";
                }
                if (req.HttpMethod == "OPTIONS")
                {
                    // CORS / Chrome Private-Network-Access preflight
                    resp.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                    resp.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-Drawer";
                    resp.Headers["Access-Control-Allow-Private-Network"] = "true";
                    resp.Headers["Access-Control-Max-Age"] = "600";
                    resp.StatusCode = 204; resp.Close(); return;
                }
                // Everything except GET /health requires an allowlisted Origin — a request without
                // one (or from a foreign page) gets 403. Browsers always attach Origin cross-origin,
                // so the till is unaffected; local testing needs an Origin header (see install.ps1).
                string path = req.Url.AbsolutePath;
                bool healthGet = path == "/health" && req.HttpMethod == "GET";
                if (!originOk && !healthGet) { WriteJson(resp, 403, "{\"error\":\"origin not allowed\"}"); return; }

                if (path == "/health" && req.HttpMethod == "GET") { HandleHealth(resp); return; }
                if (path == "/events" && req.HttpMethod == "GET") { HandleEvents(resp); return; }
                if (path == "/print" && req.HttpMethod == "POST") { HandlePrint(req, resp); return; }
                if (path == "/drawer" && req.HttpMethod == "POST") { HandleDrawer(resp); return; }
                if (path == "/weigh" && req.HttpMethod == "POST") { HandleWeigh(resp); return; }
                WriteJson(resp, 404, "{\"error\":\"not found\"}");
            }
            catch (Exception ex)
            {
                Log("handler: {0}", ex.Message);
                try { WriteJson(resp, 500, "{\"error\":\"internal\"}"); } catch { }
            }
        }

        static void HandleHealth(HttpListenerResponse resp)
        {
            bool p = printer != null && printer.IsOpen;
            bool s = scanner != null && scanner.IsOpen;
            if (!p) p = TryOpenPrinter();
            if (!s) s = TryOpenScanner();
            WriteJson(resp, 200, string.Format("{{\"ok\":true,\"printer\":{0},\"scanner\":{1}}}",
                p ? "true" : "false", s ? "true" : "false"));
        }

        static void HandleEvents(HttpListenerResponse resp)
        {
            resp.StatusCode = 200;
            resp.ContentType = "text/event-stream";
            resp.Headers["Cache-Control"] = "no-cache";
            resp.SendChunked = true;
            var c = new SseClient();
            c.W = new StreamWriter(resp.OutputStream, new UTF8Encoding(false));
            lock (sseLock)
            {
                if (sseClients.Count >= 8) { try { resp.Abort(); } catch { } return; }   // sanity cap
                sseClients.Add(c);
            }
            Log("SSE client tengdur ({0} alls)", sseClients.Count);
            try
            {
                c.W.Write(": kassabru\n\n"); c.W.Flush();
                while (true)
                {
                    c.Signal.WaitOne(15000);   // scan enqueued, or 15s heartbeat tick
                    var pending = new List<string>();
                    lock (sseLock)
                    {
                        if (!sseClients.Contains(c)) break;
                        while (c.Q.Count > 0) pending.Add(c.Q.Dequeue());
                    }
                    if (pending.Count == 0) pending.Add(": ping\n\n");
                    foreach (var m in pending) c.W.Write(m);
                    c.W.Flush();
                }
            }
            catch
            {
                lock (sseLock) sseClients.Remove(c);
                Log("SSE client aftengdur ({0} eftir)", sseClients.Count);
            }
        }

        static void PushScan(string code)
        {
            string msg = string.Format("data: {{\"type\":\"scan\",\"code\":\"{0}\"}}\n\n", code);
            lock (sseLock)
            {
                for (int i = sseClients.Count - 1; i >= 0; i--)
                {
                    var cl = sseClients[i];
                    if (cl.Q.Count > 32) { sseClients.RemoveAt(i); continue; }   // stuck reader — drop it
                    cl.Q.Enqueue(msg);
                    cl.Signal.Set();
                }
            }
        }

        // ---------------------------------------------------------- printer --
        static bool TryOpenPrinter()
        {
            lock (printerLock)
            {
                if (printer != null && printer.IsOpen) return true;
                try
                {
                    if (IsWinPrinter) return WinRaw.QueueExists(WinPrinterName);
                    if (printer != null) { try { printer.Dispose(); } catch { } }
                    printer = new SerialPort(PrinterPort, 9600, Parity.None, 8, StopBits.One);
                    // Handshake deliberately None: the 7197's default flow control is DTR/DSR, which
                    // .NET can't do directly, and RTS/CTS would deadlock if the cable doesn't cross
                    // printer-DTR onto our CTS. At 9600 baud the line (~960 B/s) feeds slower than the
                    // printer prints, so its 4KB receive buffer cannot overflow in practice.
                    printer.Handshake = Handshake.None;
                    printer.DtrEnable = true;             // printer needs host DTR/RTS up to answer status
                    printer.RtsEnable = true;
                    printer.WriteTimeout = 5000;
                    printer.ReadTimeout = 500;
                    printer.Open();
                    Log("Prentari opinn á {0}", PrinterPort);
                    return true;
                }
                catch (Exception ex) { Log("prentari {0}: {1}", PrinterPort, ex.Message); return false; }
            }
        }

        static void HandlePrint(HttpListenerRequest req, HttpListenerResponse resp)
        {
            string text;
            using (var r = new StreamReader(req.InputStream, Encoding.UTF8)) text = r.ReadToEnd();
            bool drawer = req.Headers["X-Drawer"] == "1";
            if (!TryOpenPrinter()) { WriteJson(resp, 503, "{\"ok\":false,\"error\":\"prentari ekki tengdur\"}"); return; }
            try
            {
                var buf = new List<byte>();
                buf.AddRange(new byte[] { 0x1B, 0x40 });            // ESC @  init
                buf.AddRange(new byte[] { 0x1B, 0x74, CodePage });  // ESC t — codepage for á é í ó ú ý þ æ ö ð
                var cp1252 = PrinterEncoding();
                foreach (var rawLine in text.Replace("\r\n", "\n").Split('\n'))
                {
                    string line = rawLine;
                    bool big = false, bold = false, center = false;
                    if (line.StartsWith("!BIG!")) { big = true; bold = true; center = true; line = line.Substring(5); }
                    else if (line.StartsWith("!B!")) { bold = true; line = line.Substring(3); }
                    else if (line.StartsWith("!C!")) { center = true; line = line.Substring(3); }
                    buf.AddRange(new byte[] { 0x1B, 0x61, (byte)(center ? 1 : 0) });      // ESC a
                    buf.AddRange(new byte[] { 0x1D, 0x21, (byte)(big ? 0x11 : 0x00) });   // GS ! size
                    buf.AddRange(new byte[] { 0x1B, 0x45, (byte)(bold ? 1 : 0) });        // ESC E bold
                    buf.AddRange(cp1252.GetBytes(line));
                    buf.Add(0x0A);
                }
                buf.AddRange(new byte[] { 0x1D, 0x56, 0x42, 0x00 });                       // GS V 66 0: feed + cut
                if (drawer) buf.AddRange(new byte[] { 0x1B, 0x70, 0x00, 0x32, 0xFA });     // ESC p drawer kick
                if (!WritePrinterData(buf.ToArray())) { WriteJson(resp, 500, "{\"ok\":false,\"error\":\"prentun mistókst\"}"); return; }
                WriteJson(resp, 200, "{\"ok\":true}");
            }
            catch (Exception ex)
            {
                Log("prentun: {0}", ex.Message);
                WriteJson(resp, 500, "{\"ok\":false,\"error\":\"prentun mistókst\"}");
            }
        }

        static void HandleDrawer(HttpListenerResponse resp)
        {
            if (!TryOpenPrinter()) { WriteJson(resp, 503, "{\"ok\":false,\"error\":\"prentari ekki tengdur\"}"); return; }
            try
            {
                if (!WritePrinterData(new byte[] { 0x1B, 0x70, 0x00, 0x32, 0xFA }))
                { WriteJson(resp, 500, "{\"ok\":false,\"error\":\"skúffa mistókst\"}"); return; }
                WriteJson(resp, 200, "{\"ok\":true}");
            }
            catch (Exception ex)
            {
                Log("skúffa: {0}", ex.Message);
                WriteJson(resp, 500, "{\"ok\":false,\"error\":\"skúffa mistókst\"}");
            }
        }

        /** Text encoding matching the ESC t codepage table, so bytes land on the right glyphs. */
        static Encoding PrinterEncoding()
        {
            switch (CodePage)
            {
                case 0: return Encoding.GetEncoding(437);   // PC437
                case 2: return Encoding.GetEncoding(850);   // PC850 Multilingual
                case 3: return Encoding.GetEncoding(860);   // PC860 Portuguese
                case 4: return Encoding.GetEncoding(863);   // PC863 Canadian-French
                case 5: return Encoding.GetEncoding(865);   // PC865 Nordic
                case 17: return Encoding.GetEncoding(866);  // PC866 Cyrillic
                case 18: return Encoding.GetEncoding(852);  // PC852 Latin 2
                case 19: return Encoding.GetEncoding(858);  // PC858 (850 + €)
                default: return Encoding.GetEncoding(1252); // 8 (NCR) / 16 (Epson WPC1252)
            }
        }

        /** Route bytes to the printer — serial COM port or a Windows print queue (win:). */
        static bool WritePrinterData(byte[] data)
        {
            if (IsWinPrinter) return WinRaw.Send(WinPrinterName, data);
            lock (printerLock) { printer.Write(data, 0, data.Length); }
            return true;
        }

        // ---------------------------------------------------- scanner/scale --
        static bool TryOpenScanner()
        {
            if (string.Equals(ScannerPort, "none", StringComparison.OrdinalIgnoreCase)) return false;
            lock (scannerWriteLock)
            {
                if (scanner != null && scanner.IsOpen) return true;
                try
                {
                    if (scanner != null) { try { scanner.Dispose(); } catch { } }
                    scanner = new SerialPort(ScannerPort, 9600, Parity.Odd, 7, StopBits.One);
                    scanner.Handshake = Handshake.None;
                    scanner.DtrEnable = true;   // scanner transmits only while its CTS (our RTS/DTR) is up
                    scanner.RtsEnable = true;
                    scanner.ReadTimeout = 250;
                    scanner.WriteTimeout = 2000;
                    scanner.Open();
                    Log("Skanni/vigt opin á {0}", ScannerPort);
                    SendScannerFrame(new byte[] { 0x30, 0x31 });   // enable scanner (harmless if already on)
                    return true;
                }
                catch (Exception ex) { Log("skanni {0}: {1}", ScannerPort, ex.Message); return false; }
            }
        }

        // Frame = addr/cmd/data WITHOUT prefix/terminator/BCC; we add ETX + BCC.
        // Host->device commands carry the STX (0x02) prefix; replies come back without one.
        static void SendScannerFrame(byte[] content)
        {
            var msg = new List<byte>();
            msg.Add(0x02);
            msg.AddRange(content);
            msg.Add(0x03);
            byte bcc = 0;
            for (int i = 1; i < msg.Count; i++) bcc ^= msg[i];   // BCC = XOR of everything after STX
            msg.Add(bcc);
            lock (scannerWriteLock)
            {
                if (scanner == null || !scanner.IsOpen) throw new IOException("scanner port closed");
                scanner.Write(msg.ToArray(), 0, msg.Count);
            }
        }

        static void ScannerReadLoop()
        {
            var frame = new List<byte>();
            while (true)
            {
                if (scanner == null || !scanner.IsOpen)
                {
                    frame.Clear();                     // discard partial frame from before the disconnect
                    Thread.Sleep(3000);
                    TryOpenScanner();
                    continue;
                }
                int b;
                try { b = scanner.ReadByte(); }
                catch (TimeoutException)
                {
                    // Datalogic/USB-COM with no suffix: ≥250 ms of silence after a plausible
                    // raw ASCII label means the label is complete — dispatch it. Anything else
                    // still buffered after 250 ms of silence is stale garbage (both NCR frames
                    // and raw labels finish in a few ms) — e.g. a NAK/status byte the Datalogic
                    // sent for an NCR-protocol command — and would poison the NEXT scan if kept.
                    if (LooksLikeRawLabel(frame)) DispatchRaw(frame);
                    else if (frame.Count > 0) frame.Clear();
                    continue;
                }
                catch (Exception ex)
                {
                    Log("skanni lestur: {0}", ex.Message);
                    frame.Clear();                     // byte-stream integrity lost — abandon partial frame
                    Thread.Sleep(2000);
                    continue;
                }
                if (b < 0) continue;
                if (b == 0x02 && frame.Count == 0) continue;   // stray STX (prefix enabled) — ignore
                if (b == 0x0D || b == 0x0A)
                {
                    // CR/LF never occurs inside an NCR frame — it is the Datalogic/USB-COM
                    // suffix marking the end of a raw ASCII label.
                    if (frame.Count > 0) DispatchRaw(frame);
                    continue;
                }
                if (b == 0x03)
                {
                    // terminator: next byte is the BCC = XOR of all bytes after STX incl. ETX — verify it
                    int rx = -1;
                    try { rx = scanner.ReadByte(); } catch { }
                    byte expected = 0x03;
                    for (int i = 0; i < frame.Count; i++) expected ^= frame[i];
                    if (rx == expected) DispatchFrame(frame.ToArray());
                    else Log("BCC villa (fékk {0:X2}, vænti {1:X2}) — rammi hunsaður: {2}",
                             rx, expected, Encoding.ASCII.GetString(frame.ToArray()));
                    frame.Clear();
                    continue;
                }
                frame.Add((byte)b);
                if (frame.Count > 128) frame.Clear();          // garbage guard
            }
        }

        static void DispatchFrame(byte[] f)
        {
            string s = Encoding.ASCII.GetString(f);
            Log("rammi <- {0}", s);
            if (s.StartsWith("08"))
            {
                // scanner tag: 08 + label identifier + digits (EAN/UPC)
                var digits = new StringBuilder();
                bool started = false;
                for (int i = 2; i < s.Length; i++)
                {
                    if (s[i] >= '0' && s[i] <= '9') { digits.Append(s[i]); started = true; }
                    else if (started) break;   // identifier chars only lead; stop at first trailing non-digit
                }
                string code = digits.ToString();
                if (code.Length >= 6) { Log("SKANN: {0}", code); PushScan(code); }
                else Log("stuttur strikamerkjarammi hunsaður: {0}", s);
            }
            else if (s.StartsWith("1"))
            {
                // scale frame (11=weight, 13=status, 10=ack) — hand to the waiting /weigh call,
                // but ONLY the kind it asked for; anything else is a stale leftover and is dropped
                var w = scaleWait;
                if (w != null && s.StartsWith(w.Expect))
                {
                    w.Frame = s;
                    w.Done.Set();
                }
            }
            // "00" = scanner command ack — nothing to do
        }

        // -- raw ASCII mode (Datalogic Magellan on USB-COM: label text, no NCR framing) --

        /// True when the buffer could be a complete raw label: ≥6 printable ASCII
        /// bytes containing a run of ≥6 digits (EAN-8 is the shortest we sell).
        static bool LooksLikeRawLabel(List<byte> frame)
        {
            if (frame.Count < 6) return false;
            int run = 0, best = 0;
            for (int i = 0; i < frame.Count; i++)
            {
                byte b = frame[i];
                if (b < 0x20 || b > 0x7E) return false;        // control bytes ⇒ NCR partial, keep waiting
                if (b >= (byte)'0' && b <= (byte)'9') { run++; if (run > best) best = run; }
                else run = 0;
            }
            return best >= 6;
        }

        /// Dispatch a raw ASCII line from a Datalogic in USB-COM/single-cable mode.
        /// Routing by prefix: "S14"/"S11" = scale reply (hand to the waiting /weigh call),
        /// "S08" = label with single-cable identifier (strip it), anything else = bare label.
        /// For labels: longest digit run = the barcode (EAN/UPC are all digits; label-id
        /// prefixes like "F" or "]E0" are letters and fall away). Consumes the buffer.
        static void DispatchRaw(List<byte> frame)
        {
            string s = Encoding.ASCII.GetString(frame.ToArray()).Trim();
            frame.Clear();
            if (s.Length == 0) return;
            rawMode = true;
            Log("hrátt <- {0}", s);
            if (s.StartsWith("S14") || s.StartsWith("S11") || s.StartsWith("S10") || s.StartsWith("S33"))
            {
                // Datalogic single-cable SCALE/command frame — only the reply kind the pending
                // /weigh call asked for satisfies it; stale/unsolicited frames are dropped.
                var w = scaleWait;
                if (w != null && s.StartsWith(w.Expect)) { w.Frame = s; w.Done.Set(); }
                return;
            }
            string body = s.StartsWith("S08") ? s.Substring(3) : s;   // single-cable label identifier
            string code = LongestDigitRun(body);
            if (code.Length >= 6) { Log("SKANN: {0}", code); PushScan(code); }
            else Log("hrár rammi án strikamerkis hunsaður: {0}", s);
        }

        static string LongestDigitRun(string s)
        {
            string best = "";
            var run = new StringBuilder();
            foreach (char c in s)
            {
                if (c >= '0' && c <= '9') run.Append(c);
                else { if (run.Length > best.Length) best = run.ToString(); run.Length = 0; }
            }
            return run.Length > best.Length ? run.ToString() : best;
        }

        /// Write an ASCII line + CR to the scanner port (Datalogic single-cable commands).
        static void SendRawLine(string s)
        {
            byte[] b = Encoding.ASCII.GetBytes(s + "\r");
            lock (scannerWriteLock)
            {
                if (scanner == null || !scanner.IsOpen) throw new IOException("scanner port closed");
                scanner.Write(b, 0, b.Length);
            }
        }

        static void HandleWeigh(HttpListenerResponse resp)
        {
            if (!TryOpenScanner()) { WriteJson(resp, 503, "{\"ok\":false,\"reason\":\"offline\",\"message\":\"Vigt ekki tengd\"}"); return; }
            // One scale transaction at a time — overlapping requests would steal each other's
            // replies and the shared Cancel would kill the other request's pending Weigh.
            if (!Monitor.TryEnter(scaleLock, 3000))
            {
                WriteJson(resp, 429, "{\"ok\":false,\"reason\":\"busy\",\"message\":\"Vigtun þegar í gangi\"}");
                return;
            }
            try
            {
                Thread.Sleep(150);   // let stray frames from a previous transaction land while scaleWait
                                     // is null (they get dropped) instead of poisoning this one
                // Two scale protocols exist in the fleet: NCR RealScan (STX-framed) and Datalogic
                // Magellan single-cable ("S14" ASCII lines). rawMode picks the likely one (it is
                // set as soon as any raw label arrives); total silence tries the other protocol.
                string json = rawMode ? WeighDatalogic() : WeighNcr();
                if (json == null) json = rawMode ? WeighNcr() : WeighDatalogic();
                if (json == null) json = "{\"ok\":false,\"reason\":\"silent\",\"message\":\"Vigt svarar ekki — er vigt tengd við kassann?\"}";
                WriteJson(resp, 200, json);
            }
            catch (Exception ex)
            {
                Log("vigtun: {0}", ex.Message);
                try { WriteJson(resp, 500, "{\"ok\":false,\"reason\":\"error\",\"message\":\"Villa í samskiptum við vigt\"}"); } catch { }
            }
            finally { scaleWait = null; Monitor.Exit(scaleLock); }
        }

        /// Datalogic Magellan single-cable weigh: poll "S14" (state request — answers at once)
        /// until stable weight or timeout. Reply = "S14" + status digit + weight digits:
        /// 0 not ready, 1 in motion, 2 over capacity, 3 stable ZERO, 4 stable weight (+ grams,
        /// 5 digits on a kg unit), 5 under zero. No host zero command exists in this mode.
        /// Returns response JSON, or null when the port stayed completely silent (device does
        /// not speak this protocol — caller falls back to NCR).
        static string WeighDatalogic()
        {
            for (int attempt = 0; attempt < 8; attempt++)
            {
                if (attempt > 0) Thread.Sleep(300);          // never poll faster than 250 ms
                var w = new ScaleWait();
                w.Expect = "S14";
                scaleWait = w;
                SendRawLine("S14");
                bool got = w.Done.WaitOne(600);              // replies are immediate when spoken
                scaleWait = null;
                if (!got)
                {
                    if (attempt == 0) return null;           // total silence — wrong protocol
                    continue;                                // mid-sequence hiccup — retry
                }
                string f = w.Frame;                          // "S14" + status [+ digits]
                char st = f.Length > 3 ? f[3] : '?';
                if (st == '4')
                {
                    string digits = f.Substring(4);
                    int grams;
                    if (digits.Length == 5 && int.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out grams))
                        return string.Format(CultureInfo.InvariantCulture, "{{\"ok\":true,\"kg\":{0:0.###}}}", grams / 1000.0);
                    if (digits.Length == 4)
                        // 4 digits = hundredths of a POUND — the unit is lb-calibrated. Refuse
                        // rather than convert: a till must never guess units on a trade scale.
                        return "{\"ok\":false,\"reason\":\"units\",\"message\":\"Vigtin er stillt á pund — þarf kg-stillingu\"}";
                    Log("vigt: óskiljanlegt S14-svar: {0}", f);
                    return "{\"ok\":false,\"reason\":\"parse\",\"message\":\"Óskiljanlegt svar frá vigt\"}";
                }
                if (st == '3') return "{\"ok\":false,\"reason\":\"zero\",\"message\":\"Ekkert á vigtinni\"}";
                if (st == '2') return "{\"ok\":false,\"reason\":\"over\",\"message\":\"Of þungt á vigtinni\"}";
                if (st == '5') return "{\"ok\":false,\"reason\":\"under\",\"message\":\"Vigt undir núlli — núllstilltu vigtina (Zero-takki)\"}";
                if (st == '0') return "{\"ok\":false,\"reason\":\"notready\",\"message\":\"Vigt ekki tilbúin\"}";
                // '1' = in motion — loop: wait for the platter to settle and poll again
            }
            return "{\"ok\":false,\"reason\":\"motion\",\"message\":\"Vigtin nær ekki jafnvægi — bíddu augnablik\"}";
        }

        /// NCR RealScan 7874 weigh flow (framed protocol). Returns response JSON, or null when
        /// the port stayed completely silent (caller falls back to the Datalogic protocol).
        static string WeighNcr()
        {
            bool anyReply = false;
            var w = new ScaleWait();     // Expect = "11" (weight)
            scaleWait = w;
            SendScannerFrame(new byte[] { 0x31, 0x31 });           // Weigh (item already on platter)
            bool got = w.Done.WaitOne(2500);
            anyReply |= got;
            if (got && w.Frame != null && w.Frame.StartsWith("11"))
            {
                string d = w.Frame.Substring(2);
                int raw;
                if (int.TryParse(d, NumberStyles.None, CultureInfo.InvariantCulture, out raw))
                    return string.Format(CultureInfo.InvariantCulture, "{{\"ok\":true,\"kg\":{0:0.###}}}", raw / 1000.0);   // 4-5 digits, thousandths of kg
            }
            // No stable non-zero weight: cancel the pending weigh, then ask why.
            var w2 = new ScaleWait();
            w2.Expect = "13";                                      // only a STATUS frame satisfies this waiter
            scaleWait = w2;
            SendScannerFrame(new byte[] { 0x31, 0x32 });           // Cancel weigh
            Thread.Sleep(150);
            SendScannerFrame(new byte[] { 0x31, 0x33 });           // Scale status
            string reason = "unknown", message = "Vigtun mistókst";
            if (w2.Done.WaitOne(1200) && w2.Frame != null && w2.Frame.Length >= 7)
            {
                anyReply = true;
                char z = w2.Frame[6];   // 13 3V 3W 3X 3Y 3Z — z = ready-state digit
                if (z == '4')
                {
                    // a stable weight is sitting there ready — just weigh again, it answers instantly
                    var w3 = new ScaleWait();                      // Expect = "11"
                    scaleWait = w3;
                    SendScannerFrame(new byte[] { 0x31, 0x31 });
                    int raw3;
                    if (w3.Done.WaitOne(1500) && w3.Frame != null &&
                        int.TryParse(w3.Frame.Substring(2), NumberStyles.None, CultureInfo.InvariantCulture, out raw3))
                        return string.Format(CultureInfo.InvariantCulture, "{{\"ok\":true,\"kg\":{0:0.###}}}", raw3 / 1000.0);
                    reason = "ready"; message = "Þyngd tilbúin — reyndu aftur";
                }
                else if (z == '0') { reason = "notready"; message = "Vigt ekki tilbúin — núllstilla þarf vigtina"; }
                else if (z == '1') { reason = "motion"; message = "Vigtin er á hreyfingu — bíddu augnablik"; }
                else if (z == '2') { reason = "over"; message = "Of þungt á vigtinni"; }
                else if (z == '3') { reason = "zero"; message = "Ekkert á vigtinni"; }
                else if (z == '5') { reason = "sent"; message = "Lyftu vörunni af og settu aftur á vigtina"; }
            }
            if (!anyReply) return null;
            return string.Format("{{\"ok\":false,\"reason\":\"{0}\",\"message\":\"{1}\"}}", reason, message);
        }

        // ------------------------------------------------------------ misc --
        static void WriteJson(HttpListenerResponse resp, int status, string json)
        {
            resp.StatusCode = status;
            resp.ContentType = "application/json";
            var b = Encoding.UTF8.GetBytes(json);
            resp.ContentLength64 = b.Length;
            resp.OutputStream.Write(b, 0, b.Length);
            resp.Close();
        }

        static void Log(string fmt, params object[] args)
        {
            string line = string.Format("[{0:HH:mm:ss}] {1}", DateTime.Now, string.Format(fmt, args));
            Console.WriteLine(line);
            try { File.AppendAllText("kassabru.log", line + "\r\n"); } catch { }
        }
    }

    // RAW ESC/POS to a Windows print queue (USB printers, e.g. Volcora installed
    // with its Windows driver). The classic winspool RawPrinterHelper pattern.
    static class WinRaw
    {
        [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
        static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
        [DllImport("winspool.Drv", SetLastError = true)]
        static extern bool ClosePrinter(IntPtr hPrinter);
        [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
        static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA di);
        [DllImport("winspool.Drv", SetLastError = true)]
        static extern bool EndDocPrinter(IntPtr hPrinter);
        [DllImport("winspool.Drv", SetLastError = true)]
        static extern bool StartPagePrinter(IntPtr hPrinter);
        [DllImport("winspool.Drv", SetLastError = true)]
        static extern bool EndPagePrinter(IntPtr hPrinter);
        [DllImport("winspool.Drv", SetLastError = true)]
        static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        struct DOCINFOA
        {
            [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
        }

        public static bool QueueExists(string name)
        {
            IntPtr h;
            if (!OpenPrinter(name, out h, IntPtr.Zero)) return false;
            ClosePrinter(h);
            return true;
        }

        public static bool Send(string name, byte[] data)
        {
            IntPtr h;
            if (!OpenPrinter(name, out h, IntPtr.Zero)) return false;
            try
            {
                var di = new DOCINFOA();
                di.pDocName = "Kassabru kvittun";
                di.pOutputFile = null;
                di.pDataType = "RAW";
                if (!StartDocPrinter(h, 1, ref di)) return false;
                try
                {
                    if (!StartPagePrinter(h)) return false;
                    IntPtr p = Marshal.AllocHGlobal(data.Length);
                    try
                    {
                        Marshal.Copy(data, 0, p, data.Length);
                        int written;
                        if (!WritePrinter(h, p, data.Length, out written)) return false;
                        bool pageOk = EndPagePrinter(h);
                        return written == data.Length && pageOk;
                    }
                    finally { Marshal.FreeHGlobal(p); }
                }
                finally { EndDocPrinter(h); }
            }
            finally { ClosePrinter(h); }
        }
    }
}
