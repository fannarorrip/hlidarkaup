// HK-brú — Hlíðarkaup's own Arion/RB B2B bridge for the 20131015 service family
// (AccountService/StatementService, ClaimService, PaymentService at ws.b2b.is).
//
// WHY: Arion's official B2B Bridge 1.0.3.0 (2017) rejects 20131015 RESPONSES ("Body ... was not
// encrypted") because the bank signs-but-does-not-encrypt them while the old bridge's internal
// channel demands encryption. Wire-proven 2026-07-10: the bank ANSWERS correctly — only the old
// bridge refuses to read it. This host builds its own channel with HKArionBinding (see
// HKProtectionLevel.cs: request sign+encrypt, response sign-only) so the whole family works.
//
// WHAT IT IS: a contract-agnostic SOAP relay.
//   Rocky app  --plain SOAP 1.1 + UsernameToken-->  hk-bridge (this, LAN)  --WCF signed/encrypted-->  bank
// The incoming shape is IDENTICAL to what the old bridge accepted (ClearUsernameBinding style),
// so lib/arion-b2b-accounts.ts works unchanged — ARION_B2B_ACCOUNTS_URL just points here.
// UserName/Password from the wsse:UsernameToken are forwarded as the plain message headers
// ("UserName"/"Password" in http://IcelandicOnlineBanking/Security/) the 20131015 services expect
// (same as Arion's own SampleClients).
//
// SCOPE: 20131015 family ONLY. BillService (20130201, symmetric crypto) stays on Arion's old
// bridge — run both side by side. Endpoints (path → upstream):
//   /B2BBridge/StatementService → https://ws.b2b.is/Statements/20131015/AccountService.svc
//   /B2BBridge/ClaimService     → https://ws.b2b.is/Claims/20131015/ClaimService.svc
//   /B2BBridge/PaymentService   → https://ws.b2b.is/Payments/20131015/PaymentService.svc
// Pass "test" as first arg to use ws-test.b2b.is instead.
//
// BUILD (in-box compiler, no tooling — same recipe as kassabrú):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /o /out:hk-bridge.exe ^
//     /r:System.ServiceModel.dll /r:System.Runtime.Serialization.dll /r:System.IdentityModel.dll ^
//     /r:System.Configuration.dll hk-bridge.cs HKProtectionLevel.cs
//
// RUN:  hk-bridge.exe [test] [port]        (default port 8035)
//   One-time admin step:  netsh http add urlacl url=http://+:8035/B2BBridge/ user=<notandi>
//   Certificates must be in CurrentUser\My of the RUNNING user:
//     - búnaðarskilríkið (client, has private key)      → picked by HKBRIDGE_CLIENT_THUMB or auto
//     - Arion's current public cert (bank, no priv key) → picked by HKBRIDGE_BANK_THUMB or auto
//   Auto-pick: client = only cert WITH a private key; bank = subject/issuer contains "Arion".
//   hk-bridge.exe certs   → lists the store so the thumbprints can be checked.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography.X509Certificates;
using System.ServiceModel;
using System.ServiceModel.Channels;
using System.ServiceModel.Security;
using System.Text;
using System.Xml;
using IsIT.B2B.Common.Security;

// Samningslaus „universal“ WCF-samningur (Action=*) — í stað hráa IRequestChannel svo hægt sé
// að stilla verndarstig PER SKILABOÐ: fyrirspurn EncryptAndSign (bankinn krefst dulkóðaðs Body)
// en svar SIGN ONLY (bankinn undirritar svör en dulkóðar þau EKKI — ódulkóðað svar með
// IRequestChannel-sjálfgefnu kröfunum felldi "required message part was not encrypted", 6.8.2026).
[ServiceContract]
public interface IUniversalRequest
{
    [OperationContract(Action = "*", ReplyAction = "*")]
    Message Call(Message request);
}

static class HkBridge
{
    const string SecurityNs = "http://IcelandicOnlineBanking/Security/";
    const string Soap11Ns = "http://schemas.xmlsoap.org/soap/envelope/";
    const string WsseNs = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";

    static X509Certificate2 clientCert, bankCert;
    static readonly Dictionary<string, string> upstream = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    static readonly Dictionary<string, ChannelFactory<IUniversalRequest>> factories = new Dictionary<string, ChannelFactory<IUniversalRequest>>(StringComparer.OrdinalIgnoreCase);
    static readonly object factoryLock = new object();

