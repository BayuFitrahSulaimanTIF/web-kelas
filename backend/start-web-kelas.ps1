# ===================================================
# START WEB KELAS (server + ngrok) — hidden
#
# Cukup jalankan file ini (atau `npm start`) satu kali:
#   - server.js + ngrok http 3000 jalan tersembunyi
#   - supervisor.js menjaga keduanya tetap hidup
#   - boleh tutup terminal
# ===================================================
$ErrorActionPreference = 'SilentlyContinue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

# sudah ada supervisor hidup? jangan duplikat
$sup = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
       Where-Object { $_.CommandLine -match 'supervisor\.js' }
if ($sup) {
  Write-Host "[web-kelas] supervisor sudah jalan PID $($sup.ProcessId) — tidak start lagi"
  exit 0
}

Write-Host "[web-kelas] menyalakan supervisor (server + ngrok)..."
Start-Process -FilePath "node" -ArgumentList "supervisor.js" -WorkingDirectory $dir -WindowStyle Hidden
Start-Sleep -Seconds 5

# tampilkan hasil
try {
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -UseBasicParsing -TimeoutSec 3
  Write-Host "[web-kelas] server: $($h.StatusCode) $($h.Content)"
} catch {
  Write-Host "[web-kelas] server belum siap, supervisor akan mencoba lagi..."
}
try {
  $t = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
  Write-Host "[web-kelas] ngrok: $($t.tunnels[0].public_url) -> $($t.tunnels[0].config.addr)"
} catch {
  Write-Host "[web-kelas] ngrok belum siap, supervisor akan mencoba lagi..."
}
Write-Host "Selesai. Boleh tutup terminal ini."
