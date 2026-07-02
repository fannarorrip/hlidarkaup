# Sjálfvirk skráning reikninga úr tölvupósti — uppsetning (Microsoft 365)

Markmið: reikningar sem berast í pósthólf `hlidarkaup@hlidarkaup.is` eru sóttir
sjálfkrafa, lesnir með gervigreind og settir sem **drög** í Bókhald → **Pósthólf**.
Notandi yfirfer og samþykkir — ekkert bókast í höfuðbók án samþykkis.

Tengingin er **app-only (client credentials), AÐEINS lestur** (`Mail.Read`).
Kerfið breytir aldrei pósthólfinu; tvítekning er varin í gagnagrunni (`message_id`).

---

## Gátlisti

### 1. Skrá forrit í Microsoft Entra (Azure AD)
1. Entra admin center → **App registrations** → **New registration**.
   - Name: `Hlíðarkaup – Skráning reikninga`. Single tenant. Engin redirect URI þarf.
2. Afritaðu **Application (client) ID** → `MS_CLIENT_ID` og **Directory (tenant) ID** → `MS_TENANT_ID`.

### 2. Réttindi (application permission + admin consent)
1. Forritið → **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions** → bættu við **`Mail.Read`**.
   - Notaðu **Application permissions**, EKKI Delegated (þetta keyrir án innskráningar notanda).
2. Smelltu **Grant admin consent for <tenant>** (þarf stjórnanda).

### 3. ⚠️ Takmarka við EITT pósthólf (mikilvægt)
Application `Mail.Read` veitir sjálfgefið aðgang að **ÖLLUM** pósthólfum í fyrirtækinu.
Takmarkaðu það við Hlíðarkaup-pósthólfið með **Application Access Policy** í Exchange Online.

Í Exchange Online PowerShell (`Connect-ExchangeOnline`):
```powershell
# Búðu fyrst til póstvirkan öryggishóp sem inniheldur AÐEINS reikningapósthólfið:
New-DistributionGroup -Name "Skraning-Reikningar" -Type Security -Members hlidarkaup@hlidarkaup.is

New-ApplicationAccessPolicy `
  -AppId <MS_CLIENT_ID> `
  -PolicyScopeGroupId Skraning-Reikningar@hlidarkaup.is `
  -AccessRight RestrictAccess `
  -Description "Hlidarkaup skraning - adgangur adeins ad reikningaposthólfi"

# Staðfestu:
Test-ApplicationAccessPolicy -Identity hlidarkaup@hlidarkaup.is -AppId <MS_CLIENT_ID>   # AccessCheckResult = Granted
Test-ApplicationAccessPolicy -Identity einhver.annar@hlidarkaup.is -AppId <MS_CLIENT_ID> # = Denied
```

### 4. Client secret
1. Forritið → **Certificates & secrets** → **New client secret** (t.d. 24 mánuðir).
2. Afritaðu **Value** STRAX → `MS_CLIENT_SECRET`.
   - ⚠️ Lykillinn rennur út — settu áminningu um endurnýjun fyrir gildistíma (allt að 24 mán).

### 5. Fylltu `.env.local` og endurræstu
```
MS_TENANT_ID=…
MS_CLIENT_ID=…
MS_CLIENT_SECRET=…
MS_MAILBOX=hlidarkaup@hlidarkaup.is
EMAIL_POLL_SECRET=<langt slembið leyndarmál>     # fyrir cron-sókn
```
Síðan: **Bókhald → Pósthólf → „Sækja núna"**. Borðinn efst sýnir hvort tengt sé.

---

## Sjálfvirk sókn (cron á Proxmox)
Endapunktur `/api/cron/email-poll` er varinn með `EMAIL_POLL_SECRET` (utan staðfestingar-
middleware). Bættu við crontab á þjóninum (á 15 mín fresti):
```cron
*/15 * * * * curl -fsS -H "x-cron-secret: <EMAIL_POLL_SECRET>" https://<host>/api/cron/email-poll >/dev/null
```
Handvirka „Sækja núna" hnappinn í Pósthólfi notar staðfesta starfsmannainnskráningu (stjórnandi/bókari).

---

## Hvernig það virkar
1. Sókn sækir nýjustu pósta með viðhengjum (síðan síðasta vatnsmerki; fyrsta sinn 7 dagar aftur).
2. Aðeins viðhengi sem líta út fyrir að vera reikningar (PDF / mynd / Excel / CSV, ≤ 10 MB) eru lesin
   — þannig kostar gervigreindarlestur ekkert á póstum án viðeigandi viðhengja.
3. Gervigreind metur hvort skjalið sé reikningur og býr til **stemmda** tvíhliða færslu
   skv. bókhaldslyklaskránni. Ekki-reikningum er sleppt.
4. Drögin birtast í Pósthólfi; viðhengið geymist (bytea → fylgiskjal við samþykki, og með í nightly `pg_dump`).
5. Við samþykki er færslan bókuð (`acc.post_voucher`) og skjalið tengt sem fylgiskjal. Höfnun fjarlægir drögin.

## Öryggi
- Lyklar eru í `.env.local` (gitignored), ekki í gagnagrunni.
- Notaðu **Application Access Policy** (skref 3) — annars les forritið öll pósthólf.
- `EMAIL_POLL_SECRET` ver cron-endapunktinn; allir aðrir endapunktar krefjast starfsmannainnskráningar.