    static int Main(string[] args)
    {
        bool test = Array.IndexOf(args, "test") >= 0;
        if (Array.IndexOf(args, "certs") >= 0) { ListCerts(); return 0; }
        int port = 8035;
        foreach (string a in args) { int p; if (int.TryParse(a, out p)) port = p; }

        // .NET Framework defaults to old TLS — the bank's edge requires TLS 1.2+ and force-closes
        // otherwise. 3072 = Tls12, 12288 = Tls13 (numeric so the C#5 compiler accepts both).
        ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072 | (SecurityProtocolType)12288;

        string host = test ? "https://ws-test.b2b.is" : "https://ws.b2b.is";
        upstream["StatementService"] = host + "/Statements/20131015/AccountService.svc";
        upstream["ClaimService"]     = host + "/Claims/20131015/ClaimService.svc";
        upstream["PaymentService"]   = host + "/Payments/20131015/PaymentService.svc";

        try { LoadCerts(); }
        catch (Exception ex) { Console.WriteLine("SKILRIKI-VILLA: " + ex.Message); Console.WriteLine("Keyrðu 'hk-bridge.exe certs' og settu HKBRIDGE_CLIENT_THUMB / HKBRIDGE_BANK_THUMB."); return 1; }
        Console.WriteLine("Skilríki OK:");
        Console.WriteLine("  við (client): " + clientCert.Subject + "  [" + clientCert.Thumbprint + "]");
        Console.WriteLine("  banki:        " + bankCert.Subject + "  [" + bankCert.Thumbprint + "]");
        if (bankCert.NotAfter < DateTime.Now.AddDays(30))
            Console.WriteLine("  ATH: bankaskilríkið rennur út " + bankCert.NotAfter.ToString("yyyy-MM-dd") + " — sækja nýtt úr WSDL þegar þar að kemur.");

        var listener = new HttpListener();
        // HKBRIDGE_PREFIX overrides the whole prefix — e.g. the pre-ACLed
        // http://+:80/Temporary_Listen_Addresses/hkbridge/ for non-admin test runs.
        string prefix = Environment.GetEnvironmentVariable("HKBRIDGE_PREFIX");
        if (string.IsNullOrEmpty(prefix)) prefix = "http://+:" + port + "/B2BBridge/";
        if (!prefix.EndsWith("/")) prefix += "/";
        listener.Prefixes.Add(prefix);
        try { listener.Start(); }
        catch (HttpListenerException ex)
        {
            Console.WriteLine("Gat ekki hlustað á " + prefix + " (" + ex.Message + ")");
            Console.WriteLine("Einskiptis admin-skref:  netsh http add urlacl url=" + prefix + " user=" + Environment.UserName);
            return 1;
        }
        Console.WriteLine("HK-brú hlustar á " + prefix + " -> " + host + "  (" + (test ? "PRÓFUNARUMHVERFI" : "FRAMLEIÐSLA") + ")");
        Console.WriteLine("Þjónustur: " + string.Join(", ", new List<string>(upstream.Keys).ToArray()));

        while (true)
        {
            HttpListenerContext ctx;
            try { ctx = listener.GetContext(); } catch { break; }
            System.Threading.ThreadPool.QueueUserWorkItem(delegate(object o) { Handle((HttpListenerContext)o); }, ctx);
        }
        return 0;
    }

