// ============================================================================
// Kassabrú — Hlíðarkaup POS hardware bridge
// ----------------------------------------------------------------------------
// Bridges the browser-based till (https://hlidarkaup.is/kassi/starf) to the
// NCR peripherals on this PC over their serial COM ports:
//   COM3  NCR 7197 receipt printer (9600 8N1) + cash drawer (kick via printer)
//   COM4  NCR RealScan 7874 scanner/scale (9600 7O1, NCR framed protocol:
//         [addr][cmd][data][ETX][BCC], BCC = XOR of all bytes incl. ETX)
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
// Run:  kassabru.exe [printerPort] [scannerPort] [httpPort]   (defaults COM3 COM4 8974)
// See install.ps1 for one-shot install (compile + URL ACL + autostart).
// ============================================================================
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Ports;
using System.Net;
using System.Text;
using System.Threading;

namespace Kassabru
{
    static class Program
    {
        static string PrinterPort = "COM3";
        static string ScannerPort = "COM4";
        static int HttpPort = 8974;

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

        // SSE clients (till pages listening for scan events)
        static readonly List<StreamWriter> sseClients = new List<StreamWriter>();
        static readonly object sseLock = new object();

        // One in-flight scale request at a time (single till)
        static volatile ScaleWait scaleWait;

        class ScaleWait
        {
            public readonly ManualResetEvent Done = new ManualResetEvent(false);
            public string Frame; // scale frame content (e.g. "1105500"), without ETX/BCC
        }

        static void Main(string[] args)
        {
            if (args.Length > 0) PrinterPort = args[0];
            if (args.Length > 1) ScannerPort = args[1];
            if (args.Length > 2) HttpPort = int.Parse(args[2]);

            Log("Kassabrú startar — prentari={0} skanni/vigt={1} http={2}", PrinterPort, ScannerPort, HttpPort);

            TryOpenPrinter();
            TryOpenScanner();

            var scanThread = new Thread(ScannerReadLoop);
            scanThread.IsBackground = true;
            scanThread.Start();

            var listener = new HttpListener();
            listener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", HttpPort));
            listener.Start();
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
                    // The till may also run off the store server's LAN address (http://192.168.x.x:3000)
                    if (!originOk && origin.StartsWith("http://") && origin.EndsWith(":3000") &&
                        (origin.StartsWith("http://192.168.") || origin.StartsWith("http://10.")))
                        originOk = true;
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
                // A browser page (non-allowlisted origin) gets nothing; curl/no-Origin is fine for local testing.
                if (origin != null && !originOk) { WriteJson(resp, 403, "{\"error\":\"origin not allowed\"}"); return; }

                string path = req.Url.AbsolutePath;
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
            var w = new StreamWriter(resp.OutputStream, new UTF8Encoding(false));
            w.Write(": kassabru\n\n"); w.Flush();
            lock (sseLock) sseClients.Add(w);
            Log("SSE client tengdur ({0} alls)", sseClients.Count);
            // Heartbeat so dead connections get detected; keep this handler thread alive.
            // Writes happen under sseLock — PushScan writes to the same stream from other threads.
            try
            {
                while (true)
                {
                    Thread.Sleep(15000);
                    lock (sseLock)
                    {
                        if (!sseClients.Contains(w)) break;
                        w.Write(": ping\n\n"); w.Flush();
                    }
                }
            }
            catch
            {
                lock (sseLock) sseClients.Remove(w);
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
                    try { sseClients[i].Write(msg); sseClients[i].Flush(); }
                    catch { sseClients.RemoveAt(i); }
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
                    if (printer != null) { try { printer.Dispose(); } catch { } }
                    printer = new SerialPort(PrinterPort, 9600, Parity.None, 8, StopBits.One);
                    printer.Handshake = Handshake.None;   // receipts fit the 7197's 4KB buffer
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
                lock (printerLock)
                {
                    var buf = new List<byte>();
                    buf.AddRange(new byte[] { 0x1B, 0x40 });        // ESC @  init
                    buf.AddRange(new byte[] { 0x1B, 0x74, 0x08 });  // ESC t 8 = CP1252 (á é í ó ú ý þ æ ö ð)
                    var cp1252 = Encoding.GetEncoding(1252);
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
                    printer.Write(buf.ToArray(), 0, buf.Count);
                }
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
                lock (printerLock) printer.Write(new byte[] { 0x1B, 0x70, 0x00, 0x32, 0xFA }, 0, 5);
                WriteJson(resp, 200, "{\"ok\":true}");
            }
            catch (Exception ex)
            {
                Log("skúffa: {0}", ex.Message);
                WriteJson(resp, 500, "{\"ok\":false,\"error\":\"skúffa mistókst\"}");
            }
        }

