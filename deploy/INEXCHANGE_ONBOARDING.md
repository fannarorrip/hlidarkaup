# inExchange (rafrænir reikningar) — tenging

inExchange afhendir reikninga á íslensku **TS-236 / UBL** sniði um **SOAP-vefþjónustu**.
Kerfið sækir **aðsenda** reikninga inn í **Bókhald → Skráning → Pósthólf** sem drög
(forbókuð vörukaup + innskattur, lánadrottnar í kredit) til yfirferðar og samþykktar —
sömu leið og reikningar úr tölvupósti. *(Áður fóru þeir í Móttöku; nú fara þeir allir í Skráningu.)*
Kerfið getur líka **sent** sölureikninga rafrænt til viðskiptamanna sem merktir eru „rafræn viðskipti".

## Vefþjónustur (frá inExchange)
- **Móttaka reikninga** (það sem við notum): `https://ws.inexchange.is/OutgoingInvoices/sksk.asmx`
  Aðgerðir: `GetTransactionList` (listi nýrra) → `GetTransaction` (sækja `payload` = TS-236/UBL) → `UpdateTransactionStatus` (kvitta). `Ping` prófar tengingu (engin auðkenning). **Staðfest virkt** — Ping skilar „Success".
- **Senda reikninga** (útfært, sjá að neðan): `https://ws.inexchange.is/InvoiceService/InExchange.InvoiceService.InvoiceService.svc` — aðferðir `HelloWorld`, `IsRecipient` (athuga hvort kennitala er móttakandi), `InvoiceToInExchange` (Username, Password, Subaccount, Filename, Invoice=base64). Auðkenning = sömu Username/Password og móttaka (staðfest virkt). Prófunarþjónn `ws-test.inexchange.is` svarar EKKI hjá okkur → engin sandkassi, allar sendingar eru raunverulegar/gjaldfærðar.
- Tækniforskrift: **IST TS-236:2021** (stadlar.is).

## Uppsetning (til að virkja sjálfvirka sókn)
1. **Lykilorð:** opnaðu einnota-hlekkinn frá inExchange (notandi `ws_6507250420`), afritaðu lykilorðið og settu í `.env.local` → `INEXCHANGE_PASSWORD`. *(Ekki láta annan opna hlekkinn — hann virkar einu sinni.)*
2. `.env.local` (þegar stillt nema lykilorð):
   - `INEXCHANGE_RECEIVE_URL=https://ws.inexchange.is/OutgoingInvoices/sksk.asmx`
   - `INEXCHANGE_USERNAME=ws_6507250420`  ·  `INEXCHANGE_RECEIVER_ID=6507250420`
   - `INEXCHANGE_PASSWORD=` ← **fylltu inn**
   - `INEXCHANGE_STANDARD=` (tómt = öll snið; e.t.v. `TS236`)  ·  `INEXCHANGE_TRANSACTION_TYPE=` (tómt = allt; e.t.v. `invoice`)
   - `INEXCHANGE_ACK_STATUS=` (staða til að kvitta fyrir sóttan reikning — **staðfestu rétt gildi hjá inExchange**; tómt = kvitta ekki, tvítekning varin af UUID)
3. Endurræstu appið. Sókn: **Móttaka → „Sækja frá inExchange"** (eða `POST /api/inexchange/poll`); síðar cron á Proxmox eins og email-poll.

## Flæði — MÓTTAKA (útfært)
`inexchangePoll()` (lib/inexchange.ts): `GetTransactionList` → fyrir hvert nýtt UUID (ekki þegar í `acc.email_invoices` með `message_id = inexchange:<uuid>`) → `GetTransaction` → `payload` lesið (TS-236/UBL gegnum `lib/peppol.ts`) → **Skráningardrög í Pósthólf** (`createSkraningDraftFromParsed`, lib/einvoice-inbound.ts) → ef `INEXCHANGE_ACK_STATUS` er sett, `UpdateTransactionStatus`. Sótt með hnappnum **„Sækja frá inExchange"** í Pósthólfi (eða `POST /api/inexchange/poll`). Webhook-leiðin (`/api/inexchange/webhook`) skilar líka Skráningardrögum.

## Flæði — SENDING (útfært, sjálfgefið ÓVIRKT)
Merktu viðskiptamann **„rafræn viðskipti"** í Viðskiptamannalista/Viðskiptamenn (krefst kennitölu). Þegar reikningssala (á reikning) er bókuð á slíkan viðskiptamann er sjálfkrafa búinn til UBL-reikningur (`lib/einvoice-ubl.ts`) og hann settur í **rafrænt pósthólf** (`acc.einvoice_outbox`, staða `queued`). Sending er **læst** þar til `INEXCHANGE_SEND_ENABLED=true`. Þegar virkt: sjálfvirk sending við bókun + handvirkur **„Senda"** hnappur á Reikningum (`/api/einvoice/[voucherId]/send`). **Engin prófunarsending gerð — fyrsta raunsending er á ábyrgð notanda** (mælt með sjálfssendingu Hlíðarkaup→Hlíðarkaup fyrst). Stillingar: `INEXCHANGE_SEND_URL`, `INEXCHANGE_SUBACCOUNT` (e.t.v. `toinex/prod/...`), `INEXCHANGE_SEND_ENABLED`.

## Eftir að lykilorð er komið — sannreyna
- Tengipróf án lykilorðs: Ping skilar nú þegar „Success".
- Með lykilorði: `GetTransactionList` skilar UUID-lista; staðfestu hvort `lines` séu hrein UUID (gæti þurft að aðlaga ef þau eru samsett strengur).
- Sannreyndu fyrsta raunreikning: rétt birgi (kennitala), línur/magn/GTIN, og að `payload`-sniðið (TS-236) lesist rétt í `lib/peppol.ts` (gæti þurft minniháttar aðlögun frá hreinu UBL).

## Webhook (valkvætt)
inExchange/milliliður má einnig POST-a UBL beint á `POST /api/inexchange/webhook` með haus `x-inexchange-secret: <INEXCHANGE_WEBHOOK_SECRET>`.
