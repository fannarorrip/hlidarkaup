import { NextRequest, NextResponse } from "next/server";
import { arionStatus, createArionConsent, getArionAccounts, getArionConsentStatus, getArionAccountTransactions } from "@/lib/arion";
import { storeBankTransactions, listBankTransactions } from "@/lib/bank-statement";

// PSD2 / Open Banking tester: create an account consent (→ scaRedirect to approve), then
// fetch accounts with the approved consentId. Gated stjornandi via middleware (/api/bankatenging).
// PSD2 is a SEPARATE product subscription from Cards, so the subscription key can be passed
// per-request (from the UI) rather than the env ARION_SUBSCRIPTION_KEY (which is the Cards key).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const subKey = typeof body.subscriptionKey === "string" ? body.subscriptionKey.trim() : "";
  const st = arionStatus();

  if (!subKey && !st.have.subscriptionKey) return NextResponse.json({ ok: false, reason: "not_configured", message: "Vantar áskriftarlykil (PSD2)." });
  if (!token && !st.have.accessToken && !st.ready) return NextResponse.json({ ok: false, reason: "no_token", message: "Límdu Arion aðgangslykil (Generate Token) í reitinn." });
  const bearer = token || undefined;
  const key = subKey || undefined;

  try {
    if (body.action === "accounts") {
      const consentId = String(body.consentId || "").trim();
      if (!consentId) return NextResponse.json({ ok: false, message: "Vantar samþykkisnúmer (consentId)." });
      const consentStatus = await getArionConsentStatus(consentId, bearer, key).catch(() => null);
      const accounts = await getArionAccounts(consentId, bearer, key);
      return NextResponse.json({ ok: true, accounts, consentStatus });
    }

    if (body.action === "transactions") {
      const consentId = String(body.consentId || "").trim();
      const accountId = String(body.accountId || "").trim();
      if (!consentId || !accountId) return NextResponse.json({ ok: false, message: "Vantar samþykki eða reikning." });
      const dateFrom = body.dateFrom ? String(body.dateFrom) : undefined;
      const dateTo = body.dateTo ? String(body.dateTo) : undefined;
      const iban = body.iban ? String(body.iban) : undefined;
      const ledgerAccount = body.ledgerAccount ? String(body.ledgerAccount) : undefined;
      const txns = await getArionAccountTransactions(accountId, consentId, dateFrom, dateTo, bearer, key);
      const stats = await storeBankTransactions(txns, accountId, iban, ledgerAccount);
      const transactions = await listBankTransactions(accountId, dateFrom, dateTo);
      return NextResponse.json({ ok: true, transactions, fetched: txns.length, ...stats });
    }
    const psuId = String(body.psuId || "").replace(/\D/g, "");
    if (!psuId) return NextResponse.json({ ok: false, message: "Vantar kennitölu reikningseiganda (PSU-ID)." });
    const ibans = Array.isArray(body.ibans) ? body.ibans.map(String) : (body.iban ? [String(body.iban)] : undefined);
    const consent = await createArionConsent({ psuId, ibans, bearerToken: bearer, subscriptionKey: key });
    return NextResponse.json({ ok: true, consent });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) });
  }
}
