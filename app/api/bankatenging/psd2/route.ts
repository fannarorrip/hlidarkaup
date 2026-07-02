import { NextRequest, NextResponse } from "next/server";
import { arionStatus, createArionConsent, getArionAccounts, getArionConsentStatus, getArionAccountTransactions } from "@/lib/arion";
import { storeBankTransactions, listBankTransactions } from "@/lib/bank-statement";
import { storeConsent, updateConsentStatus, getLatestConsent } from "@/lib/psd2-consents";

// PSD2 / Open Banking: create an account consent (→ scaRedirect to approve), fetch accounts and
// statement lines. Gated stjornandi via middleware (/api/bankatenging).
// Consents are persisted server-side (acc.psd2_consents); when the client sends no consentId the
// newest usable one is used, so the flow works across devices. Pasted token/subscription key are
// accepted in SANDBOX only — production runs entirely on server env (OAuth over mTLS + PSD2 key).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const st = arionStatus();
  const token = st.sandbox && typeof body.token === "string" ? body.token.trim() : "";
  const subKey = st.sandbox && typeof body.subscriptionKey === "string" ? body.subscriptionKey.trim() : "";

  if (!subKey && !st.have.psd2Key) return NextResponse.json({ ok: false, reason: "not_configured", message: "Vantar PSD2 áskriftarlykil (ARION_PSD2_SUBSCRIPTION_KEY)." });
  if (!token && !st.readyPsd2) {
    return NextResponse.json({ ok: false, reason: st.sandbox ? "no_token" : "not_configured", message: st.sandbox ? "Límdu Arion aðgangslykil (Generate Token) í reitinn." : "PSD2 tenging ekki tilbúin — athugaðu skilríki, lykla og ARION_REDIRECT_URI í .env." });
  }
  const bearer = token || undefined;
  const key = subKey || undefined;

  // Client-supplied consentId (sandbox tester) or the newest stored one.
  async function resolveConsent(): Promise<string> {
    const fromBody = String(body.consentId || "").trim();
    if (fromBody) return fromBody;
    return (await getLatestConsent())?.consent_id ?? "";
  }

  try {
    if (body.action === "accounts") {
      const consentId = await resolveConsent();
      if (!consentId) return NextResponse.json({ ok: false, message: "Ekkert samþykki til — búðu fyrst til samþykki (og staðfestu í banka)." });
      const consentStatus = await getArionConsentStatus(consentId, bearer, key).catch(() => null);
      if (consentStatus) await updateConsentStatus(consentId, consentStatus);
      const accounts = await getArionAccounts(consentId, bearer, key);
      return NextResponse.json({ ok: true, accounts, consentStatus, consentId });
    }

    if (body.action === "transactions") {
      const consentId = await resolveConsent();
      const accountId = String(body.accountId || "").trim();
      if (!consentId || !accountId) return NextResponse.json({ ok: false, message: "Vantar samþykki eða reikning." });
      const dateFrom = body.dateFrom ? String(body.dateFrom) : undefined;
      const dateTo = body.dateTo ? String(body.dateTo) : undefined;
      const iban = body.iban ? String(body.iban) : undefined;
      const ledgerAccount = body.ledgerAccount ? String(body.ledgerAccount) : undefined;
      const txns = await getArionAccountTransactions(accountId, consentId, dateFrom, dateTo, bearer, key);
      await updateConsentStatus(consentId, "valid"); // a successful fetch proves it
      const stats = await storeBankTransactions(txns, accountId, iban, ledgerAccount);
      const transactions = await listBankTransactions(accountId, dateFrom, dateTo);
      return NextResponse.json({ ok: true, transactions, fetched: txns.length, ...stats });
    }

    // default action: create a consent
    // PSU-ID: server env first; sandbox may use the tester value.
    const psuId = (process.env.ARION_PSU_ID || "").replace(/\D/g, "")
      || (st.sandbox ? String(body.psuId || "").replace(/\D/g, "") : "");
    if (!psuId) return NextResponse.json({ ok: false, message: st.sandbox ? "Vantar kennitölu reikningseiganda (PSU-ID)." : "Vantar ARION_PSU_ID (kennitala netbankanotanda) í .env." });
    const ibans = Array.isArray(body.ibans) ? body.ibans.map(String) : (body.iban ? [String(body.iban)] : undefined);
    const consent = await createArionConsent({ psuId, ibans, bearerToken: bearer, subscriptionKey: key });
    if (consent.consentId) await storeConsent(consent.consentId);
    return NextResponse.json({ ok: true, consent });
  } catch (e) {
    console.error("bankatenging/psd2 failed:", e);
    return NextResponse.json({ ok: false, reason: "error", message: e instanceof Error ? e.message : "Villa í PSD2 kalli." });
  }
}
