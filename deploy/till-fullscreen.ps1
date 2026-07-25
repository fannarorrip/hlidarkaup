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
  [string]$Url = "",
  [string]$Key = ""   # KIOSK_KEY — auto-authenticates the till as afgreidsla (no manual login)
)
$ErrorActionPreference = "Stop"

# The till auto-logs into /kassi/starf via the kiosk key (must match KIOSK_KEY on the server).
if (-not $Url) {
  $Url = "http://192.168.1.70:3000/kassi/starf?reg=$Reg"
  if ($Key) { $Url = "$Url&k=$Key&kiosk=1" }   # kiosk=1 hides back-office links (locked till)
}

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $edge)) { throw "Edge fannst ekki" }

# 1. VBS launcher: open the till in app mode, then send F11 ONCE for fullscreen.
# Robust: poll up to 90s (cold Edge start on first boot is slow) and match the
# title by ASCII prefix "Hl" — AppActivate does a begins-with match, so the
# Icelandic chars í/ð can never cause a codepage mismatch in the ANSI .vbs.
# Single F11 only (a second press would toggle fullscreen back OFF); a long
# settle wait before it avoids the keystroke being eaten during page load.
New-Item -ItemType Directory -Force "C:\kassabru" | Out-Null
$vbs = @"
Set sh = CreateObject("WScript.Shell")
sh.Run """$edge"" --app=$Url --no-first-run", 1, False
ok = False
For i = 1 To 180
  WScript.Sleep 500
  ok = sh.AppActivate("Hl")
  If ok Then Exit For
Next
If ok Then
  WScript.Sleep 2500
  sh.AppActivate "Hl"
  WScript.Sleep 300
  sh.SendKeys "{F11}"
End If
"@
Set-Content -Path "C:\kassabru\kassi-start.vbs" -Value $vbs -Encoding Default
"OK: launcher C:\kassabru\kassi-start.vbs -> $Url"

# 2. Startup shortcut — All-Users startup so it launches for the dedicated kiosk
# user (kassi01/02/03), whoever auto-logs-in, not just the admin who ran this.
$startup = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $startup "Kassi.lnk"))
$lnk.TargetPath = "wscript.exe"
$lnk.Arguments = '"C:\kassabru\kassi-start.vbs"'
$lnk.Description = "Hlidarkaup kassi - $Reg"
$lnk.Save()
# tína burt eldri eintök úr núverandi-notanda startup (eldri uppsetning)
Remove-Item (Join-Path ([Environment]::GetFolderPath("Startup")) "Kassi.lnk") -Force -ErrorAction SilentlyContinue
"OK: startup shortcut (All-Users)"

# 3. Never sleep, screen always on (AC)
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
"OK: svefn/skjavari af"

# 4. Launch it now
Start-Process wscript.exe '"C:\kassabru\kassi-start.vbs"'
"OK: kassinn opnast - fullscreen eftir ~9 sek (F11 til ad komast ut)"