        // ---------------------------------------------------- scanner/scale --
        static bool TryOpenScanner()
        {
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
                    Thread.Sleep(3000);
                    TryOpenScanner();
                    continue;
                }
                int b;
                try { b = scanner.ReadByte(); }
                catch (TimeoutException) { continue; }
                catch (Exception ex)
                {
                    Log("skanni lestur: {0}", ex.Message);
                    Thread.Sleep(2000);
                    continue;
                }
                if (b < 0) continue;
                if (b == 0x02 && frame.Count == 0) continue;   // stray STX (prefix enabled) — ignore
                if (b == 0x03)
                {
                    // terminator: next byte is the BCC — read it (best effort), then dispatch
                    try { scanner.ReadByte(); } catch { }
                    DispatchFrame(frame.ToArray());
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
                // scale frame (11=weight, 13=status, 10=ack) — hand to a waiting /weigh call
                var w = scaleWait;
                if (w != null && (s.StartsWith("11") || s.StartsWith("13")))
                {
                    w.Frame = s;
                    w.Done.Set();
                }
            }
            // "00" = scanner command ack — nothing to do
        }

        static void HandleWeigh(HttpListenerResponse resp)
        {
            if (!TryOpenScanner()) { WriteJson(resp, 503, "{\"ok\":false,\"reason\":\"offline\",\"message\":\"Vigt ekki tengd\"}"); return; }
            var w = new ScaleWait();
            scaleWait = w;
            try
            {
                SendScannerFrame(new byte[] { 0x31, 0x31 });           // Weigh
                if (w.Done.WaitOne(2500) && w.Frame != null && w.Frame.StartsWith("11"))
                {
                    string d = w.Frame.Substring(2);
                    int raw;
                    if (int.TryParse(d, NumberStyles.None, CultureInfo.InvariantCulture, out raw))
                    {
                        double kg = raw / 1000.0;                       // 4-5 digits, thousandths of kg
                        WriteJson(resp, 200, string.Format(CultureInfo.InvariantCulture, "{{\"ok\":true,\"kg\":{0:0.###}}}", kg));
                        return;
                    }
                }
                // No stable non-zero weight: cancel the pending weigh, then ask why.
                var w2 = new ScaleWait();
                scaleWait = w2;
                SendScannerFrame(new byte[] { 0x31, 0x32 });           // Cancel weigh
                Thread.Sleep(150);
                SendScannerFrame(new byte[] { 0x31, 0x33 });           // Scale status
                string reason = "unknown", message = "Vigtun mistókst";
                if (w2.Done.WaitOne(1200) && w2.Frame != null && w2.Frame.StartsWith("13") && w2.Frame.Length >= 7)
                {
                    char z = w2.Frame[6];   // 13 3V 3W 3X 3Y 3Z — z = ready-state digit
                    if (z == '0') { reason = "notready"; message = "Vigt ekki tilbúin — núllstilla þarf vigtina"; }
                    else if (z == '1') { reason = "motion"; message = "Vigtin er á hreyfingu — bíddu augnablik"; }
                    else if (z == '2') { reason = "over"; message = "Of þungt á vigtinni"; }
                    else if (z == '3') { reason = "zero"; message = "Ekkert á vigtinni"; }
                    else if (z == '5') { reason = "sent"; message = "Lyftu vörunni af og settu aftur á vigtina"; }
                }
                WriteJson(resp, 200, string.Format("{{\"ok\":false,\"reason\":\"{0}\",\"message\":\"{1}\"}}", reason, message));
            }
            catch (Exception ex)
            {
                Log("vigtun: {0}", ex.Message);
                WriteJson(resp, 500, "{\"ok\":false,\"reason\":\"error\",\"message\":\"Villa í samskiptum við vigt\"}");
            }
            finally { scaleWait = null; }
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
}
