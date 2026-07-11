# Handbók — kerfin sem voru smíðuð 10.–11. júlí 2026

Hvað var smíðað, hvernig það virkar, og hvernig hlutirnir tala saman.
Allt keyrir í Hlíðarkaupskerfinu (Next.js + Postgres) — dev á þessari vél, framleiðsla á Rocky (192.168.1.70).

---

## 1. Rafrænir reikningar (inExchange)

**Hvað:** Kerfið getur sent löglega rafræna reikninga (UBL/TS-236) inn í inExchange/PEPPOL-netið og tekið á móti þeim í Pósthólfið.

**Hvernig virkar sendingin:**
1. Reikningssala á viðskiptavin merktan „rafræn viðskipti" → kerfið smíðar UBL-skjal (`lib/einvoice-ubl.ts`) og setur í `acc.einvoice_outbox`.
2. Ef `INEXCHANGE_SEND_ENABLED=true` sendist skjalið um SOAP á inExchange.
3. **MIKILVÆGT:** ReturnCode 100 = „móttekið", EKKI „samþykkt" — inExchange staðfestir skjalið eftir á og sendir höfnunarpóst ef það fellur.

**Lagað:** Skjalið uppfyllir nú allar PEPPOL BIS 3.0 reglur (BuyerReference, VSK-númer seljanda IS158053, eindagi alltaf til staðar, nákvæm línustærðfræði) — staðfest af tveimur opinberum prófunarþjónustum (EU ITB + OpenPEPPOL) með núll villur. Einnig hægt að **emaila reikning sem PDF**: `POST /api/reikningur/[id]/email`.

**Staða:** Sending er LÆST (`INEXCHANGE_SEND_ENABLED=false`) — aðgangurinn hjá inExchange fór óvart í framleiðslu og þeir eru að laga. **Símtal mánudag:** fá réttan aðgang + rétt Subaccount-gildi.

---

## 2. Kröfur og banki (Arion)

### 2a. Kröfur sem VIÐ sendum (virkar í framleiðslu)
- Reikningssala á `per_trip`-viðskiptavin → krafa fer sjálfkrafa í biðröð → send á Arion.
- **Mánaðaruppgjör** (`consolidated`): mánaðarlok búa til einn reikning + eina kröfu (kröfunúmer úr eigin runu frá 100000).
- **Sjálfvirkni:** cron kl. 8:00 sendir biðraðar-kröfur og sækir greiðslur (bókar innborganir sjálfkrafa: Debet banki / Kredit viðskiptakröfur).

### 2b. B2B-brúin (á þessari tölvu, C:\Arion\B2BBridge)
Bankinn talar fornt dulkóðunarmál (WCF) sem Node ræður ekki við. **Brúin** er þýðandi frá Arion:
```
Kerfið (Rocky) ──venjulegt SOAP──▶ Brúin (Windows-vél) ──bankadulkóðun──▶ Arion
```
- Keyrir sjálfkrafa við innskráningu (Startup: `B2BBridge.cmd`), hlustar á port 8025.
- Notar búnaðarskilríkið (sama og kröfurnar) úr Windows-skilríkjageymslunni.
- Full uppskrift í `deploy/ARION_B2B_BRIDGE.md` — sama uppsetning fer á kassatölvuna síðar.

### 2c. Kröfur Á OKKUR (Ógreiddir reikningar — virkar í framleiðslu)
**Bókhald → Bankatengingar → 💸 Ógreiddir reikningar → „Kröfur á okkur (frá banka)"**
- „Sækja kröfur frá banka" (og cron kl. 8) sækir ógreiddar kröfur þar sem við erum greiðandi — beint úr bankanum (GetBills + GetBillsInDirectDebit).
- Tveir hlutar eins og í bankaappinu: **Ógreitt** og **Greitt sjálfvirkt** (beingreiðslur).
- **Vanskil miðast við EINDAGA** (ekki gjalddaga) — rautt eftir eindaga, gult þegar ≤3 dagar.
- Tómt svar frá bankanum (næturvinnsla RB, ~19:30+) breytir ENGU í kerfinu (varið).

### 2d. Borga-hnappurinn (smíðaður, bíður banka)
Borgar kröfu að fullu úr útgreiðslureikningnum og bókar sjálfkrafa (Debet lánadrottinn / Kredit banki á RAUNupphæðinni — bankinn getur bætt kostnaði við). Bíður tveggja hluta frá Arion: **nýrri brúarútgáfu** (sú frá 2017 hafnar svörum nýrri þjónusta) og **STP/beinvinnslu-merkingar** á B2B-notandann. **Símtal mánudag.**

### 2e. Bankayfirlit (B2B í stað PSD2)
PSD2 er lagalega ófáanlegt (bara fyrir eftirlitsskyld fjártæknifyrirtæki) — flipar sem báðu um PSD2 nota nú B2B. Yfirlitssókn strandar á sömu gömlu brú (sannað á vír: bankinn SVARAR með gögnum, brúin hafnar svarinu) — leysist með nýju brúnni á mánudag.

