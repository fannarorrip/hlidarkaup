// ============================================================================
// HK B2B Proxy — Hlíðarkaup ⇄ Arion/RB 20131015 þjónustur (yfirlit + greiðslur)
// ----------------------------------------------------------------------------
// WHY: The official B2B Bridge (1.0.3.0, 2017 — newest per Arion) rejects the
// 20131015 services' responses: the bank SIGNS but does NOT ENCRYPT them, and
// the old bridge's channel demands encryption ("Body ... was not encrypted").
// Arion confirmed no newer bridge exists. This proxy replaces the bridge for
// the 20131015 family only: it builds the channel itself with a protection fix
// (request = sign+encrypt, response = sign-only) — the recipe wire-proven on
// 2026-07-10 (bank answered our signed requests with signed-only responses).
//
// FLOW:  Node app ── SOAP 1.1 + WSSE UsernameToken (unchanged lib) ──> proxy
//        proxy ── SOAP 1.2/WS-Addressing, body signed+encrypted, creds as
//                 UserName/Password headers (ns http://IcelandicOnlineBanking/Security/,
//                 per Arion's own 20131015 sample client) ──> ws.b2b.is
//        response body re-wrapped in SOAP 1.1 back to the app. Faults keep the
//        IOBSFault detail (BanksErrorText …) that lib/arion-b2b-accounts.ts reads.
//
// Endpoints served (path decides the upstream service):
//   POST /HKProxy/StatementService -> https://ws.b2b.is/Statements/20131015/AccountService.svc
//   POST /HKProxy/PaymentService   -> https://ws.b2b.is/Payments/20131015/PaymentService.svc
//   GET  /HKProxy/health           -> {"ok":true,...}
//
// Certificates (CurrentUser\My of the account running the proxy — same as Bridge):
//   client  = búnaðarskilríkið (private key)   — signs/decrypts
//   service = Arion public cert                — verifies response signature
// Thumbprints come from args or are auto-read from the Bridge config next door.
//
// Build (no tooling — the compiler built into Windows):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /out:hk-b2b-proxy.exe
//     /r:System.ServiceModel.dll /r:System.Runtime.Serialization.dll /r:System.IdentityModel.dll
//     hk-b2b-proxy.cs
// Run:  hk-b2b-proxy.exe [port] [clientThumbprint] [arionThumbprint]
//   defaults: 8027, thumbprints parsed from C:\Arion\B2BBridge\bin\B2B-Bridge-WasHost.exe.config
// One-time (admin) on a fresh machine:  netsh http add urlacl url=http://+:8027/HKProxy/ user=<user>
//   (on a machine that already runs the Bridge the proxy falls back to piggybacking the
//    existing 8025 ACL at http://+:8025/B2BBridge/HKProxy/ — no admin step needed)
// C# 5 syntax on purpose (framework csc has no newer features).
// ============================================================================
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography.X509Certificates;
using System.ServiceModel;
using System.ServiceModel.Channels;
using System.ServiceModel.Security;
using System.ServiceModel.Security.Tokens;
using System.Text;
using System.Xml;

namespace HK.B2BProxy
{
    // ── Binding: Arion 20131015 mutual-certificate + protection fix ─────────
    // Verbatim recipe from Arion's SampleClients (WcfSecurityHelper
    // .GetSchema20131015MutualCertificateBinding) with one addition: a binding
    // element that rewrites ChannelProtectionRequirements so the RESPONSE only
    // needs a signature (the bank never encrypts 20131015 responses).
    public class ProtectionFixBindingElement : BindingElement
    {
        public override BindingElement Clone() { return new ProtectionFixBindingElement(); }
        public override T GetProperty<T>(BindingContext context) { return context.GetInnerProperty<T>(); }
        public override bool CanBuildChannelFactory<TChannel>(BindingContext context)
        { return context.CanBuildInnerChannelFactory<TChannel>(); }
        public override IChannelFactory<TChannel> BuildChannelFactory<TChannel>(BindingContext context)
        {
            Fix(context.BindingParameters);
            return context.BuildInnerChannelFactory<TChannel>();
        }
        private static void Fix(BindingParameterCollection parameters)
        {
            parameters.Remove<ChannelProtectionRequirements>();
            ChannelProtectionRequirements req = new ChannelProtectionRequirements();
            // Live WSDL policy (200702/SP12): SignedParts = Body + the seven WS-Addressing headers;
            // NO EncryptedParts anywhere — requests and responses are sign-only.
            MessagePartSpecification signedParts = new MessagePartSpecification(true);
            string wsa = "http://www.w3.org/2005/08/addressing";
            string[] hdrs = new string[] { "To", "From", "FaultTo", "ReplyTo", "MessageID", "RelatesTo", "Action" };
            foreach (string h in hdrs) signedParts.HeaderTypes.Add(new System.Xml.XmlQualifiedName(h, wsa));
            MessagePartSpecification none = new MessagePartSpecification();
            req.OutgoingSignatureParts.AddParts(signedParts, "*");
            req.OutgoingEncryptionParts.AddParts(none, "*");
            req.IncomingSignatureParts.AddParts(signedParts, "*");
            req.IncomingEncryptionParts.AddParts(none, "*");
            parameters.Add(req);
        }
    }

