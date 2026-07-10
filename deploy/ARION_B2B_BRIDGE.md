# Arion / RB B2B — Ógreiddar kröfur Á OKKUR (BillService) um B2B Bridge

Sýnir kröfur og greiðsluseðla sem **aðrir stofna á Hlíðarkaup í bankanum** (við sem **greiðandi**) —
þ.e. „það sem við eigum eftir að borga". Birtist í **Bókhald → Bankatengingar → 💸 Ógreiddir reikningar →
„Kröfur á okkur (frá banka)"**. Sótt beint úr Arion/RB með `GetBills`.

## Af hverju Bridge (og ekki bein tenging)
`BillService` (`https://ws.b2b.is/Statements/20130201/BillService.svc`) notar **WCF SymmetricBinding**
(dulkóðun á skeytastigi með búnaðarskilríki). Það er ekki hægt að handsmíða áreiðanlega í Node/Rocky.
**B2B Bridge** frá Arion (.NET/WAS forrit) tekur við einfaldri **ClearUsernameBinding** (bert
`UsernameToken`, engin dulkóðun) á localhost/LAN og sér sjálft um WCF-dulkóðunina út í bankann.
Appið → Bridge (Node getur talað við hann) → Arion.

## ✅ UPPSETT OG VIRKT (2026-07-10, dev-vélin) — flutningur á kassatölvuna eftir

Brúin er uppsett og **sótti 4 alvöru kröfur úr bankanum í fyrstu tilraun** (KS, Regla,
Ríkissjóðsinnheimtur, Auðkenni). Skilríkið var ÞEGAR virkt hjá Arion (engin villa 1000).
Uppsetningin sem VIRKAR (endurtaka á kassatölvunni fyrir framleiðslu):

### Skref sem virkuðu (staðfest)
1. Sótt `B2BBridge-1.0.3.0.zip` frá `https://ws.b2b.is/Services/` → afpakkað í `C:\Arion\B2BBridge\`.
2. **Ekkert IIS þarf** — notum `bin\B2B-Bridge-WasHost.exe` (sjálfstæður hýsill, console).
3. **Skilríki inn í CurrentUser\My** (sami notandi keyrir brúna; ekkert admin þarf):
   - Búnaðarskilríkið (.pfx af `ARION_CERT_PATH` + lykilorð) → `Import-PfxCertificate` í `Cert:\CurrentUser\My`.
   - **Núverandi public skilríki Arion** — EKKI nota .cer úr zip (útrunnin 2014!) heldur draga það
     út úr lifandi WSDL (`AccountService.svc?wsdl` → `<X509Certificate>` base64) → `Import-Certificate`.
4. **Config skrifað beint** í `bin\B2B-Bridge-WasHost.exe.config` (GUI-tólið óþarft):
   - `clientCertificate` = búnaðarskilríkið **FindByThumbprint** (CurrentUser\My),
   - `serviceCertificate/defaultCertificate` = Arion-skilríkið FindByThumbprint (CurrentUser\My),
   - **client-endapunktarnir þrír endurbeindir á 2013-þjónusturnar** með `SecureTransportAndMessage`
     bindingunni (sem fylgir í pakkanum): StatementService→`/Statements/20131015/AccountService.svc`,
     PaymentService→`/Payments/20131015/PaymentService.svc`, ClaimService→`/Statements/20130201/BillService.svc`.
     (Sjálfgefna configið vísar á 2005-þjónusturnar — brúin er samningsóháð beinir og virkar á 2013 líka.)
5. **Einskiptis admin-skref** (UAC): `netsh http add urlacl url=http://+:8025/B2BBridge/ user=<notandi>`
   og `netsh http add urlacl url=https://+:8026/B2BBridge/ user=<notandi>` + self-signed cert á 8026:
   `New-SelfSignedCertificate -DnsName localhost -CertStoreLocation Cert:\LocalMachine\My` →
   `netsh http add sslcert ipport=0.0.0.0:8026 certhash=<þumalfar> appid={7f31a2c3-9b4d-4e5f-8a61-0d2c3b4a5e6f}`
   (hýsillinn HEIMTAR https-grunninn þótt hann sé ónotaður).
6. Ræsa: `C:\Arion\start-bridge.cmd` (eða `bin\B2B-Bridge-WasHost.exe` beint). Hlustar á
   `http://localhost:8025/B2BBridge/{StatementService|PaymentService|ClaimService}` — **ATH: EKKERT `.svc`!**

