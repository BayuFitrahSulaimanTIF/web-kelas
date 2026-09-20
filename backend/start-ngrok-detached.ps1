# start-ngrok-detached.ps1 — ponytail: ngrok http 3000 detached + pastikan server hidup (anti 502)
# cara pakai: klik kanan -> Run with PowerShell  atau  powershell -ExecutionPolicy Bypass -File start-ngrok-detached.ps1
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ngrok = "C:\Users\t\AppData\Roaming\npm\node_modules\ngrok\bin\ngrok.exe"
if (!(Test-Path $ngrok)) { $ngrok = "ngrok" }
# pastikan server hidup dulu (hindari ERR_NGROK_8012)
try {
  $ok = $false; try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ok = $true } } catch {}
  if (-not $ok) {
    Write-Host "[tunnel] server mati -> start hidden node server.js"
    Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $dir -WindowStyle Hidden
    Start-Sleep -Seconds 3
    try { Start-Process -FilePath "node" -ArgumentList "watchdog.js" -WorkingDirectory $dir -WindowStyle Hidden } catch {}
    Start-Sleep -Seconds 1
  }
} catch {}
$running = Get-Process ngrok -ErrorAction SilentlyContinue
if ($running) { Write-Host "[tunnel] ngrok sudah jalan PID $($running.Id) — skip"; exit 0 }
Write-Host "[tunnel] starting ngrok detached..."
Start-Process -FilePath $ngrok -ArgumentList "http","3000" -WindowStyle Hidden
Start-Sleep -Seconds 1
Get-Process ngrok -ErrorAction SilentlyContinue | Format-Table Id,ProcessName -AutoSize
Write-Host "Selesai — boleh close terminal ini, Web Kelas tetap online via ngrok."
