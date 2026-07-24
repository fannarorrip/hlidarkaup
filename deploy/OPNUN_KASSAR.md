# Yfirtaka — kassar 1/2/3 klárir + bókhald á núll

Gátlisti fyrir yfirtökudaginn. Þrír hlutar: (A) hver kassi, (B) Rocky, (C) prófun.

## A. Á HVERJUM kassa-PC (kassi1, kassi2, kassi3)

Afritaðu `deploy/kassabru/` (install.ps1 + kassabru.cs) og `deploy/till-fullscreen.ps1`
á kassann (USB-lykill eða TeamViewer). Svo í **admin PowerShell**:

### 1. Finna COM-port skanna/vigtar
Device Manager → Ports (COM & LPT) → skrifa niður COM-númer NCR skanna-vigtarinnar
(getur verið mismunandi milli véla — á fyrsta kassanum var það COM7).

### 2. Kassabrú (skanni + vigt + autostart)
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -PrinterPort none -ScannerPort COM7 -CodePage 8
```
- `-ScannerPort` = COM-númerið úr skrefi 1. NCR skanna-vigtin er EITT port — sama
  port skannar og vigtar (kassabrú velur NCR/Datalogic samskiptamál sjálfkrafa).
- `-PrinterPort none` þegar kassinn prentar á Volcora yfir netið (Rocky sér um það).
  EF NCR-kvittanaprentari er tengdur beint við kassann í staðinn: `-PrinterPort COM3`.
- Skriptan: þýðir exe, skráir autostart (Task Scheduler „Kassabru"), slekkur á USB
  selective suspend (drap COM-portið síðast), ræsir og heilsutékkar.

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

### 2. Prentarar (ef Volcora á hverjum kassa)
Hver kassi þarf sitt `PRINTER_IP_KASSI1/2/3` í `/opt/hlidarkaup/.env.local`
(fast IP á hverjum Volcora — taka frá í router/DHCP). Endurræsa eftir breytingu:
`sudo systemctl restart hlidarkaup`.

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
