# Hillumidi a Zebra GK420d um COM-port (hratt EPL2 — prentarinn teiknar strikamerkid sjalfur).
# Notkun:
#   .\zebra-hillumidi.ps1                          # prufumidi a COM4
#   .\zebra-hillumidi.ps1 -Port COM4 -Name "HNYFILL YSA I TEMPURA 800GR" -Price 2398 -PriceKg 2998 -Barcode 5690310022950 -ProductNo 134504
# Midastaerd: sjalfgefid 57x32mm (203 dpi = 8 punktar/mm). Breyta med -WidthMm/-HeightMm.
param(
  [string]$Port = "COM4",
  [string]$Name = "PRUFUMIDI - HLIDARKAUP",
  [int]$Price = 1234,
  [int]$PriceKg = 0,
  [string]$Barcode = "5690310022950",
  [string]$ProductNo = "123456",
  [int]$WidthMm = 57,
  [int]$HeightMm = 32,
  [int]$Copies = 1
)

$dots = 8  # 203 dpi
$w = $WidthMm * $dots
$h = $HeightMm * $dots
$kr = { param($n) ("{0:N0}" -f $n).Replace(",", ".") }

# Verdlina: Verd/stk + Verd/KG ef gefid
$priceLine = "Verd/stk " + (& $kr $Price)
if ($PriceKg -gt 0) { $priceLine += "  Verd/KG " + (& $kr $PriceKg) }

# EAN-13: EPL2 'B' skipunin ser um strik OG tolur undir (human readable = B)
$bc = ($Barcode -replace "\D", "")
$lines = @(
  "N"                                              # hreinsa mynd
  "I8,B,001"                                       # CP850 — islenskir stafir (d,th,ae,o...)
  "q$w"                                            # breidd i punktum
  "Q$h,24"                                         # haed + bil milli mida (3mm)
  "A8,8,0,3,1,1,N,`"$($Name.Substring(0, [Math]::Min(34, $Name.Length)))`""
  "A8,44,0,2,1,1,N,`"$priceLine`""
  "A$($w - 110),44,0,2,1,1,N,`"$ProductNo`""
  "B8,70,0,E30,2,4,$([Math]::Max(60, $h - 150)),B,`"$bc`""
  "A$($w - 190),$($h - 90),0,5,1,1,N,`"$(& $kr $Price)`""
  "P$Copies"                                       # prenta N eintok
)
$payload = ($lines -join "`n") + "`n"

$sp = New-Object System.IO.Ports.SerialPort $Port, 9600, "None", 8, "One"
try {
  $sp.Open()
  $bytes = [System.Text.Encoding]::GetEncoding(850).GetBytes($payload)
  $sp.Write($bytes, 0, $bytes.Length)
  Start-Sleep -Milliseconds 400
  Write-Host "Sent a $Port : $($bytes.Length) baet - midinn aetti ad koma ut nuna." -ForegroundColor Green
} catch {
  Write-Host "VILLA: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Athuga: er rett port ($Port)? (Device Manager > Ports) Er prentarinn kveiktur med midarullu?"
} finally {
  if ($sp.IsOpen) { $sp.Close() }
}
