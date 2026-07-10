import Link from "next/link";
import { arionStatus } from "@/lib/arion";
import { getBankAccounts } from "@/lib/accounting-queries";
import { getClaims } from "@/lib/claims";
import { listOpenPayables } from "@/lib/payables";
import { listOpenBankBills, b2bStatus } from "@/lib/arion-b2b";
import { paymentsStatus } from "@/lib/arion-b2b-payments";
import { getCollectionProfiles, getCollectionSettings } from "@/lib/collection";
import { getBankSettings, getPostableAccounts } from "@/lib/bank-settings";
import { claimsEnabled } from "@/lib/claims";
import ArionTest from "./ArionTest";
import ArionCards from "./ArionCards";
import ArionPsd2 from "./ArionPsd2";
import ArionStatement from "./ArionStatement";
import Payables from "./Payables";
import BankBills from "./BankBills";
import CollectionProfiles from "./CollectionProfiles";
import ClaimsActions from "./ClaimsActions";
import BankSettings from "./BankSettings";
import BankatengingTabs, { type BankTab } from "./BankatengingTabs";

export const dynamic = "force-dynamic";

const kr = (n: number) => Math.round(n).toLocaleString("is-IS");

function Row({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-sm">
      <span>{label}{hint && <span className="text-gray-400"> — {hint}</span>}</span>
      <span className={ok ? "text-green-700" : "text-gray-300"}>{ok ? "✓ stillt" : "vantar"}</span>
    </div>
  );
}

