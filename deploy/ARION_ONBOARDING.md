# Arion bankatenging — onboarding og go-live

Það sem þarf til að tengja bókhaldskerfið við Arion. Þegar þessu er lokið fyllir þú út
`ARION_*` breyturnar í `.env.local` (sjá **.env.example** — allar breytur skjalfestar þar)
og prófar á **Bókhald → Stjórnun → Bankatenging**.

Kerfið notar **þrjár aðskildar API-vörur** í þróunargáttinni — hver með SÍNUM áskriftarlykli:

| Vara | Notkun í kerfinu | Env-lykill |
|---|---|---|
| **Cards** (REST) | Kortafærslur + bókun (Kreditkort-flipi) | `ARION_SUBSCRIPTION_KEY` |
| **PSD2 — Accounts & Payments** (REST) | Reikningar/samþykki, bankayfirlit → bókhald, greiðslur á birgja | `ARION_PSD2_SUBSCRIPTION_KEY` |
| **Claims** (REST) | Innheimtukröfur (greiðsluseðlar) + greiðsluskrá | `ARION_CLAIMS_SUBSCRIPTION_KEY` |

Auðkenning (öll REST): OAuth2 `client_credentials` yfir **mTLS** með búnaðarskilríki.
Sandkassi: `ARION_SANDBOX=true` + „Generate Token“ úr gáttinni (`ARION_ACCESS_TOKEN` — virkar EKKI í framleiðslu).

## Go-live gátlisti