    static void Handle(HttpListenerContext ctx)
    {
        string path = (ctx.Request.Url.AbsolutePath ?? "").TrimEnd('/');
        string svc = path.Substring(path.LastIndexOf('/') + 1);
        try
        {
            if (svc.Equals("health", StringComparison.OrdinalIgnoreCase)) { WriteText(ctx, 200, "{\"ok\":true,\"services\":\"" + string.Join(",", new List<string>(upstream.Keys).ToArray()) + "\"}", "application/json"); return; }
            string target;
            if (!upstream.TryGetValue(svc, out target)) { WriteText(ctx, 404, "Óþekkt þjónusta: " + svc, "text/plain"); return; }
            if (ctx.Request.HttpMethod != "POST") { WriteText(ctx, 405, "POST only", "text/plain"); return; }

            string body;
            using (var r = new StreamReader(ctx.Request.InputStream, Encoding.UTF8)) body = r.ReadToEnd();
            var doc = new XmlDocument();
            doc.PreserveWhitespace = true;
            doc.LoadXml(body);

            // SOAPAction: sent by the Rocky libs; strip surrounding quotes.
            string action = (ctx.Request.Headers["SOAPAction"] ?? "").Trim().Trim('"');
            if (action.Length == 0) { WriteSoapFault(ctx, "Vantar SOAPAction-haus"); return; }

            // UsernameToken out of the SOAP 1.1 header (same auth shape the old bridge took).
            string user = InnerText(doc, WsseNs, "Username"), pass = InnerText(doc, WsseNs, "Password");
            if (user.Length == 0 || pass.Length == 0) { WriteSoapFault(ctx, "Vantar UsernameToken (notanda/lykilorð B2B)"); return; }

            // First element child of soap:Body = the operation payload, relayed verbatim.
            XmlElement payload = BodyPayload(doc);
            if (payload == null) { WriteSoapFault(ctx, "Tómur SOAP Body"); return; }
            // Namespace prefixes may be DECLARED on the Envelope (Rocky does: xmlns:at on the root)
            // but USED inside the payload. Cutting the payload out loses those declarations — the
            // bank would then see fields in no/wrong namespace (null fields → its NRE fault).
            // Materialize every in-scope declaration onto the payload before relaying.
            payload = WithInScopeNamespaces(payload);

            Message reply = CallBank(svc, target, action, payload, user, pass);
            string replyXml = ReplyBodyXml(reply);
            string envelope = "<s:Envelope xmlns:s=\"" + Soap11Ns + "\"><s:Body>" + replyXml + "</s:Body></s:Envelope>";
            WriteText(ctx, 200, envelope, "text/xml; charset=utf-8");
            Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  " + svc + "  " + action.Substring(action.LastIndexOf('/') + 1) + "  OK");
        }
        catch (FaultException fx)
        {
            string msg = "Bankinn hafnaði: " + fx.Message + FaultDetail(fx);
            Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  " + svc + "  BANKAVILLA: " + msg);
            WriteSoapFault(ctx, msg);
        }
        catch (Exception ex)
        {
            // A secured-channel failure often WRAPS the bank's FaultException (with its code/detail)
            // — dig it out of the chain so the real bank error surfaces instead of the wrapper text.
            string extra = "";
            for (Exception e = ex; e != null; e = e.InnerException)
            {
                FaultException f = e as FaultException;
                if (f != null) { extra = FaultDetail(f); break; }
            }
            Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  " + svc + "  VILLA: " + ex.GetBaseException().Message + extra);
            if (Environment.GetEnvironmentVariable("HKBRIDGE_DEBUG") == "1") Console.WriteLine(ex.ToString());
            WriteSoapFault(ctx, ex.GetBaseException().Message + extra);
        }
    }

    /// <summary>Code + detail XML out of a FaultException (RB faults carry structured detail).</summary>
    static string FaultDetail(FaultException f)
    {
        try
        {
            MessageFault mf = f.CreateMessageFault();
            string code = mf.Code != null ? mf.Code.Name : "?";
            string detail = "";
            if (mf.HasDetail)
                using (XmlDictionaryReader dr = mf.GetReaderAtDetailContents()) detail = dr.ReadOuterXml();
            return "  |CODE| " + code + (detail.Length > 0 ? "  |DETAIL| " + detail : "  |ENGINN-DETAIL|");
        }
        catch { return ""; }
    }

    // ---- upstream call ------------------------------------------------------

    static Message CallBank(string svc, string url, string action, XmlElement payload, string user, string pass)
    {
        ChannelFactory<IUniversalRequest> factory = GetFactory(svc, url);
        var identity = EndpointIdentity.CreateDnsIdentity(bankCert.GetNameInfo(X509NameType.SimpleName, false));
        IUniversalRequest channel = factory.CreateChannel(new EndpointAddress(new Uri(url), identity));
        IClientChannel cc = (IClientChannel)channel;
        try
        {
            cc.OperationTimeout = TimeSpan.FromSeconds(100);
            cc.Open();
            // NOTE: CreateMessage reads the body LAZILY (at Request/serialization time) — the reader
            // must stay open until the call completes, so no using-block here (XmlNodeReader holds
            // no unmanaged resources; GC handles it).
            var reader = new XmlNodeReader(payload);
            reader.MoveToContent(); // CreateMessage needs the reader ON the element, not before it
            Message msg = Message.CreateMessage(MessageVersion.Soap12WSAddressing10, action, reader);
            // The 20131015 services take the B2B user as plain headers (Arion SampleClients pattern).
            msg.Headers.Add(MessageHeader.CreateHeader("UserName", SecurityNs, user));
            msg.Headers.Add(MessageHeader.CreateHeader("Password", SecurityNs, pass));
            Message reply = channel.Call(msg);
            cc.Close();
            return reply;
        }
        catch { try { cc.Abort(); } catch { } throw; }
    }

