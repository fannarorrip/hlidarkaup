// HK binding for Arion IOBWS 20131015 services, built from Arion's own sample code
// (SampleClients WcfSecurityHelper.GetSchema20131015MutualCertificateBinding, © Arion banki hf.)
// plus a protection-fix element: the bank REQUIRES the request Body encrypted but SIGNS-ONLY its
// responses. The fix element sits at the top of the binding stack and replaces the
// ChannelProtectionRequirements before the security element consumes them — this works no matter
// how the host constructs its channel factories (config or code).
// Compiled with C# 5 (framework csc) — keep the syntax old-school.
using System;
using System.Text;
using System.ServiceModel;
using System.ServiceModel.Channels;
using System.ServiceModel.Configuration;
using System.ServiceModel.Security;
using System.ServiceModel.Security.Tokens;

namespace IsIT.B2B.Common.Security
{
    /// <summary>Replaces ChannelProtectionRequirements: request = sign+encrypt, response = sign only.</summary>
    public class ProtectionFixBindingElement : BindingElement
    {
        public override BindingElement Clone()
        {
            return new ProtectionFixBindingElement();
        }

        public override T GetProperty<T>(BindingContext context)
        {
            return context.GetInnerProperty<T>();
        }

        public override bool CanBuildChannelFactory<TChannel>(BindingContext context)
        {
            return context.CanBuildInnerChannelFactory<TChannel>();
        }

        public override IChannelFactory<TChannel> BuildChannelFactory<TChannel>(BindingContext context)
        {
            Fix(context.BindingParameters);
            return context.BuildInnerChannelFactory<TChannel>();
        }

        private static void Fix(BindingParameterCollection parameters)
        {
            parameters.Remove<ChannelProtectionRequirements>();
            ChannelProtectionRequirements req = new ChannelProtectionRequirements();
            // Sign the request body AND the application headers (UserName/Password) — a standard
            // WCF service-side policy expects application headers signed; leaving them unsigned
            // makes the bank reject/NRE. Addressing headers + Timestamp are signed by the security
            // protocol itself (IncludeTimestamp) regardless of these parts.
            string wsa = "http://www.w3.org/2005/08/addressing";
            System.Xml.XmlQualifiedName[] authHeaders = new System.Xml.XmlQualifiedName[] {
                new System.Xml.XmlQualifiedName("UserName", "http://IcelandicOnlineBanking/Security/"),
                new System.Xml.XmlQualifiedName("Password", "http://IcelandicOnlineBanking/Security/"),
                // WS-Addressing headers — default WCF protection signs them; the bank's validator
                // expects that (the July-proven request came from a default-protection WCF host).
                new System.Xml.XmlQualifiedName("To", wsa),
                new System.Xml.XmlQualifiedName("Action", wsa),
                new System.Xml.XmlQualifiedName("MessageID", wsa),
                new System.Xml.XmlQualifiedName("ReplyTo", wsa),
                new System.Xml.XmlQualifiedName("RelatesTo", wsa),
                new System.Xml.XmlQualifiedName("FaultTo", wsa),
            };
            MessagePartSpecification bodyAndAuth = new MessagePartSpecification(true, authHeaders);
            MessagePartSpecification body = new MessagePartSpecification(true);
            MessagePartSpecification none = new MessagePartSpecification();
            // ATH SPEGLUN (staðfest 6.8.2026): WCF túlkar ChannelProtectionRequirements úr
            // binding-parametrum frá SJÓNARHÓLI ÞJÓNUSTUNNAR og speglar þær fyrir client-rásina —
            // "Incoming" hér = FYRIRSPURNIN okkar, "Outgoing" = SVAR bankans. Gamla uppsetningin
            // (Outgoing=encrypt body) varð því að kröfu um DULKÓÐAÐ SVAR og felldi fyrstu
            // alvöru gagnasvörin með "required message part was not encrypted".
            req.IncomingSignatureParts.AddParts(bodyAndAuth, "*"); // fyrirspurn: sign body + auth headers
            req.IncomingEncryptionParts.AddParts(body, "*");       // fyrirspurn: encrypt BODY (bankakrafa)
            req.OutgoingSignatureParts.AddParts(body, "*");        // svar: krefjast undirritaðs body
            req.OutgoingEncryptionParts.AddParts(none, "*");       // svar: bankinn dulkóðar EKKI svör
            parameters.Add(req);
        }
    }