export default async function BankatengingPage() {
  const st = arionStatus();
  const [bankAccounts, claims, payables, bankBills, collProfiles, collSettings, settings, postableAccounts] = await Promise.all([
    getBankAccounts().catch(() => []),
    getClaims().catch(() => []),
    listOpenPayables().catch(() => []),
    listOpenBankBills().catch(() => []),
    getCollectionProfiles().catch(() => []),
    getCollectionSettings().catch(() => ({ kennitala_krofuhafa: null, agreement_signed: false, agreement_note: null })),
    getBankSettings().catch(() => ({ card_liability_account: "9310", card_expense_account: null, default_bank_ledger: null, statement_contra_in: null, statement_contra_out: null, auto_sync: false })),
    getPostableAccounts().catch(() => []),
  ]);
  const b2b = b2bStatus();

  const openClaims = claims.filter((c) => c.status !== "paid" && c.status !== "cancelled");
  const queuedClaims = claims.filter((c) => c.status === "queued").length;
  const claimTotal = openClaims.reduce((a, c) => a + (Number(c.amount) || 0), 0);

  // ── Tengingar ──────────────────────────────────────────────────────────────
  const tengingar = (
    <div className="grid md:grid-cols-2 gap-5">
      <div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-sm">Staða stillinga — Arion</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${st.sandbox ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{st.sandbox ? "Sandkassi" : "Raunumhverfi"}</span>
          </div>
          <Row label="Áskriftarlykill (API key)" ok={st.have.subscriptionKey} hint="ARION_SUBSCRIPTION_KEY" />
          {st.sandbox ? (
            <Row label="Aðgangslykill (Generate Token)" ok={st.have.accessToken} hint="ARION_ACCESS_TOKEN" />
          ) : (
            <>
              <Row label="Notendanafn (netbanki)" ok={st.have.username} hint="ARION_USERNAME" />
              <Row label="Lykilorð (netbanki)" ok={st.have.password} hint="ARION_PASSWORD" />
              <Row label="Slóð að skilríki (.pfx)" ok={st.have.certPath} hint="ARION_CERT_PATH" />
              <Row label="Skilríkjaskrá finnst á þjóni" ok={st.have.certFileFound} />
              <Row label="Lykilorð skilríkis" ok={st.have.certPassword} hint="ARION_CERT_PASSWORD" />
            </>
          )}
        </div>
        <div className="mt-3 text-xs text-gray-500">
          <p>Token-slóð: <code>{st.tokenUrl}</code></p>
          <p>API-slóð: <code>{st.baseUrl}</code></p>
        </div>
      </div>

      <div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="font-semibold text-sm mb-1">Prófa tengingu</p>
          <p className="text-xs text-gray-500 mb-4">Sækir aðgangslykil (OAuth) frá Arion með skilríkinu yfir mTLS. Notaðu þetta til að staðfesta að skilríki og aðgangur virki.</p>
          <ArionTest ready={st.ready} />
        </div>

        <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 mt-4 text-xs text-gray-600 leading-relaxed">
          <p className="font-semibold text-gray-700 mb-1">Hvað vantar til að tengja?</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Skrá sig á þróunargátt Arion og fá <b>áskriftarlykil</b>.</li>
            <li>Sækja <b>búnaðarskilríki</b> (.pfx) frá Auðkenni og setja á þjóninn.</li>
            <li>Stofna <b>sérstakan netbankanotanda með takmarkaðan aðgang</b>.</li>
            <li>Klára „Go Live“ (hlaða upp skilríki) í þróunargáttinni.</li>
            <li>Fylla út ARION_* breyturnar í <code>.env.local</code> og endurræsa.</li>
          </ol>
          <p className="mt-2">Sjá <code>deploy/ARION_ONBOARDING.md</code> fyrir nákvæma leiðbeiningu.</p>
        </div>
      </div>
    </div>
  );

  // ── Bankareikningar ──────────────────────────────────────────────────────────
  const bankareikningar = (
    <div className="grid md:grid-cols-2 gap-5 items-start">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="font-semibold text-sm mb-1">Bankareikningar í bókhaldi</p>
        <p className="text-xs text-gray-500 mb-3">Lyklar merktir „Sjóður &amp; banki“ (RSK 5160). Hver banka­reikningur tengist bókhaldslykli sem færslur bókast á.</p>
        {bankAccounts.length === 0 ? (
          <p className="text-sm text-gray-400">Engir bankareikningar skráðir.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {bankAccounts.map((a) => (
                <tr key={a.account_number} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-400 tabular-nums w-16">{a.account_number}</td>
                  <td className="py-1.5">{a.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] text-gray-400">Til að bæta við reikningi: stofnaðu bókhaldslykil í kaflanum Bókhaldslyklar, eða sæktu IBAN beint úr Arion með PSD2 hér til hliðar.</p>
      </div>
      <ArionPsd2 sandbox={st.sandbox} serverReady={st.readyPsd2} />
    </div>
  );

  // ── Innheimtuþjónustur ───────────────────────────────────────────────────────
  const innheimtuThjonustur = <CollectionProfiles profiles={collProfiles} settings={collSettings} bankAccounts={bankAccounts} />;

  // ── Innheimtukröfur ──────────────────────────────────────────────────────────
  const innheimtukrofur = (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <p className="font-semibold text-sm">Innheimtukröfur</p>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">Til í kerfinu</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Kröfur sem við gefum út á viðskiptavini (reikningar á reikning + mánaðaruppgjör). Kröfulistinn er þegar til undir Sölukerfi.</p>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-400">Opnar kröfur</p>
          <p className="text-lg font-bold tabular-nums">{openClaims.length}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-400">Upphæð útistandandi</p>
          <p className="text-lg font-bold tabular-nums">{kr(claimTotal)} kr.</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-400">Alls kröfur</p>
          <p className="text-lg font-bold tabular-nums">{claims.length}</p>
        </div>
      </div>
      <ClaimsActions enabled={claimsEnabled()} queued={queuedClaims} />
      <Link href="/bokhald/solukerfi/krofur" className="inline-block mt-3 px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">Opna kröfulista →</Link>
      <p className="mt-3 text-[11px] text-gray-400">„Senda kröfur“ stofnar kröfur í Kröfupotti Arion/RB; „Sækja greiðslur“ les greiðsluskrá og bókar innborganir (Debet ráðstöfunarreikningur / Kredit 7600), sem jafnar viðskiptakröfuna.</p>
    </div>
  );

  // ── Bankayfirlit ─────────────────────────────────────────────────────────────
  const bankayfirlit = (
    <div className="max-w-4xl space-y-3">
      <ArionStatement bankAccounts={bankAccounts} defaultBank={settings.default_bank_ledger ?? undefined} contraIn={settings.statement_contra_in ?? undefined} contraOut={settings.statement_contra_out ?? undefined} sandbox={st.sandbox} serverReady={st.readyPsd2} />
      <p className="text-xs text-gray-500">Handvirk bankaafstemming (án PSD2) er einnig til: <Link href="/bokhald/afstemming/banki" className="text-red-700 hover:underline">Afstemming → Banki</Link>.</p>
    </div>
  );

  // ── Ógreiddir reikningar ─────────────────────────────────────────────────────
  const ogreiddir = (
    <div className="max-w-4xl space-y-4">
      <BankBills bills={bankBills} configured={b2b.configured} payReady={paymentsStatus().configured}
        bankAccounts={bankAccounts} defaultBank={settings.default_bank_ledger ?? undefined} />
      <Payables payables={payables} bankAccounts={bankAccounts} defaultBank={settings.default_bank_ledger ?? undefined} sandbox={st.sandbox} psd2Ready={st.readyPsd2} />
      <p className="text-xs text-gray-500">Heildarstaða lánardrottna per birgja: <Link href="/bokhald/afstemming/lanadrottnar" className="text-red-700 hover:underline">Afstemming → Lánardrottnar</Link>.</p>
    </div>
  );

  // ── Kreditkort ───────────────────────────────────────────────────────────────
  const kreditkort = <div className="max-w-3xl"><ArionCards defaultLiability={settings.card_liability_account} defaultExpense={settings.card_expense_account ?? undefined} sandbox={st.sandbox} serverReady={st.readyCards} /></div>;

  // ── Samstillingar ────────────────────────────────────────────────────────────
  const samstillingar = (
    <BankSettings
      settings={settings}
      accounts={postableAccounts}
      envStatus={{ sandbox: st.sandbox, baseUrl: st.baseUrl, hasCards: st.have.subscriptionKey, hasPsd2: st.have.psd2Key }}
    />
  );

  const tabs: BankTab[] = [
    { key: "tengingar", label: "Tengingar", icon: "🔌", node: tengingar },
    { key: "bankareikningar", label: "Bankareikningar", icon: "🏦", node: bankareikningar },
    { key: "innheimtuthjonustur", label: "Innheimtuþjónustur", icon: "🧾", node: innheimtuThjonustur },
    { key: "innheimtukrofur", label: "Innheimtukröfur", icon: "📨", node: innheimtukrofur, badge: openClaims.length },
    { key: "bankayfirlit", label: "Bankayfirlit", icon: "📑", node: bankayfirlit },
    { key: "kreditkort", label: "Kreditkort", icon: "💳", node: kreditkort },
    { key: "ogreiddir", label: "Ógreiddir reikningar", icon: "💸", node: ogreiddir, badge: payables.length + bankBills.length },
    { key: "samstillingar", label: "Samstillingar", icon: "⚙️", node: samstillingar },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">🏛️ Bankatengingar</h1>
      <p className="text-sm text-gray-500 mb-6">Stjórna bankatengingum, kortum og innheimtukröfum</p>
      <BankatengingTabs tabs={tabs} />
    </div>
  );
}