    public class HKArionBinding : Binding
    {
        public override string Scheme { get { return "https"; } }
        public override BindingElementCollection CreateBindingElements()
        {
            BindingElementCollection elements = new BindingElementCollection();
            elements.Add(new ProtectionFixBindingElement());   // must sit ABOVE security

            X509SecurityTokenParameters initiator = new X509SecurityTokenParameters(X509KeyIdentifierClauseType.Thumbprint, SecurityTokenInclusionMode.AlwaysToRecipient);
            X509SecurityTokenParameters recipient = new X509SecurityTokenParameters(X509KeyIdentifierClauseType.Thumbprint, SecurityTokenInclusionMode.Never);
            AsymmetricSecurityBindingElement security = new AsymmetricSecurityBindingElement(recipient, initiator);
            security.SetKeyDerivation(false);
            security.IncludeTimestamp = true;
            security.AllowSerializedSigningTokenOnReply = true;
            security.MessageProtectionOrder = MessageProtectionOrder.SignBeforeEncrypt;
            security.MessageSecurityVersion = MessageSecurityVersion.WSSecurity11WSTrust13WSSecureConversation13WSSecurityPolicy12;
            security.LocalClientSettings.DetectReplays = true;
            security.LocalServiceSettings.DetectReplays = true;
            elements.Add(security);

            TextMessageEncodingBindingElement text = new TextMessageEncodingBindingElement(MessageVersion.Soap12WSAddressing10, Encoding.UTF8);
            text.ReaderQuotas.MaxStringContentLength = Int32.MaxValue;
            text.ReaderQuotas.MaxArrayLength = Int32.MaxValue;
            text.ReaderQuotas.MaxBytesPerRead = Int32.MaxValue;
            text.ReaderQuotas.MaxDepth = Int32.MaxValue;
            text.ReaderQuotas.MaxNameTableCharCount = Int32.MaxValue;
            elements.Add(text);

            HttpsTransportBindingElement https = new HttpsTransportBindingElement();
            https.RequireClientCertificate = false;
            https.MaxReceivedMessageSize = Int32.MaxValue;
            https.MaxBufferPoolSize = Int32.MaxValue;
            elements.Add(https);
            return elements;
        }
    }

    static class Program
    {
        const string SEC_NS = "http://IcelandicOnlineBanking/Security/";   // UserName/Password headers (Arion sample)
        const string ACTION_NS = "http://IcelandicOnlineBanking/2013/10/15/";
        const string SOAP11 = "http://schemas.xmlsoap.org/soap/envelope/";
        const string BRIDGE_CONFIG = @"C:\Arion\B2BBridge\bin\B2B-Bridge-WasHost.exe.config";

        static readonly Dictionary<string, string> Upstream = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
            { "StatementService", "https://ws.b2b.is/Statements/20131015/AccountService.svc" },
            { "PaymentService",   "https://ws.b2b.is/Payments/20131015/PaymentService.svc" },
        };

        static int Port = 8027;
        static string ClientThumb = "";
        static string ArionThumb = "";
        static X509Certificate2 ClientCert;
        static X509Certificate2 ArionCert;
        static string BoundPrefix = "";

