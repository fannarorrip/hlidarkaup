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

# 3. Autostart at logon with THESE settings (visible console -> easy to check/kill)
$argStr = ('"{0}" "{1}" {2} {3}' -f $PrinterPort, $ScannerPort, $HttpPort, $CodePage)
$tr = ('"{0}\kassabru.exe" {1}' -f $dir, $argStr)
schtasks /Create /F /TN "Kassabru" /SC ONLOGON /TR $tr | Out-Null
"OK: autostart registered (Task Scheduler: Kassabru) - $argStr"

# 4. Start it now
Start-Process "$dir\kassabru.exe" -WorkingDirectory $dir -ArgumentList $argStr
Start-Sleep 2
try {
  $h = Invoke-RestMethod http://127.0.0.1:$HttpPort/health -TimeoutSec 5
  "OK: bridge running - printer=$($h.printer) scanner=$($h.scanner)"
} catch {
  "!! bridge did not answer /health - check $dir\kassabru.log"
}
