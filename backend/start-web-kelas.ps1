# ===================================================
# START WEB KELAS (server + ngrok) - tersembunyi
#
# Jalankan file ini satu kali:
#   powershell -ExecutionPolicy Bypass -File start-web-kelas.ps1
#
# Yang terjadi:
#   - supervisor.js menyalakan server.js + ngrok http 3000 tanpa jendela
#   - boleh tutup terminal
#
# CATATAN: file ini WAJIB ASCII saja. PowerShell 5.1 membaca .ps1
# sebagai ANSI bila tanpa BOM, sehingga karakter non-ASCII (mis. "—")
# jadi byte aneh dan menyebabkan ParseError.
# ===================================================
$ErrorActionPreference = 'SilentlyContinue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

# sudah ada supervisor hidup? jangan duplikat
$sup = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
       Where-Object { $_.CommandLine -match 'supervisor\.js' }
if ($sup) {
  Write-Host "[web-kelas] supervisor sudah jalan PID $($sup.ProcessId) - tidak start lagi"
  exit 0
}

Write-Host "[web-kelas] menyalakan supervisor (server + ngrok)..."
Start-Process -FilePath "node" -ArgumentList "supervisor.js" -WorkingDirectory $dir -WindowStyle Hidden
Start-Sleep -Seconds 6

# tampilkan hasil
try {
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -UseBasicParsing -TimeoutSec 3
  Write-Host "[web-kelas] server: $($h.StatusCode) $($h.Content)"
} catch {
  Write-Host "[web-kelas] server belum siap, supervisor akan mencoba lagi..."
}
# tunnel biasanya butuh beberapa detik untuk handshake ke ngrok
$url = ''
for ($i = 0; $i -lt 12; $i++) {
  try {
    $t = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
    if ($t.tunnels.Count -gt 0) { $url = $t.tunnels[0].public_url; break }
  } catch {}
  Start-Sleep -Seconds 2
}
if ($url) { Write-Host "[web-kelas] ngrok: $url" }
else { Write-Host "[web-kelas] ngrok belum siap, supervisor akan mencoba lagi..." }
Write-Host "Selesai. Boleh tutup terminal ini."