### Prótókoll-atriði sem skipta máli
- Brúin talar **SOAP 1.1** við okkur (`ClearUsernameBinding`, `text/xml` + `SOAPAction`-haus) —
  SOAP 1.2 fær HTTP 415. Hún breytir sjálf í SOAP 1.2 upp í bankann. (lib-in senda nú 1.1.)
- Auðkenning = venjulegt `UsernameToken` (netbanka B2B-notandinn) í `wsse:Security` haus.
- Villa 1000 kom ALDREI — skilríkið var þegar virkjað B2B-megin hjá Arion.

### ⚠️ Yfirlit (GetAccountStatement) — strandar á GÖMLU brúnni, ekki bankanum
Wire-log (2026-07-10) sannaði: fyrirspurnin fer út (undirrituð), **bankinn SVARAR með alvöru
GetAccountStatementResponse**, en brúin (útgáfa 1.0.3.0 frá 2017) hafnar svarinu
("Body...was not encrypted") — 20131015-þjónusturnar undirrita svörin en dulkóða þau EKKI, og
innri pípa brúarinnar krefst dulkóðunar (framhjá öllum config-leiðum: endpoint-behavior,
contract ProtectionLevel og eigin binding-element voru öll hunsuð — brúin smíðar rásina sjálf).
**Lausnir í forgangsröð:**
1. **Biðja Arion um NÝJUSTU B2B-brúna** (handbókin: Fyrirtækjaþjónusta sendir pakkann; opinbera
   zip-skráin er frá 2017 og nýrri útgáfa styður væntanlega 20131015-svörin). ⇒ mánudagslistinn.
2. Plan B: eigin lítill .NET-proxy með TÝPUÐUM samningi merktum `ProtectionLevel.Sign`
   (bankinn samþykkir sign-only fyrirspurnir — sannað á vír) með bindingu Arion úr
   `SampleClients-3.4.0.0.zip` (`WcfSecurityHelper.GetSchema20131015MutualCertificateBinding`).
3. Greiðslur (DoPayment, sama 20131015-fjölskylda) stranda á því sama — sama lausn gildir.

Öryggisuppskriftin fyrir 20131015 er annars LEYST: asymmetric + thumbprint-tilvísanir +
engir derived keys + SignBeforeEncrypt + WSS11/Trust13/SP12. `HK.ProtectionLevel.dll`
(þýtt úr sample-kóða Arion) situr áfram í bin/ + config — skaðlaust.

> ⚠️ **AV-varnaður:** ekki „reflecta" yfir DLL-skrár Bridge með PowerShell — það vakti Windows Defender
> (ML-falskt jákvætt á *skriftuna*, ekki bankaskrárnar). Keyrið Bridge sem venjulega þjónustu; lesið
> WSDL/docs frekar en að skoða DLL-a með reflection.

## Umhverfisbreytur (Rocky `.env.local`)
```
ARION_B2B_BRIDGE_URL=http://192.168.1.NN:8080/BillService.svc   # ClearUsernameBinding endapunktur Bridge
ARION_B2B_USERNAME=                # sjálfgefið = ARION_USERNAME (B2B notandi)
ARION_B2B_PASSWORD=                # sjálfgefið = ARION_PASSWORD
ARION_B2B_PAYOR_ID=6507250420      # okkar kt (sjálfgefið = ARION_PSU_ID)
```
Aðeins `ARION_B2B_BRIDGE_URL` er skylda til að kveikja (hitt fellur á Arion-breyturnar). Þegar
`configured=true` verður hnappurinn **„Sækja kröfur frá banka"** virkur.

## Samningsatriði (staðfest úr WSDL)
- Namespace `http://schemas.b2b.is/Bills/2013/02/01/BillService`, **SOAP 1.2**.
- `GetBills` (engin inntök) → `GetBillsResponse/GetBillsResult` = `ArrayOfBillInfo`.
- `BillInfo{ Bank, Ledger, Number, DueDate, Identifier, Description, FinalDueDate, AmountDue,
  MinimumAmount, ClaimantId, PayorId, ClaimType, BillType, IsDebited, IsForwardPayment,
  IsSettlementFee, IsDeposit, IsInElectronicDocuments, Details, IsHidden }`.
- Aðrar aðgerðir til síðar: `GetBillDetails`, `GetBillsInDirectDebit`, `GetHiddenBills`, `UnHideBill`,
  `CancelOptionalClaim`, `GetForwardedBills`, `GetOptionalBills`, `GetSpecifiedBills`.

## Þrjár þjónustur um SÖMU Bridge (Arion staðfesti 2026-07-10: yfirlit + greiðslur = B2B SOAP)

