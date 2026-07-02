# Arion — innheimtu-póstur (afslappað drög)

Sendist á tengiliðinn hjá Arion (t.d. Kristján Theodór sem gaf okkur tæknilýsinguna).

---

**Efni:** Innheimta hjá Hlíðarkaup

Sæll Kristján,

Vona að allt sé gott hjá þér. Við hjá Hlíðarkaup erum búnir að smíða okkar eigið bókhaldskerfi og langar að koma innheimtu (kröfum/greiðsluseðlum) í gang.

Gætirðu kíkt á tvennt fyrir okkur?

1. Innheimtusamning + kröfusnið og ráðstöfunarreikning, svo við komumst inn í kröfupottinn.
2. Nákvæmt snið á Claims REST API-inu — bara body/svar fyrir kröfustofnun (POST /claims) og greiðsluskrána — svo við séum með réttu reitina. Og er Claims-sandkassinn kominn í loftið, eða prófum við beint í raun?

Takk kærlega,
Fannar – Hlíðarkaup

---

## Fyrir okkur (eftir svarið)
Kröfusnið → Innheimtuþjónustur-flipinn. Body/svar-snið → berum saman við `createArionClaim` (varið með `ARION_CLAIMS_API_PATH` + varfærinni þáttun). Sér-áskriftarlykill → `ARION_CLAIMS_SUBSCRIPTION_KEY`. Svo `ARION_CLAIMS_ENABLED=true`.