    static ChannelFactory<IUniversalRequest> GetFactory(string svc, string url)
    {
        lock (factoryLock)
        {
            ChannelFactory<IUniversalRequest> f;
            if (factories.TryGetValue(svc, out f) && f.State == CommunicationState.Opened) return f;
            var binding = new HKArionBinding();
            var cf = new ChannelFactory<IUniversalRequest>(binding);
            // Verndarstig PER SKILABOÐ á samningnum — þetta er leiðin sem WCF virðir í raun:
            // fyrirspurn (Input) dulkóðuð+undirrituð, svar (Output) BARA undirritað, því bankinn
            // dulkóðar ekki svör (WSDL-stefnan hans telur einungis SignedParts).
            foreach (System.ServiceModel.Description.OperationDescription od in cf.Endpoint.Contract.Operations)
                foreach (System.ServiceModel.Description.MessageDescription md in od.Messages)
                    md.ProtectionLevel = md.Direction == System.ServiceModel.Description.MessageDirection.Input
                        ? System.Net.Security.ProtectionLevel.EncryptAndSign
                        : System.Net.Security.ProtectionLevel.Sign;
            cf.Credentials.ClientCertificate.Certificate = clientCert;
            cf.Credentials.ServiceCertificate.DefaultCertificate = bankCert;
            cf.Credentials.ServiceCertificate.Authentication.CertificateValidationMode = X509CertificateValidationMode.None; // per Arion's own sample
            cf.Open();
            factories[svc] = cf;
            return cf;
        }
    }

    static string ReplyBodyXml(Message reply)
    {
        if (reply.IsFault)
        {
            MessageFault mf = MessageFault.CreateFault(reply, 1024 * 1024);
            string reason = mf.Reason != null ? mf.Reason.ToString() : "SOAP fault frá banka";
            string detail = "";
            try
            {
                if (mf.HasDetail)
                    using (XmlDictionaryReader dr = mf.GetReaderAtDetailContents())
                        detail = dr.ReadOuterXml();
            }
            catch { }
            throw new FaultException(reason + (detail.Length > 0 ? "  |DETAIL| " + detail : "  |ENGINN-DETAIL|") + "  |CODE| " + (mf.Code != null ? mf.Code.Name : "?"));
        }
        using (XmlDictionaryReader r = reply.GetReaderAtBodyContents())
        {
            // Dýptartalning afkóðaðs (áður dulkóðaðs) svars er önnur en í berum skeytum — gamla
            // skilyrðið (Depth != 0) skrifaði þá einum EndElement of mikið og felldi skrifarann.
            // Öruggt óháð dýpt: skrifa element-undirtré þar til Body lokast eða lesarinn tæmist.
            var sb = new StringBuilder();
            using (var w = XmlWriter.Create(sb, new XmlWriterSettings { OmitXmlDeclaration = true, ConformanceLevel = ConformanceLevel.Fragment }))
                while (!r.EOF && r.NodeType != XmlNodeType.EndElement)
                {
                    if (r.NodeType == XmlNodeType.Element) w.WriteNode(r, false);
                    else if (!r.Read()) break;
                }
            return sb.ToString();
        }
    }

    // ---- certificates -------------------------------------------------------

