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

## Hýsing: Windows kassatölvan (Volcora-kassinn)
Bridge keyrir **ekki á Rocky Linux** (þarf .NET Framework + Windows cert store). Setjið hann upp á
**alltaf-á Windows-vél** — kassatölvan (Volcora) hentar (sama LAN, 192.168.1.x, alltaf í gangi).

### Uppsetning (á kassatölvunni)
1. Sækið **B2B Bridge** frá Arion: `https://ws.b2b.is/Services/` (B2BBridge-*.zip).
2. Setjið upp forsendur: **.NET Framework** + **IIS/WAS** (eða keyrið meðfylgjandi hýsil).
3. Flytjið **búnaðarskilríkið** (`.pfx`, sama og Arion Claims notar) inn í Windows-skilríkjageymslu
   (`LocalMachine\My`) og veitið app-pool/þjónustunni aðgang að einkalyklinum.
4. Stillið Bridge á `BillService` með skilríkinu og opnið **ClearUsernameBinding**-endapunkt
   staðbundið, t.d. `http://<kassa-ip>:8080/BillService.svc` (verður að vera náanlegt frá Rocky yfir LAN).
5. **Fyrsta `GetBills`-kall skilar villu 1000** → hringið/​tölvupóstur á fyrirtækjaþjónustu Arion
   (fyrirtaeki@arionbanki.is) og biðjið um að **virkja skilríkið fyrir `BillService`/B2B** fyrir
   notanda **HLIDARKAUP** (einskiptis). ⇒ **Bæta við Arion-símtalið mánudag 13. júlí** (sama og inExchange).

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
