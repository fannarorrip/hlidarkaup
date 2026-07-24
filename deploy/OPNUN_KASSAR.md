# Yfirtaka — kassar 1/2/3 klárir + bókhald á núll

Gátlisti fyrir yfirtökudaginn. Þrír hlutar: (A) hver kassi, (B) Rocky, (C) prófun.

## A. Á HVERJUM kassa-PC (kassi1, kassi2, kassi3)

Afritaðu `deploy/kassabru/` (install.ps1 + kassabru.cs) og `deploy/till-fullscreen.ps1`
á kassann (USB-lykill eða TeamViewer). Svo í **admin PowerShell**:

### 1. Finna COM-portin (tvö á NCR-kassanum)
Device Manager → Ports (COM & LPT) → skrifa niður:
- **prentari** (NCR 7197) — var COM3 á fyrsta kassanum
- **skanni-vigt** (NCR RealScan 7874) — var COM4 á fyrsta kassanum
(Edgeport USB-serial raðar þeim eins ef vélbúnaðurinn er eins, en STAÐFESTA á hverri vél.)

### 2. Kassabrú (prentari + skanni + vigt + autostart)
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -PrinterPort COM3 -ScannerPort COM4 -CodePage 8
```
- Allt NCR eins og upphaflega: prentari, skanni og vigt gegnum kassabrú — engin
  netprentun. Skúffan tengist prentaranum (kick gegnum COM3).
- Skanna-vigtin er EITT port — sama port skannar og vigtar (NCR-samskiptamál valið
  sjálfkrafa). `-CodePage 8` = NCR 7197 (CP1252 fyrir íslensku).
- Skriptan: þýðir exe, skráir autostart (Task Scheduler „Kassabru"), slekkur á USB
  selective suspend (drap COM-portið síðast), ræsir og heilsutékkar.
- Muna: skanninn er ÓVIRKUR þar til kassabrú sendir enable — ef hann pípir ekki við
  skann, athuga að brúin sé í gangi (`http://127.0.0.1:8974/health`).

### 3. Fullskjár beint við ræsingu
```powershell
powershell -ExecutionPolicy Bypass -File till-fullscreen.ps1 -Reg kassi1
```
(`kassi2` / `kassi3` á hinum.) Opnar Edge app-glugga á
`http://192.168.1.70:3000/kassi/starf?reg=kassiN`, F11 sjálfkrafa, startup-shortcut,
svefn/skjávari af. **F11 er neyðarútgangur starfsfólks.**

### 4. Auto-logon (sleppa Windows-lykilorði við ræsingu)
Handvirkt, einu sinni: `netplwiz` → haka ÚR „Users must enter a user name and
password" → OK → slá inn lykilorðið. Eftir þetta: kveikja á vélinni = kassinn opinn.

## B. Á Rocky

### 1. Uppfæra kóðann
```bash
sudo bash /opt/hlidarkaup/deploy/update.sh
```

### 2. Prentun
Öll prentun fer gegnum kassabrú á hverjum kassa (NCR 7197) — engin
`PRINTER_IP_*` stilling þarf á Rocky. Brúin hefur alltaf forgang; gömul
`PRINTER_IP_KASSI*` gildi frá Volcora-prófunum eru meinlaus (aðeins varaleið
ef brúin svarar ekki) en hreinlegast að fjarlægja þau úr
`/opt/hlidarkaup/.env.local`.

### 3. ⚠️ BÓKHALD Á NÚLL — afrit FYRST, svo núllstilling
```bash
sudo -u postgres bash /opt/hlidarkaup/deploy/backup.sh
cd /opt/hlidarkaup && sudo -u hlidarkaup bash -c 'set -a; source <(grep ^DATABASE_URL .env.local | tr -d "\r"); set +a; psql "$DATABASE_URL" -f deploy/reset-transactions.sql'
```
Eyðir ÖLLUM færslum (fylgiskjöl, reikningar, kröfur, Z-skýrslur, launakeyrslur,
bank_bills o.s.frv.) — heldur ÖLLUM grunngögnum (vörur, verð, viðskiptamenn,
birgjar, lyklar, reglur, starfsfólk). Númeraraðir byrja á 1. Ógreiddir reikningar
sækjast aftur úr bankanum í næstu samstillingu.

## C. Prófun á hverjum kassa (2 mín)
1. Endurræsa vélina → á að enda beint í fullskjá á kassanum
2. Skanna vöru → línan birtist
3. Leggja vöru á vigt → „Vigta" → þyngd + verð
4. Kortasala á posann (hver kassi á sinn posa) + kvittun prentast
5. Reiðufjársala → skúffan opnast
