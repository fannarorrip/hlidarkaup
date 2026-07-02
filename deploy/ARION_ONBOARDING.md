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