---

## 3. Rekstrarheili gömlu búðarinnar (89 skjöl)

Skjölin úr OneDrive voru öll lesin, flokkuð (⚠️ ~70% skráarnafna lugu um innihald!) og strúktúruð inn í kerfið:

| Gögn | Magn | Hvert |
|---|---|---|
| Kostnaðarverð (m. strikamerkjum) | **732 vörur** (voru 25) | `shop.products.cost_price` |
| Pöntunarsniðmát | **36 birgjar, 2.684 línur** | `acc.order_templates` |
| Lágmarksbirgðareglur | CCEP 80 + MS 145 línur | sniðmátslínur (min/max/dagsvelta) |
| Vikuplan pantana | **67 færslur** m. símanúmerum | `acc.order_schedule` |
| Álagningarreglur | **42 reglur** | `acc.pricing_rules` |
| Flutningsreglur | 18 birgjar | bíða skráningar birgja |

Á skjáborðinu: `voruskjol-katalog-hlidarkaup.xlsx` (full skráning), `verdfravik-og-oparad.xlsx` (168 verðfrávik + 414 óparaðar vörur til yfirferðar), `adgerdalisti-gomlu-skjolin.md`.

---

## 4. 🫀 Hjartslátturinn (Innkaupapantanir)

**Sölukerfi → Innkaupapantanir**

- **„Í dag pantast"** — birgjar dagsins sem spjöld með skilafresti: rauður hnappur þegar <90 mín eftir, grár „liðið" þegar frestur er runninn. „Sjá alla vikuna" sýnir vikuna.
- **Smella á birgja** → pöntunareyðublað opnast: allar vörur hans með MAGN-reitum (forútfyllt með venjulegu magni gömlu búðarinnar), leit, samtals-áætlun. **Aðeins línur með magn > 0 fara í pöntunina.**
- **Allt breytanlegt:** bæta línu við (nafn/vnr/magn), eyða línu (×), „Vista magn sem venjulegt" (innslegið magn verður forútfyllingin næst), og dagatalið sjálft (✎ á spjaldi = breyta/eyða, ＋ = bæta birgja á dag). Birgir án lista? Smellur býr til tóman lista.
- Pöntunin verður innkaupapöntun (P-númer) í listanum fyrir neðan → send/prentuð → **Móttaka** parar hana við reikninginn sem kemur.

---

## 5. 💰 Verðverndarlykkjan (Móttaka)

Sjálfvirka „verðtékkið" sem gamla búðin gerði í höndunum:

```
Móttaka bókast → kostnaðarverð vörunnar uppfærist sjálfkrafa
                → ef verðið BREYTTIST: 💰 Verðbreytingatillaga á Móttöku-síðunni
                → þú samþykkir eða hafnar — verð breytist ALDREI sjálfkrafa
```

Tillagan reiknast með: (1) **sömu álagningu** og varan ber í dag (verð ÷ gamalt kostnaðarverð) — trúverðugast; annars (2) **álagningarreglu gömlu búðarinnar** (t.d. „Danól — franskar 1,33", „tóbak ×1,525 upp í tug +20 kr"). Nýja kostnaðarverðið sést strax í næstu pöntun.

---

## 6. 🗑️ Afskriftir

**Sölukerfi → Afskriftir** — fyrir vörur sem er hent:
1. **Skanna strikamerki** (stór reitur, skanni + Enter velur vöruna) eða leita.
2. Magn + ástæða (Útrunnið/Skemmt/Rýrnun/Annað) → **Skrá**.
3. Birgðir lækka sjálfkrafa (skráð sem 'waste'-hreyfing). × á færslu = afturkalla (birgðir hækka aftur).
4. **Kreditlisti birgja:** ókrediteraðar afskriftir safnast per birgja (Mata, Myllan, Ísfugl, Gæðabakstur kreditera) — „Merkja kreditað" þegar kreditreikningurinn berst.

Engin tvíbókun í bókhaldi: innkaup eru gjaldfærð við móttöku, svo rýrnun birtist rétt í talningum.

---

## 7. 🌡️ Kælaaflestur (HACCP)

