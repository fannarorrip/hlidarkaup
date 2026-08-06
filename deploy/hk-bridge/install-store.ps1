# install-store.ps1 — setja HK-brúna upp á búðartölvunni (Windows 10).
# KEYRA Í POWERSHELL SEM ADMIN, í möppunni sem hk-bridge.exe var afritað í,
# innskráð(ur) sem notandinn sem verður alltaf innskráður á vélinni (kassanotandinn).
#
#   powershell -ExecutionPolicy Bypass -File .\install-store.ps1
#
# Gerir: urlacl + eldveggsreglu (port 8035), flytur inn búnaðarskilríkið (.pfx)
# og NÚVERANDI public-skilríki Arion (dregið úr lifandi WSDL — .cer í gömlum zip-um
# er útrunnið 2014), og setur brúna í sjálfræsingu við innskráningu.
param(
  [string]$PfxPath = "C:\Arion\arion.pfx",
  [int]$Port = 8035
)
$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole("Administrators")) {
  Write-Host "Keyrðu þessa skriptu í PowerShell SEM ADMIN (hægri-smella > Run as administrator)." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $PSScriptRoot "hk-bridge.exe"))) {
  Write-Host "hk-bridge.exe fannst ekki í þessari möppu — keyrðu skriptuna úr hk-bridge möppunni." -ForegroundColor Red
  exit 1
}

# 1) HTTP-hlustun + eldveggur (einskiptis admin-skref)
netsh http add urlacl url=http://+:$Port/B2BBridge/ user=$env:USERNAME | Out-Null
try { netsh advfirewall firewall delete rule name="HK-bru Arion B2B ($Port)" | Out-Null } catch {}
netsh advfirewall firewall add rule name="HK-bru Arion B2B ($Port)" dir=in action=allow protocol=TCP localport=$Port remoteip=192.168.1.0/24,192.168.2.0/24 | Out-Null
Write-Host "1/4  Port $Port opinn (bara fyrir innranetið)." -ForegroundColor Green

# 2) Búnaðarskilríkið (.pfx) inn í CurrentUser\My
if (Test-Path $PfxPath) {
  $pw = Read-Host "Lykilorð á .pfx-skjalinu (ARION_CERT_PASSWORD)" -AsSecureString
  Import-PfxCertificate -FilePath $PfxPath -CertStoreLocation Cert:\CurrentUser\My -Password $pw | Out-Null
  Write-Host "2/4  Búnaðarskilríkið komið inn." -ForegroundColor Green
} else {
  Write-Host "2/4  SLEPPT: $PfxPath fannst ekki — afritaðu .pfx-skjalið þangað og keyrðu aftur (eða flyttu inn handvirkt)." -ForegroundColor Yellow
}

# 3) Núverandi public-skilríki Arion úr lifandi WSDL
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$wsdl = (New-Object Net.WebClient).DownloadString("https://ws.b2b.is/Statements/20131015/AccountService.svc?singleWsdl")
$b64 = ([regex]::Match($wsdl, "<X509Certificate>([^<]+)</X509Certificate>")).Groups[1].Value
if (-not $b64) { Write-Host "Náði ekki Arion-skilríkinu úr WSDL — nettenging?" -ForegroundColor Red; exit 1 }
$cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2(,[Convert]::FromBase64String($b64))
$store = New-Object Security.Cryptography.X509Certificates.X509Store("My", "CurrentUser")
$store.Open("ReadWrite"); $store.Add($cert); $store.Close()
Write-Host ("3/4  Arion-skilríkið komið inn (rennur út {0:yyyy-MM-dd})." -f $cert.NotAfter) -ForegroundColor Green

# 4) Sjálfræsing við innskráningu (Startup-mappa notandans)
$cmd = Join-Path $PSScriptRoot "start-hk-bridge.cmd"
"@echo off`r`ncd /d %~dp0`r`nhk-bridge.exe $Port" | Set-Content -Encoding Ascii $cmd
$lnk = Join-Path ([Environment]::GetFolderPath("Startup")) "HK-bru.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk); $sc.TargetPath = $cmd; $sc.WorkingDirectory = $PSScriptRoot; $sc.Save()
Write-Host "4/4  Sjálfræsing sett upp ($lnk)." -ForegroundColor Green

Write-Host ""
Write-Host "BÚIÐ. Ræstu brúna núna:  .\hk-bridge.exe $Port" -ForegroundColor Cyan
Write-Host "Prófaðu svo af Rocky:    curl http://$((Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like '192.168.*'} | Select-Object -First 1).IPAddress):$Port/B2BBridge/health"
