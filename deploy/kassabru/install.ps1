# ============================================================================
# Kassabrú installer — run ON THE TILL PC in an ADMIN PowerShell:
#   powershell -ExecutionPolicy Bypass -File install.ps1
# Compiles kassabru.cs with the compiler built into Windows (no installs),
# reserves the localhost URL, registers autostart at logon, and starts it.
# ============================================================================
$ErrorActionPreference = "Stop"
$dir = "C:\kassabru"
$src = Join-Path $PSScriptRoot "kassabru.cs"

if (-not (Test-Path $src)) { throw "kassabru.cs vantar í $PSScriptRoot" }
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item $src $dir -Force

# 1. Compile with the in-box .NET Framework compiler
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe" }
& $csc /nologo /out:"$dir\kassabru.exe" "$dir\kassabru.cs"
if ($LASTEXITCODE -ne 0) { throw "Compile failed" }
"OK: kassabru.exe compiled"

# 2. Allow a non-admin process to listen on localhost:8974
netsh http add urlacl url=http://127.0.0.1:8974/ user=Everyone 2>$null
"OK: URL ACL (localhost:8974)"

# 3. Autostart at logon (visible console window -> easy to check/kill)
schtasks /Create /F /TN "Kassabru" /SC ONLOGON /TR "$dir\kassabru.exe" | Out-Null
"OK: autostart registered (Task Scheduler: Kassabru)"

# 4. Start it now
Start-Process "$dir\kassabru.exe" -WorkingDirectory $dir
Start-Sleep 2
try {
  $h = Invoke-RestMethod http://127.0.0.1:8974/health -TimeoutSec 5
  "OK: bridge running - printer=$($h.printer) scanner=$($h.scanner)"
} catch {
  "!! bridge did not answer /health - check $dir\kassabru.log"
}
