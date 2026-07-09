# ============================================================================
# Till fullscreen setup — run ON THE TILL PC in an ADMIN PowerShell:
#   powershell -ExecutionPolicy Bypass -File till-fullscreen.ps1 -Reg kassi1 -Url "http://192.168.1.70:3000/kassi/starf?reg=kassi1"
# Makes the till boot straight into the register, FULLSCREEN, and stay awake.
#
# How: Edge APP mode (no tabs/address bar; keeps the normal profile so the staff
# login survives reboots) — but app windows ignore --start-fullscreen, so a tiny
# VBS launcher opens the till and presses F11 automatically. F11 remains the
# staff escape hatch. The till URL should be the Rocky server's LAN address
# (works during internet outages; the public domain doesn't serve kassi paths).
#
# Auto-logon (skip the Windows password at boot) is a manual step: run netplwiz,
# untick "Users must enter a user name and password", OK, enter the password.
# ============================================================================
param(
  [string]$Reg = "kassi1",
  [string]$Url = ""
)
$ErrorActionPreference = "Stop"

if (-not $Url) { $Url = "http://192.168.1.70:3000/kassi/starf?reg=$Reg" }

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $edge)) { throw "Edge fannst ekki" }

# 1. VBS launcher: open the till in app mode, then send F11 for fullscreen
New-Item -ItemType Directory -Force "C:\kassabru" | Out-Null
$vbs = @"
Set sh = CreateObject("WScript.Shell")
sh.Run """$edge"" --app=$Url --no-first-run", 1, False
WScript.Sleep 9000
sh.AppActivate "Hlíðarkaup"
WScript.Sleep 500
sh.SendKeys "{F11}"
"@
Set-Content -Path "C:\kassabru\kassi-start.vbs" -Value $vbs -Encoding Default
"OK: launcher C:\kassabru\kassi-start.vbs -> $Url"

# 2. Startup shortcut (current user)
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Startup")) "Kassi.lnk"))
$lnk.TargetPath = "wscript.exe"
$lnk.Arguments = '"C:\kassabru\kassi-start.vbs"'
$lnk.Description = "Hlidarkaup kassi - $Reg"
$lnk.Save()
"OK: startup shortcut"

# 3. Never sleep, screen always on (AC)
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
"OK: svefn/skjavari af"

# 4. Launch it now
Start-Process wscript.exe '"C:\kassabru\kassi-start.vbs"'
"OK: kassinn opnast - fullscreen eftir ~9 sek (F11 til ad komast ut)"
