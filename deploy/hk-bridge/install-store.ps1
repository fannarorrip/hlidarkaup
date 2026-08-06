# install-store.ps1 -- setja HK-bruna upp a budartolvunni (Windows 10/11).
# KEYRA I POWERSHELL SEM ADMIN, i moppunni sem hk-bridge var afritad i,
# innskrad(ur) sem notandinn sem verdur alltaf innskradur a velinni.
#
#   powershell -ExecutionPolicy Bypass -File .\install-store.ps1
#
# ATH: skrain er viljandi an islenskra stafa -- PowerShell 5.1 les .ps1 an BOM
# sem ANSI og brytur strengi med utf-8 stofum (gerdist 6.8.2026).
param(
  [string]$PfxPath = "C:\Arion\arion.pfx",
  [int]$Port = 8035
)
$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole("Administrators")) {
  Write-Host "Keyrdu skriptuna i PowerShell SEM ADMIN (Run as administrator)." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $PSScriptRoot "hk-bridge.exe"))) {
  Write-Host "hk-bridge.exe fannst ekki -- keyrdu fyrst .\build.cmd i hk-bridge moppunni." -ForegroundColor Red
  exit 1
}

# 1) HTTP-hlustun + eldveggur (einskiptis admin-skref)
netsh http add urlacl url=http://+:$Port/B2BBridge/ user=$env:USERNAME | Out-Null
try { netsh advfirewall firewall delete rule name="HK-bru Arion B2B ($Port)" | Out-Null } catch {}
netsh advfirewall firewall add rule name="HK-bru Arion B2B ($Port)" dir=in action=allow protocol=TCP localport=$Port remoteip=192.168.1.0/24,192.168.2.0/24 | Out-Null
Write-Host "1/4  Port $Port opinn (bara innranetid)." -ForegroundColor Green

# 2) Bunadarskilrikid (.pfx) inn i CurrentUser\My
if (Test-Path $PfxPath) {
  $pw = Read-Host "Lykilord a .pfx-skjalinu (ARION_CERT_PASSWORD)" -AsSecureString
  Import-PfxCertificate -FilePath $PfxPath -CertStoreLocation Cert:\CurrentUser\My -Password $pw | Out-Null
  Write-Host "2/4  Bunadarskilrikid komid inn." -ForegroundColor Green
} else {
  Write-Host "2/4  SLEPPT: $PfxPath fannst ekki -- afritadu .pfx thangad og keyrdu aftur." -ForegroundColor Yellow
}

# 3) Nuverandi public-skilriki Arion ur lifandi WSDL (gomlu .cer i zip eru utrunnin)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$wsdl = (New-Object Net.WebClient).DownloadString("https://ws.b2b.is/Statements/20131015/AccountService.svc?singleWsdl")
$b64 = ([regex]::Match($wsdl, "<X509Certificate>([^<]+)</X509Certificate>")).Groups[1].Value
if (-not $b64) { Write-Host "Nadi ekki Arion-skilrikinu ur WSDL -- nettenging?" -ForegroundColor Red; exit 1 }
$cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2(,[Convert]::FromBase64String($b64))
$store = New-Object Security.Cryptography.X509Certificates.X509Store("My", "CurrentUser")
$store.Open("ReadWrite"); $store.Add($cert); $store.Close()
Write-Host ("3/4  Arion-skilrikid komid inn (rennur ut {0:yyyy-MM-dd})." -f $cert.NotAfter) -ForegroundColor Green

# 4) Sjalfraesing vid innskraningu (Startup-mappa notandans)
$cmd = Join-Path $PSScriptRoot "start-hk-bridge.cmd"
"@echo off`r`ncd /d %~dp0`r`nhk-bridge.exe $Port" | Set-Content -Encoding Ascii $cmd
$lnk = Join-Path ([Environment]::GetFolderPath("Startup")) "HK-bru.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = $cmd
$sc.WorkingDirectory = $PSScriptRoot
$sc.Save()
Write-Host "4/4  Sjalfraesing sett upp." -ForegroundColor Green

Write-Host ""
Write-Host "BUID. Raestu bruna nuna:  .\hk-bridge.exe $Port" -ForegroundColor Cyan
Write-Host "IP-tala velarinnar (fyrir Rocky-stillinguna):"
ipconfig | Select-String "IPv4"