Bridge á að spegla allar þrjár — hver fær sinn staðbundinn endapunkt og sína env-breytu:

| Þjónusta | Raun-endapunktur (upstream) | Env-breyta |
|---|---|---|
| **Kröfur á okkur** (`GetBills`) | `https://ws.b2b.is/Statements/20130201/BillService.svc` | `ARION_B2B_BRIDGE_URL` |
| **Hreyfingaryfirlit** (`GetAccountStatement`) | `https://ws.b2b.is/Statements/20131015/AccountService.svc` | `ARION_B2B_ACCOUNTS_URL` |
| **Greiðslur** (`DoPayment`/`DoPayments`) | `https://ws.b2b.is/Payments/20131015/PaymentService.svc` | `ARION_B2B_PAYMENTS_URL` + `ARION_B2B_DEBIT_ACCOUNT` (12 stafa útgreiðslureikningur) |

**ATH útgáfunúmerin**: yfirlit + greiðslur eru `20131015` (namespace-fjölskylda
`http://IcelandicOnlineBanking/2013/10/15/*`), EKKI `20130201` eins og BillService.
Einnig til: `/Statements/20130101/AccountService.svc` (reikningaLISTI: GetAccounts/VerifyAccount)
og **prófunarumhverfi** á `ws-test.b2b.is` (sömu slóðir) — nota það fyrst fyrir greiðslur!

### Greiðslur — mikilvægt
- `DoPayment` með `Claim` borgar **kröfu að fullu** (`IsDeposit=false`) — bankinn getur bætt við
  kostnaði/dráttarvöxtum svo **úttektin getur orðið HÆRRI en beðið var um**; kerfið bókar skv.
  skilaðri upphæð.
- **STP („straight through")**: án þess að Arion merki B2B-notandann sem beinvinnslunotanda
  stoppar hver greiðsla sem `NotConfirmed` í netbankanum og bíður handvirkrar staðfestingar.
  ⇒ **Biðja Arion um STP á mánudagssímtalinu** (corporate@arionbanki.is).
- Bankinn **hafnar tveimur eins greiðslum sama dag** milli sömu reikninga (engin idempotency-lykill
  til) — kerfið túlkar þá villu sem „þegar greitt".

### Kóði (allt smíðað, bíður Bridge)
- `lib/arion-b2b-accounts.ts` — `getAccountStatement()` (hreyfingar + staða/IBAN).
- `lib/arion-b2b-payments.ts` — `payClaim()` (DoPayment/Claim, RAUNGREIÐSLA).
- `app/api/bankatenging/b2b-statement/route.ts` — POST sækir yfirlit.
- `app/api/bankatenging/bank-bills/[id]/pay/route.ts` — borgar kröfu + bókar
  (Dr lánadrottinn / Kr banki á skilaðri upphæð; `paid_unbooked` ef bókun klikkar eftir greiðslu).
- UI: „Borga"-hnappur á hverri kröfu í Ógreiddir reikningar (virkjast með `ARION_B2B_PAYMENTS_URL`).

## Kóði (þegar smíðað — bíður aðeins Bridge)
- `lib/arion-b2b.ts` — `getBills()` (SOAP 1.2 → Bridge, `UsernameToken`), `upsertBankBills()`
  (uppfærir `acc.bank_bills`, tengir lánadrottin eftir kt, merkir horfnar kröfur `gone`), `listOpenBankBills()`.
- `app/api/bankatenging/bank-bills/route.ts` — `GET` listi, `POST {action:'fetch'}` sækir úr banka.
- `db/accounting/480_bank_bills.sql` — `acc.bank_bills` (BillKey-lyklað).
- UI: `app/bokhald/bankatenging/BankBills.tsx` í Ógreiddir-reikningar flipanum.

## Prófun þegar Bridge er komin
1. Stillið `ARION_B2B_BRIDGE_URL`, endurræsið appið.
2. Ógreiddir reikningar → „Sækja kröfur frá banka" → listinn fyllist (eða skýr villa ef 1000/óvirkt skilríki).
3. Staðfestið upphæðir/gjalddaga gegn netbankanum.

## Næstu skref (eftir að sýnir kröfur)
- **Greiðsla**: tengja „Merkja greitt"/greiðslu (PSD2 eða handvirkt) sem bókar Dr lánadrottinn / Kr banki,
  á sömu leið og `settlePayable` í `lib/payables.ts`.
- Samstilling við `acc.payables` (sama krafa gæti verið bæði bókuð AP og bankakrafa) — para eftir kt+upphæð.
