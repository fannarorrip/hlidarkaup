# ============================================================================
# Till fullscreen setup — run ON THE TILL PC in an ADMIN PowerShell:
#   powershell -ExecutionPolicy Bypass -File till-fullscreen.ps1 -Reg kassi1
# Makes the till boot straight into the register, fullscreen, and stay awake:
#   1. Edge in APP mode (no tabs/address bar) + fullscreen at Windows startup.
#      App mode (not Edge "kiosk mode") keeps the normal profile, so the staff
#      login cookie survives reboots.
#   2. Power settings: never sleep, screen always on.
# Auto-logon (skip the Windows password at boot) is a manual step: run netplwiz,
# untick "Users must enter a user name and password", OK, enter the password.
# ============================================================================
param(
  [string]$Reg = "kassi1",
  [string]$Url = ""
)
$ErrorActionPreference = "Stop"

if (-not $Url) { $Url = "https://hlidarkaup.is/kassi/starf?reg=$Reg" }

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $edge)) { throw "Edge fannst ekki" }

$edgeArgs = "--app=$Url --start-fullscreen --no-first-run"

# 1. Startup shortcut (current user)
$startup = [Environment]::GetFolderPath("Startup")
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $startup "Kassi.lnk"))
$lnk.TargetPath = $edge
$lnk.Arguments = $edgeArgs
$lnk.Description = "Hlidarkaup kassi - $Reg"
$lnk.Save()
"OK: startup shortcut -> $Url"

# 2. Never sleep, screen always on (AC)
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
"OK: svefn/skjavari af"

# 3. Launch it now
Start-Process $edge -ArgumentList $edgeArgs
"OK: kassinn opinn - fullscreen (F11 til ad komast ut, Alt+F4 til ad loka)"