    /// <summary>Arion 20131015 mutual-certificate binding + protection fix.</summary>
    public class HKArionBinding : Binding
    {
        public override string Scheme
        {
            get { return "https"; }
        }

        public override BindingElementCollection CreateBindingElements()
        {
            BindingElementCollection elements = new BindingElementCollection();

            // 0. Protection fix — must sit ABOVE the security element.
            elements.Add(new ProtectionFixBindingElement());

            // 1. Security — verbatim from Arion's GetSchema20131015MutualCertificateBinding.
            // Env-tweakable while we match the bank's exact expectations:
            //   HKBRIDGE_SECVER=feb2005  → WSSecurity11 + WSTrustFeb2005/BSP1.0 (old bridge family)
            //   HKBRIDGE_TOKENREF=issuerserial → IssuerSerial references instead of Thumbprint
            string secver = Environment.GetEnvironmentVariable("HKBRIDGE_SECVER") ?? "";
            string tokref = Environment.GetEnvironmentVariable("HKBRIDGE_TOKENREF") ?? "";
            X509KeyIdentifierClauseType clause = tokref == "issuerserial" ? X509KeyIdentifierClauseType.IssuerSerial : X509KeyIdentifierClauseType.Thumbprint;
            X509SecurityTokenParameters initiator = new X509SecurityTokenParameters(clause, SecurityTokenInclusionMode.AlwaysToRecipient);
            X509SecurityTokenParameters recipient = new X509SecurityTokenParameters(clause, SecurityTokenInclusionMode.Never);
            AsymmetricSecurityBindingElement security = new AsymmetricSecurityBindingElement(recipient, initiator);
            // More sweep switches: HKBRIDGE_DERIVED=1, HKBRIDGE_SIGCONF=1, HKBRIDGE_PROTORDER=sbees
            security.SetKeyDerivation(Environment.GetEnvironmentVariable("HKBRIDGE_DERIVED") == "1");
            security.IncludeTimestamp = true;
            security.AllowSerializedSigningTokenOnReply = true;
            security.RequireSignatureConfirmation = Environment.GetEnvironmentVariable("HKBRIDGE_SIGCONF") == "1";
            security.MessageProtectionOrder = (Environment.GetEnvironmentVariable("HKBRIDGE_PROTORDER") ?? "") == "sbees"
                ? MessageProtectionOrder.SignBeforeEncryptAndEncryptSignature
                : MessageProtectionOrder.SignBeforeEncrypt;
            security.MessageSecurityVersion = secver == "feb2005"
                ? MessageSecurityVersion.WSSecurity11WSTrustFebruary2005WSSecureConversationFebruary2005WSSecurityPolicy11BasicSecurityProfile10
                : MessageSecurityVersion.WSSecurity11WSTrust13WSSecureConversation13WSSecurityPolicy12;
            security.LocalClientSettings.DetectReplays = true;
            security.LocalServiceSettings.DetectReplays = true;
            elements.Add(security);

            // 2. SOAP 1.2 + WS-Addressing 1.0 text encoding.
            TextMessageEncodingBindingElement text = new TextMessageEncodingBindingElement(MessageVersion.Soap12WSAddressing10, Encoding.UTF8);
            text.ReaderQuotas.MaxStringContentLength = Int32.MaxValue;
            text.ReaderQuotas.MaxArrayLength = Int32.MaxValue;
            text.ReaderQuotas.MaxBytesPerRead = Int32.MaxValue;
            text.ReaderQuotas.MaxDepth = Int32.MaxValue;
            text.ReaderQuotas.MaxNameTableCharCount = Int32.MaxValue;
            elements.Add(text);

            // 3. HTTPS transport.
            HttpsTransportBindingElement https = new HttpsTransportBindingElement();
            https.RequireClientCertificate = false;
            https.MaxReceivedMessageSize = Int32.MaxValue;
            https.MaxBufferPoolSize = Int32.MaxValue;
            elements.Add(https);

            return elements;
        }
    }

    public class HKArionBindingElement : StandardBindingElement
    {
        protected override Type BindingElementType
        {
            get { return typeof(HKArionBinding); }
        }

        protected override void OnApplyConfiguration(Binding binding)
        {
        }
    }

    public class HKArionBindingCollectionElement : StandardBindingCollectionElement<HKArionBinding, HKArionBindingElement>
    {
    }
}