1. **Þróunargátt** — [developer.arionbanki.is](https://developer.arionbanki.is): skráðu forritið á
   allar þrjár vörurnar og fáðu áskriftarlyklana þrjá. **Endurnýjaðu sandkassa-lyklana** sem
   notaðir voru í prófunum (þeir sáust í skjámyndum).
2. **Búnaðarskilríki** — fyrirtækjaskilríki (`.pfx`) frá [Auðkenni](https://www.audkenni.is/upplysingar/fyrirtaekjaskilriki/um-bunadarskilriki) (~44.800 kr/ár).
   Á þjóninum UTAN við repo-ið (t.d. `/etc/hlidarkaup/arion.pfx`) → `ARION_CERT_PATH` + `ARION_CERT_PASSWORD`.
3. **Sérstakur netbankanotandi** með takmarkaðan aðgang (ekki aðaleigandi!) →
   `ARION_USERNAME`/`ARION_PASSWORD` (client_id/client_secret) og kennitala hans → `ARION_PSU_ID`.
4. **SCA redirect-slóð** — láttu Arion skrá `https://<framleiðslu-lén>/bokhald/bankatenging` →
   `ARION_REDIRECT_URI`. Án hennar neitar kerfið að búa til samþykki/greiðslur í framleiðslu.
5. **PSD2 greiðslur** — biddu um **openbanking.readwrite** scope og **staðfestu ISK-greiðsluvöruna**
   (sjálfgefið `sepa-credit-transfers` er ágiskun → `ARION_PAYMENT_PRODUCT`).
6. **Innheimta (Claims)** — undirritaðu **innheimtusamning**, fáðu **kröfusnið + ráðstöfunarreikning**
   (skráð í Innheimtuþjónustur-flipann) og **staðfestu API-sniðið** (body/svar — sjá
   `deploy/ARION_CLAIMS_EMAIL.md`). Svo fyrst `ARION_CLAIMS_ENABLED=true`.
7. **„Go Live“** í gáttinni (hlaða upp skilríki), fylla `.env.local`, fjarlægja
   `ARION_SANDBOX`/`ARION_ACCESS_TOKEN`, endurræsa.
8. **Prófun með lágum upphæðum**: sækja kort → eitt samþykki + SCA → sækja yfirlit →
   greiða einn lítinn reikning → senda eina prufu-kröfu.

## Svör frá Arion (Kristján Theodór, 2026-06-23)

- **REST-þjónustur:** skráning í gegnum **developer.arionbanki.is**.
  Framleiðslu-auðkenning: https://arionbanki.gitbook.io/arion-banki/business-apis/authentication/production
- **Búnaðarskilríki:** frá Auðkenni; sama skilríki gildir fyrir allar þjónustur.
- **Sandkassi:** Cards til núna; **Claims-sandkassi væntanlegur haust 2026**.
- **SOAP** (eldri hreyfingaryfirlit/millifærslur á ws.b2b.is): þarf engan sérstakan aðgang —
  kerfið notar hins vegar **PSD2 REST** fyrir yfirlit og greiðslur, ekki SOAP.

## Svör frá Arion (Kristján, 2026-07-05) — Claims

- **Innheimtusamningur + kröfusnið:** gengið frá í **netbankanum** (fyrirtækjabanki); ef það
  gengur ekki → fyrirtækjaþjónustan, fyrirtaeki@arionbanki.is.
- **Opinber Claims API-skjölun (request/response á öllum endapunktum):**
  https://arionbanki.gitbook.io/arion-banki/business-apis/claims-api/claims-api-refererence
  Kóðinn (lib/arion.ts createArionClaim) fylgir nú þessari skjölun: claimKey =
  { claimantId (kt), account (4 stafa útibú + '66' + 6 stafa kröfunúmer), dueDate },
  payorId, templateCode (kröfusnið), amount, finalDueDate + expirationDate (SKYLDA),
  X-Idempotency-Key. Svar: { success: { claimId } } / { error: { resultCode } };
  CLAIM_EXISTS er meðhöndlað sem árangur (endursending eftir hrun).
- **Claims-sandkassi er EKKI klár — væntanlegur haust 2026.** Þar til: ARION_CLAIMS_ENABLED
  helst af; fyrsta prófun verður varfærin framleiðsluprófun (ein lítil krafa á eigin kt).
- **Kröfustillingar sem þarf að fylla út áður en kröfur virka** (acc.collection_settings):
  kennitala_krofuhafa, claim_bank (4 stafa útibú úr innheimtusamningnum), final_due_days,
  expires_after_days — og kröfusnið (templateCode) í collection_profiles.code.
- **Óstaðfest þar til sandkassi opnar:** greiðsluskrár-endapunkturinn
  (GET /claims/{id}/transactions) — skjalaði kosturinn er GET /claims?status=Paid.

## Ákvörðun (2026-07-05): PSD2 er EKKI leiðin í framleiðslu

- Arion-skjölunin: PSD2 er „restricted to payment service providers regulated by the financial
  supervision of the Central Bank of Iceland" — þ.e. aðeins eftirlitsskyldir aðilar með
  QWAC/eIDAS-skilríki (krefst AISP/PISP-skráningar hjá Seðlabankanum). Á EKKI við um okkur og
  verður ekki sótt um.
- Framleiðsluleiðin okkar er fyrirtækjaleiðin með búnaðarskilríki: Cards + Claims + Documents
  Business API (staðfest í authentication/production-skjöluninni) og B2B-rásin (SOAP ws.b2b.is,
  „þarf engan sérstakan aðgang") fyrir hreyfingayfirlit + millifærslur — B2B er á leið inn í
  Business API fjölskylduna skv. skjöluninni.
- ~~TODO: svar frá Arion um hvort yfirlit/millifærslur eigi að fara um B2B SOAP eða væntanlegt
  Accounts Business API~~ → **SVARAÐ (Arion, 2026-07-10): B2B SOAP er leiðin.**
  PSD2-kóðinn er áfram nothæfur í sandkassa til prófana en fer aldrei í framleiðslu.

## Svar frá Arion (2026-07-10) — yfirlit + greiðslur = B2B SOAP

„Annars væru þetta þjónusturnar sem ykkur vantar:"
- **Hreyfingaryfirlit** (SOAP): https://ws.b2b.is/Services/Docs/UserManual-Accounts-Schema-2013.pdf
- **Útgreiðslur/millifærslur** (SOAP): https://arionbanki.gitbook.io/arion-banki/b2b-2013-schema/b2b-services/b2b-payment-service

Báðar fara um **sömu B2B-rás og BillService** (ws.b2b.is, WCF SymmetricBinding) → sama **B2B Bridge**
á Windows-vélinni (kassatölvunni) þjónar öllum þremur. Sjá `deploy/ARION_B2B_BRIDGE.md`.
Fullur hringur þegar Bridge er komin: **sjá kröfur á okkur (BillService) → borga (PaymentService) →
sjá á yfirliti og bóka (Accounts)** — allt án PSD2.