**Sölukerfi → Kælaaflestur** — dagleg hitastigsskráning sem heilbrigðiseftirlitið krefst:
- **17 einingar gömlu búðarinnar forskráðar** (Kjötborð, Ostakælir, Mjólkurkælir, Djúpf. Vest., Emmessís/Kjörís-kistur…) með réttum mörkum (kælar 0–4°C, frystar −25…−18°C).
- Slá inn °C + Enter → grænt ✓ innan marka, **rautt + athugasemdareitur („hvað var gert?") utan marka** — það er það sem eftirlitið vill sjá.
- „X af 17 skráð í dag", 14 daga saga (rauðir reitir stinga í augun), einingar breytanlegar.
- Óskráður aflestur dagsins birtist í áminningunum (þegar byrjað er að nota síðuna).

---

## 8. 🔔 Áminningakerfið („Ekki gleyma")

**Efst á Yfirliti** — vaktar ALLT og raðar eftir áríðni (rautt = fram yfir, gult = í dag):

**Lifandi skyldur (hverfa sjálfar þegar verkið klárast):**
- Óbókuð fylgiskjöl í Pósthólfi → „EKKI GLEYMA AÐ BÓKA FÆRSLUNA"
- Óbókuð móttaka · gjaldfallnir bankareikningar (eindagi) · gjaldfallnir lánadrottnar · kröfur í biðröð · kælaaflestur óskráður

**Skiladagar skatta (reglur staðfestar á skatturinn.is):**
- **VSK**: 5. dags annars mánaðar eftir hvert tveggja mánaða tímabil (jan–feb → 5. apríl o.s.frv.). Núllskýrsla skal líka. Hverfur sjálfkrafa þegar VSK-uppgjör er bókað.
- **Staðgreiðsla + tryggingagjald**: 15. næsta mánaðar (saman). **Lífeyrir**: 10. (gjalddagi).
- **Ársreikningur**: 31. ágúst. **Skattframtal**: 31. maí.
- Helgar færast sjálfkrafa á næsta virka dag (sannreynt: VSK jan–feb 2026 → mán 6. apríl því 5. er sunnudagur).
- Launaskil birtast bara ef launakeyrsla er til fyrir mánuðinn (ekkert væl fyrir starfsfólk).

**Ritúöl:** Föstudagskjúklingur (~80 stk + forpantanir), helgarpöntun, þurrvörur á sunnudegi, jólapantanir (okt). „✓ Búið" merkir tilvikið — vikulegt ritúal birtist aftur í næstu viku.

### 🗓️ Dagatal (nýr flipi í valmyndinni)
Mánaðaryfirlit með öllum skiladögum og ritúölum + umsjón: bæta við eigin áminningum (vikulega/mánaðarlega/árlega/einu sinni, með „senda póst ef ógert" hak).

### 📧 Áminningarpósturinn
Cron kl. 9:00: EF eitthvað er fram yfir eða á að gerast Í DAG (og er merkt fyrir póst) → rauður **„⚠️ EKKI GLEYMA"** póstur á **oli@hlidarkaup.is + hlidarkaup@hlidarkaup.is** með beinum hlekkjum. Í mesta lagi einn póstur á dag; ekkert áríðandi = enginn póstur. (⚠️ Sendist frá Resend-sandkassa þar til hlidarkaup.is er staðfest hjá Resend — gæti lent í spam fyrst.)

---

## 9. 💬 Hjálparinn (neðst í hægra horni á öllum bókhaldssíðum)

Claude með VERKFÆRI — svarar ekki bara, heldur flettir upp og fylgir þér:
- **„Farðu með mig í X"** → opnar síðuna (þekkir allar 36 síður kerfisins) + ein lína um hvað gera skal þar.
- **„Hvað kostar X?"** → leitar í vörugrunninum (verð, kostnaðarverð, birgðir, birgir).
- **„Hvað seldum við í dag/í gær/í vikunni?"** → alvöru tölur úr aðalbókinni.
- **„Hverjum skuldum við?"** → bankareikningar með eindögum + lánadrottnar + útistandandi kröfur.
- **„Hvað þarf ég að muna?"** → áminningalistinn.

**Öryggisreglur:** öll verkfærin eru LESAÐGANGUR eingöngu — hjálparinn getur aldrei bókað, sent, greitt né breytt neinu. Og hann má ekki nefna tölur úr minni — hver tala kemur úr gagnagrunnsuppflettingu á staðnum.

---

## 10. Sjálfvirknin (cron á Rocky)

| Kl. | Hvað |
|---|---|
| 8:00 | Senda biðraðar-kröfur á Arion + sækja greiðslur + **sækja kröfur á okkur úr banka** |
| 9:00 | „EKKI GLEYMA"-póstur ef eitthvað áríðandi er ógert |

## 11. Uppfærsla á Rocky

```bash
sudo bash /opt/hlidarkaup/deploy/update.sh
```
(sækir kóða, keyrir gagnagrunnsbreytingar, endurræsir — allt í einu skrefi)

## 12. Ógert / bíður

- **Mánudagssímtöl:** Arion (ný B2B-brú + STP-merking + eyða prufukröfu 000010) · inExchange (laga sendiaðgang + fá Subaccount).
- **Resend:** staðfesta hlidarkaup.is svo póstar (reikningar + áminningar) lendi ekki í spam.
- **Brúin á kassatölvuna** (sama uppskrift) þegar hentar — nú keyrir hún á skrifstofuvélinni.
- **Birgjar → lánadrottnar** (verkefni #29): 66 birgjar úr Excel-listanum inn í lánadrottnakerfið — þá tengjast flutningsreglurnar (18) og kreditlistarnir sjálfkrafa.
- Yfirferð: `verdfravik-og-oparad.xlsx` á skjáborðinu (168 verðfrávik).
- Fríríkið: checkout (Straumur) + alvöru vörugögn (verkefni #22, #24).