        static void Main(string[] args)
        {
            // ws.b2b.is requires TLS 1.2+ — old .NET defaults would fail the HTTPS handshake.
            try { ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)12288; } // Tls12 | Tls13
            catch { ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; }

            if (args.Length > 0) Port = int.Parse(args[0]);
            if (args.Length > 1) ClientThumb = Clean(args[1]);
            if (args.Length > 2) ArionThumb = Clean(args[2]);

            if (ClientThumb.Length == 0 || ArionThumb.Length == 0) ReadThumbsFromBridgeConfig();
            if (ClientThumb.Length == 0 || ArionThumb.Length == 0)
            { Log("VILLA: vantar skilríkja-þumalför (args eða Bridge-config)."); Environment.Exit(1); }

            ClientCert = FindCert(ClientThumb, true);
            ArionCert = FindCert(ArionThumb, false);
            if (ClientCert == null) { Log("VILLA: búnaðarskilríkið fannst ekki í CurrentUser\\My (þumalfar endar á ...{0})", Tail(ClientThumb)); Environment.Exit(1); }
            if (ClientCert != null && !ClientCert.HasPrivateKey) { Log("VILLA: búnaðarskilríkið hefur ekki einkalykil."); Environment.Exit(1); }
            if (ArionCert == null) { Log("VILLA: Arion-skilríkið fannst ekki í CurrentUser\\My (þumalfar endar á ...{0})", Tail(ArionThumb)); Environment.Exit(1); }
            Log("Skilríki OK — client: {0} | arion: {1} (rennur út {2:yyyy-MM-dd})",
                ClientCert.GetNameInfo(X509NameType.SimpleName, false),
                ArionCert.GetNameInfo(X509NameType.SimpleName, false), ArionCert.NotAfter);

            // Bind: own port first; fall back to piggybacking the Bridge's existing 8025 URL ACL.
            var listener = new HttpListener();
            string[] prefixes = new string[] {
                string.Format("http://+:{0}/HKProxy/", Port),
                "http://+:8025/B2BBridge/HKProxy/",
            };
            foreach (string p in prefixes)
            {
                try { listener = new HttpListener(); listener.Prefixes.Add(p); listener.Start(); BoundPrefix = p; break; }
                catch (Exception ex) { Log("gat ekki bundið {0}: {1}", p, ex.Message); }
            }
            if (BoundPrefix.Length == 0)
            {
                Log("VILLA: engin binding tókst. Keyrðu einu sinni sem admin:");
                Log("  netsh http add urlacl url=http://+:{0}/HKProxy/ user={1}\\{2}", Port, Environment.UserDomainName, Environment.UserName);
                Environment.Exit(1);
            }
            Log("HK B2B Proxy hlustar á {0}", BoundPrefix);