    static void LoadCerts()
    {
        string clientThumb = Clean(Environment.GetEnvironmentVariable("HKBRIDGE_CLIENT_THUMB"));
        string bankThumb = Clean(Environment.GetEnvironmentVariable("HKBRIDGE_BANK_THUMB"));
        var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
        store.Open(OpenFlags.ReadOnly);
        try
        {
            foreach (X509Certificate2 c in store.Certificates)
            {
                string t = c.Thumbprint ?? "";
                if (clientThumb.Length > 0 && t.Equals(clientThumb, StringComparison.OrdinalIgnoreCase)) clientCert = c;
                if (bankThumb.Length > 0 && t.Equals(bankThumb, StringComparison.OrdinalIgnoreCase)) bankCert = c;
            }
            // Auto-pick when not pinned: client = private key AND an Icelandic organisational cert
            // (NTRIS-<kt> organizationIdentifier in the subject) — plain first-private-key would grab
            // e.g. a Windows Hello cert. Bank = Arion-issued public cert.
            if (clientCert == null && clientThumb.Length == 0)
            {
                foreach (X509Certificate2 c in store.Certificates)
                    if (c.HasPrivateKey && (c.Subject ?? "").IndexOf("NTRIS-", StringComparison.OrdinalIgnoreCase) >= 0) { clientCert = c; break; }
                if (clientCert == null)
                    foreach (X509Certificate2 c in store.Certificates) if (c.HasPrivateKey) { clientCert = c; break; }
            }
            if (bankCert == null && bankThumb.Length == 0)
                foreach (X509Certificate2 c in store.Certificates)
                    if (!c.HasPrivateKey && ((c.Subject ?? "").IndexOf("arion", StringComparison.OrdinalIgnoreCase) >= 0 || (c.Issuer ?? "").IndexOf("arion", StringComparison.OrdinalIgnoreCase) >= 0)) { bankCert = c; break; }
        }
        finally { store.Close(); }
        if (clientCert == null) throw new Exception("Fann ekki búnaðarskilríkið (með einkalykli) í CurrentUser\\My.");
        if (bankCert == null) throw new Exception("Fann ekki Arion-bankaskilríkið (public) í CurrentUser\\My.");
        if (!clientCert.HasPrivateKey) throw new Exception("Búnaðarskilríkið hefur engan einkalykil — flytja inn .pfx (ekki .cer).");
    }

    static void ListCerts()
    {
        var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
        store.Open(OpenFlags.ReadOnly);
        Console.WriteLine("CurrentUser\\My:");
        foreach (X509Certificate2 c in store.Certificates)
            Console.WriteLine("  " + (c.HasPrivateKey ? "[einkalykill] " : "[public]      ") + c.Thumbprint + "  " + c.Subject + "  (rennur út " + c.NotAfter.ToString("yyyy-MM-dd") + ")");
        store.Close();
    }

    // ---- xml + http helpers -------------------------------------------------

    static string Clean(string s) { return (s ?? "").Replace(" ", "").Trim(); }

    static string InnerText(XmlDocument doc, string ns, string local)
    {
        XmlNodeList nodes = doc.GetElementsByTagName(local, ns);
        return nodes.Count > 0 ? (nodes[0].InnerText ?? "").Trim() : "";
    }

    static XmlElement BodyPayload(XmlDocument doc)
    {
        XmlNodeList bodies = doc.GetElementsByTagName("Body", Soap11Ns);
        if (bodies.Count == 0) return null;
        foreach (XmlNode n in bodies[0].ChildNodes) if (n.NodeType == XmlNodeType.Element) return (XmlElement)n;
        return null;
    }

    /// <summary>Copy of the element with every ancestor-declared namespace materialized locally,
    /// so the subtree stays valid when serialized outside its original document.</summary>
    static XmlElement WithInScopeNamespaces(XmlElement el)
    {
        var doc = new XmlDocument();
        doc.PreserveWhitespace = true;
        var clone = (XmlElement)doc.ImportNode(el, true);
        doc.AppendChild(clone);
        var nav = el.CreateNavigator();
        IDictionary<string, string> inScope = nav.GetNamespacesInScope(System.Xml.XmlNamespaceScope.ExcludeXml);
        foreach (KeyValuePair<string, string> kv in inScope)
        {
            if (kv.Key.Length == 0) continue; // default ns travels on the element itself
            if (clone.GetAttribute("xmlns:" + kv.Key).Length == 0)
                clone.SetAttribute("xmlns:" + kv.Key, kv.Value);
        }
        return clone;
    }

    static void WriteSoapFault(HttpListenerContext ctx, string reason)
    {
        string xml = "<s:Envelope xmlns:s=\"" + Soap11Ns + "\"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>" +
                     System.Security.SecurityElement.Escape(reason) + "</faultstring></s:Fault></s:Body></s:Envelope>";
        WriteText(ctx, 500, xml, "text/xml; charset=utf-8");
    }

    static void WriteText(HttpListenerContext ctx, int status, string text, string contentType)
    {
        try
        {
            byte[] b = Encoding.UTF8.GetBytes(text);
            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = contentType;
            ctx.Response.ContentLength64 = b.Length;
            ctx.Response.OutputStream.Write(b, 0, b.Length);
            ctx.Response.OutputStream.Close();
        }
        catch { /* client gone */ }
    }
}
