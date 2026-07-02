# Arion bankatenging — onboarding

Það sem þarf til að tengja bókhaldskerfið við Arion (B2B/Business API). Þegar þessu
er lokið fyllir þú út `ARION_*` breyturnar í `.env.local` og prófar tenginguna á
**Bókhald → Stjórnun → Bankatenging → „Prófa tengingu“**.

## Gátlisti

1. **Þróunargátt Arion — [developer.arionbanki.is](https://developer.arionbanki.is)** — skráðu þig og fáðu
   **áskriftarlykil (API subscription key)** fyrir þær REST-þjónustur sem á að nota (Claims, Cards).
   Framleiðslu-auðkenning (skref fyrir skref): https://arionbanki.gitbook.io/arion-banki/business-apis/authentication/production
   → `ARION_SUBSCRIPTION_KEY`.
2. **Búnaðarskilríki** — sæktu **fyrirtækjaskilríki** (`.pfx`, PKCS#12) frá **Auðkenni**:
   https://www.audkenni.is/upplysingar/fyrirtaekjaskilriki/um-bunadarskilriki  (kostar ~44.800 kr/ár).
   Settu skrána á þjóninn (t.d. `/etc/hlidarkaup/arion.pfx`, læst skrá, eingöngu lesanleg af þjónustunni).
   → `ARION_CERT_PATH` = slóðin, `ARION_CERT_PASSWORD` = lykilorð skilríkis.
   **Sama skilríki gildir fyrir REST (Claims/Cards) OG SOAP (hreyfingaryfirlit/millifærslur)** — staðfest af Arion.
3. **Sérstakur netbankanotandi** — stofnaðu nýjan netbankanotanda í Arion netbanka með
   **takmarkaðan aðgang** að aðeins þeim reikningum/vörum sem þjónustan þarf (ekki aðaleiganda­
   aðgang). → `ARION_USERNAME` / `ARION_PASSWORD` (notandanafn = client_id, lykilorð = client_secret).
4. **„Go Live“** — kláraðu Go-Live ferlið í þróunargáttinni (hlaða upp skilríki) fyrir
   raunumhverfi. Fyrir prófanir má nota sandkassa (`ARION_SANDBOX=true` + sandkassa-slóðir).
5. **Fylla `.env.local`** á þjóninum og **endurræsa** appið. Prófaðu svo tenginguna í UI.

## Þjónustur og staða

| Þjónusta | Tegund | Notkun í kerfinu | Staða |
|---|---|---|---|
| Innheimtukröfur (Claims) | REST | Kröfur — gefa út greiðsluseðla, fylgjast með greiðslu | REST tilbúin · **sandkassi væntanlegur haust 2026** |
| Kreditkortahreyfingar (Cards) | REST | Afstemming á kortafærslum (lykill 7716) | REST tilbúin · **sandkassi til NÚNA** |
| Hreyfingaryfirlit reikninga | SOAP | Bankaafstemming (sjálfvirk innlesning) | SOAP — ekkert sérstakt að virkja, sama skilríki · REST á næsta ári |
| Útgreiðslur/millifærslur | SOAP | Greiða birgjum úr Innkaupum (9300) | SOAP — ekkert sérstakt að virkja, sama skilríki · REST á næsta ári |

Auðkenning REST-þjónusta: OAuth2 `client_credentials` yfir **mTLS** með búnaðarskilríki.
Token-slóð: `https://apigw.arionbanki.is/oauth/v2/oauth-token`. API-slóð: `https://apigw.arionbanki.is/{claims,cards}`.
**SOAP** (hreyfingaryfirlit + millifærslur): þarf **engan sérstakan aðgang** — skjölun á https://ws.b2b.is/services/, sama búnaðarskilríki og REST.

---

## Svör frá Arion (Kristján Theodór, 2026-06-23)

Staðfest af Arion:
- **REST-þjónustur (Claims, Cards):** skráning í gegnum **developer.arionbanki.is**.
  Auðkenning í raunumhverfi: https://arionbanki.gitbook.io/arion-banki/business-apis/authentication/production
- **Búnaðarskilríki:** sótt hjá **Auðkenni** — https://www.audkenni.is/upplysingar/fyrirtaekjaskilriki/um-bunadarskilriki
- **SOAP:** þarf **engan sérstakan aðgang**; nánari upplýsingar á https://ws.b2b.is/services/
- **Sandkassi:** til fyrir **Cards núna**; sandkassi fyrir **Claims væntanlegur haust 2026**.
- **Hreyfingaryfirlit:** þarf **ekkert sérstakt að virkja** — **sama búnaðarskilríki** og aðrar þjónustur.

## Næstu skref (þegar tekin er ákvörðun um að halda áfram)
1. Sækja fyrirtækjaskilríki hjá Auðkenni (~44.800 kr/ár) — **bíður ákvörðunar**.
2. Skrá sig á developer.arionbanki.is og fá áskriftarlykil fyrir Cards (+ Claims þegar sandkassi opnar).
3. Stofna sérstakan netbankanotanda með takmarkaðan aðgang.
4. **Byrja á Cards** (sandkassi til núna) til að prófa mTLS-tenginguna; Claims þegar sandkassi opnar í haust.
5. Fylla `ARION_*` í `.env.local`, endurræsa, prófa á Bókhald → Stjórnun → Bankatenging.