            while (true)
            {
                HttpListenerContext ctx;
                try { ctx = listener.GetContext(); }
                catch (Exception ex) { Log("listener: {0}", ex.Message); continue; }
                System.Threading.ThreadPool.QueueUserWorkItem(delegate(object o) { Handle((HttpListenerContext)o); }, ctx);
            }
        }

        static void Handle(HttpListenerContext ctx)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            string service = "";
            try
            {
                string path = ctx.Request.Url.AbsolutePath;
                int i = path.LastIndexOf('/');
                service = i >= 0 ? path.Substring(i + 1) : path;

                if (ctx.Request.HttpMethod == "GET" && service.Equals("health", StringComparison.OrdinalIgnoreCase))
                {
                    WriteText(ctx.Response, 200, "application/json",
                        "{\"ok\":true,\"client\":true,\"arion\":true,\"prefix\":\"" + BoundPrefix + "\"}");
                    return;
                }
                string upstream;
                if (ctx.Request.HttpMethod != "POST" || !Upstream.TryGetValue(service, out upstream))
                { WriteText(ctx.Response, 404, "application/json", "{\"error\":\"not found\"}"); return; }

                string requestXml;
                using (var r = new StreamReader(ctx.Request.InputStream, Encoding.UTF8)) requestXml = r.ReadToEnd();

                var doc = new XmlDocument();
                doc.PreserveWhitespace = false;
                doc.LoadXml(requestXml);

                string user = FirstText(doc, "Username");
                string pass = FirstText(doc, "Password");
                XmlElement bodyEl = FirstElement(doc, "Body");
                XmlElement op = null;
                if (bodyEl != null) foreach (XmlNode n in bodyEl.ChildNodes) { op = n as XmlElement; if (op != null) break; }
                if (user.Length == 0 || pass.Length == 0 || op == null)
                { WriteSoap11Fault(ctx.Response, "Vantar UsernameToken eða aðgerð í SOAP-beiðni.", null); return; }

                string action = ACTION_NS + op.LocalName;

                var binding = new HKArionBinding();
                binding.SendTimeout = TimeSpan.FromSeconds(90);
                binding.ReceiveTimeout = TimeSpan.FromSeconds(90);
                binding.OpenTimeout = TimeSpan.FromSeconds(30);
                binding.CloseTimeout = TimeSpan.FromSeconds(30);

                var identity = EndpointIdentity.CreateDnsIdentity(ArionCert.GetNameInfo(X509NameType.SimpleName, false));
                var address = new EndpointAddress(new Uri(upstream), identity);

                var factory = new ChannelFactory<IRequestChannel>(binding, address);
                factory.Credentials.ClientCertificate.Certificate = ClientCert;
                factory.Credentials.ServiceCertificate.DefaultCertificate = ArionCert;
                factory.Credentials.ServiceCertificate.Authentication.CertificateValidationMode = X509CertificateValidationMode.None;

                Message reply;
                try
                {
                    IRequestChannel channel = factory.CreateChannel();
                    channel.Open();
                    try
                    {
                        Message req;
                        using (var nr = new XmlNodeReader(op))
                        {
                            req = Message.CreateMessage(MessageVersion.Soap12WSAddressing10, action, nr);
                            // Credentials as plain SOAP headers, exactly like Arion's 20131015 sample.
                            req.Headers.Add(MessageHeader.CreateHeader("UserName", SEC_NS, user));
                            req.Headers.Add(MessageHeader.CreateHeader("Password", SEC_NS, pass));
                            reply = channel.Request(req, TimeSpan.FromSeconds(90));
                        }
                        channel.Close();
                    }
                    catch { try { channel.Abort(); } catch { } throw; }
                }
                finally { try { factory.Close(); } catch { try { factory.Abort(); } catch { } } }

                if (reply == null) { WriteSoap11Fault(ctx.Response, "Ekkert svar frá bankanum.", null); return; }

                if (reply.IsFault)
                {
                    MessageFault mf = MessageFault.CreateFault(reply, 1024 * 1024);
                    string detailXml = null;
                    if (mf.HasDetail)
                    {
                        using (XmlDictionaryReader dr = mf.GetReaderAtDetailContents())
                        { detailXml = dr.ReadOuterXml(); }
                    }
                    string reason = mf.Reason != null ? mf.Reason.ToString() : "SOAP fault";
                    Log("{0} FAULT eftir {1} ms: {2}", service, sw.ElapsedMilliseconds, Trunc(reason, 160));
                    WriteSoap11Fault(ctx.Response, reason, detailXml);
                    return;
                }

                string inner;
                using (XmlDictionaryReader br = reply.GetReaderAtBodyContents()) { inner = br.ReadOuterXml(); }
                string envelope = "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                    "<s:Envelope xmlns:s=\"" + SOAP11 + "\"><s:Body>" + inner + "</s:Body></s:Envelope>";
                Log("{0} OK eftir {1} ms ({2} bytes)", service, sw.ElapsedMilliseconds, envelope.Length);
                WriteText(ctx.Response, 200, "text/xml; charset=utf-8", envelope);
            }
            catch (Exception ex)
            {
                // MessageSecurityException etc. — surface the message chain (no secrets in these).
                var sb = new StringBuilder();
                for (Exception e = ex; e != null; e = e.InnerException)
                {
                    sb.Append(e.GetType().Name).Append(": ").Append(e.Message);
                    // A FaultException from the bank carries the real WSS fault code — the decisive clue.
                    var fe = e as System.ServiceModel.FaultException;
                    if (fe != null && fe.Code != null)
                    {
                        sb.Append(" [CODE ").Append(fe.Code.Name);
                        if (fe.Code.SubCode != null) sb.Append(" / SUB ").Append(fe.Code.SubCode.Name);
                        sb.Append(" | REASON ").Append(fe.Reason != null ? fe.Reason.ToString() : "?").Append("]");
                    }
                    sb.Append("  ||  ");
                }
                Log("{0} VILLA eftir {1} ms: {2}", service, sw.ElapsedMilliseconds, Trunc(sb.ToString(), 1200));
                try { WriteSoap11Fault(ctx.Response, ex.Message, null); } catch { }
            }
        }

        // ---------------------------------------------------------------- util --
        static string Clean(string thumb)
        {
            var sb = new StringBuilder();
            foreach (char c in thumb) if (Uri.IsHexDigit(c)) sb.Append(char.ToUpperInvariant(c));
            return sb.ToString();
        }
        static string Tail(string thumb) { return thumb.Length > 6 ? thumb.Substring(thumb.Length - 6) : thumb; }

        static void ReadThumbsFromBridgeConfig()
        {
            try
            {
                if (!File.Exists(BRIDGE_CONFIG)) return;
                var doc = new XmlDocument();
                doc.Load(BRIDGE_CONFIG);
                if (ClientThumb.Length == 0)
                {
                    XmlNodeList n = doc.GetElementsByTagName("clientCertificate");
                    foreach (XmlNode x in n) { var a = x.Attributes["findValue"]; if (a != null) { ClientThumb = Clean(a.Value); break; } }
                }
                if (ArionThumb.Length == 0)
                {
                    XmlNodeList n = doc.GetElementsByTagName("defaultCertificate");
                    foreach (XmlNode x in n) { var a = x.Attributes["findValue"]; if (a != null) { ArionThumb = Clean(a.Value); break; } }
                }
                Log("Þumalför lesin úr Bridge-config ({0}).", BRIDGE_CONFIG);
            }
            catch (Exception ex) { Log("gat ekki lesið Bridge-config: {0}", ex.Message); }
        }

        static X509Certificate2 FindCert(string thumb, bool needPrivate)
        {
            var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadOnly);
            try
            {
                foreach (X509Certificate2 c in store.Certificates)
                    if (Clean(c.Thumbprint) == thumb && (!needPrivate || c.HasPrivateKey)) return c;
                // fall back: accept without private key so the caller can print a precise error
                foreach (X509Certificate2 c in store.Certificates)
                    if (Clean(c.Thumbprint) == thumb) return c;
                return null;
            }
            finally { store.Close(); }
        }

        static string FirstText(XmlDocument doc, string localName)
        {
            XmlElement e = FirstElement(doc, localName);
            return e != null ? e.InnerText.Trim() : "";
        }
        static XmlElement FirstElement(XmlDocument doc, string localName)
        {
            XmlNodeList all = doc.GetElementsByTagName("*");
            foreach (XmlNode n in all) { var e = n as XmlElement; if (e != null && e.LocalName == localName) return e; }
            return null;
        }

        static void WriteSoap11Fault(HttpListenerResponse resp, string reason, string detailXml)
        {
            string xml = "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                "<s:Envelope xmlns:s=\"" + SOAP11 + "\"><s:Body><s:Fault>" +
                "<faultcode>s:Client</faultcode>" +
                "<faultstring>" + Esc(reason) + "</faultstring>" +
                (detailXml != null ? "<detail>" + detailXml + "</detail>" : "") +
                "</s:Fault></s:Body></s:Envelope>";
            WriteText(resp, 500, "text/xml; charset=utf-8", xml);
        }

        static void WriteText(HttpListenerResponse resp, int status, string contentType, string body)
        {
            resp.StatusCode = status;
            resp.ContentType = contentType;
            byte[] b = Encoding.UTF8.GetBytes(body);
            resp.ContentLength64 = b.Length;
            resp.OutputStream.Write(b, 0, b.Length);
            resp.Close();
        }

        static string Esc(string s)
        { return s == null ? "" : s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;"); }
        static string Trunc(string s, int n) { return s != null && s.Length > n ? s.Substring(0, n) : s; }

        static void Log(string fmt, params object[] args)
        {
            string line = string.Format("[{0:HH:mm:ss}] {1}", DateTime.Now, string.Format(fmt, args));
            Console.WriteLine(line);
            try { File.AppendAllText("hk-b2b-proxy.log", line + "\r\n"); } catch { }
        }
    }
}
