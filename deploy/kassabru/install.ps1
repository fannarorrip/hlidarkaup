# ============================================================================
# Kassabrú installer — run ON THE TILL PC in an ADMIN PowerShell:
#   powershell -ExecutionPolicy Bypass -File install.ps1
# Volcora USB till (printer installed as a Windows printer, USB scanner, no scale):
#   powershell -ExecutionPolicy Bypass -File install.ps1 -PrinterPort "win:POS80" -ScannerPort none -CodePage 16
#   (find the exact printer name under Settings -> Bluetooth & devices -> Printers)
# Compiles kassabru.cs with the compiler built into Windows (no installs),
# reserves the localhost URL, registers autostart at logon, and starts it.
# ============================================================================
param(
  [string]$PrinterPort = "COM3",
  [string]$ScannerPort = "COM4",
  [int]$HttpPort = 8974,
  [int]$CodePage = 8
)
$ErrorActionPreference = "Stop"
$dir = "C:\kassabru"
$src = Join-Path $PSScriptRoot "kassabru.cs"

if (-not (Test-Path $src)) { throw "kassabru.cs vantar í $PSScriptRoot" }
New-Item -ItemType Directory -Force $dir | Out-Null
# Skip the copy when the installer is already running FROM C:\kassabru
$dest = Join-Path $dir "kassabru.cs"
if ((Resolve-Path $src).Path -ne $dest) { Copy-Item $src $dest -Force }

# 1. Compile with the in-box .NET Framework compiler
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe" }
& $csc /nologo /out:"$dir\kassabru.exe" "$dir\kassabru.cs"
if ($LASTEXITCODE -ne 0) { throw "Compile failed" }
"OK: kassabru.exe compiled"

# 2. Allow a non-admin process to listen on localhost
netsh http add urlacl url=http://127.0.0.1:$HttpPort/ user=Everyone 2>$null
"OK: URL ACL (localhost:$HttpPort)"

# 3. Autostart at logon — All-Users Startup shortcut (NOT a per-user scheduled task).
# The till auto-logs-in as a dedicated STANDARD kiosk user (e.g. kassi01/02/03); an
# ONLOGON task is bound to the author's account and would not fire for that user. An
# All-Users startup shortcut launches for whoever logs into the interactive session,
# shows the console (easy to check/kill), and needs no password. kassabru handles a
# double start gracefully, so this never conflicts with a still-running instance.
$argStr = ('{0} {1} {2} {3}' -f $PrinterPort, $ScannerPort, $HttpPort, $CodePage)
$startup = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
$ws = New-Object -ComObject WScript.Shell
$klnk = $ws.CreateShortcut((Join-Path $startup "Kassabru.lnk"))
$klnk.TargetPath = "$dir\kassabru.exe"
$klnk.Arguments = $argStr
$klnk.WorkingDirectory = $dir
$klnk.Save()
# remove any older task-based install — cmd /c so a "task not found" stderr can't
# terminate the script under $ErrorActionPreference=Stop (same guard as powercfg above)
cmd /c "schtasks /Delete /TN Kassabru /F >nul 2>&1"
"OK: autostart (All-Users startup: Kassabru.lnk) - $argStr"

# 4. USB selective suspend OFF — Windows quietly powers down USB-serial adapters
# otherwise, which killed the scanner/scale COM port mid-shift once already.
# cmd /c + full redirect: some OEM power plans (NCR) lack this setting, and under
# $ErrorActionPreference=Stop a redirected native stderr would kill the script.
cmd /c "powercfg /SETACVALUEINDEX SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb3f4be838 0 >nul 2>&1"
cmd /c "powercfg /SETDCVALUEINDEX SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb3f4be838 0 >nul 2>&1"
cmd /c "powercfg /SETACTIVE SCHEME_CURRENT >nul 2>&1"
"OK: USB selective suspend av (ef stillingin er til - annars: Device Manager -> USB hubs -> Power Management)"

# 5. Start it now
Start-Process "$dir\kassabru.exe" -WorkingDirectory $dir -ArgumentList $argStr
Start-Sleep 2
try {
  $h = Invoke-RestMethod http://127.0.0.1:$HttpPort/health -TimeoutSec 5
  "OK: bridge running - printer=$($h.printer) scanner=$($h.scanner)"
} catch {
  "!! bridge did not answer /health - check $dir\kassabru.log"
}
