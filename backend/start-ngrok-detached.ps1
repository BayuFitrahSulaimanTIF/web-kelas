# start-ngrok-detached.ps1 — ponytail: ngrok http 3000 detached, Ctrl+C / close terminal tidak matikan tunnel
# cara pakai: klik kanan -> Run with PowerShell  atau  powershell -ExecutionPolicy Bypass -File start-ngrok-detached.ps1
$ngrok = "C:\Users\t\AppData\Roaming\npm\node_modules\ngrok\bin\ngrok.exe"
if (!(Test-Path $ngrok)) { $ngrok = "ngrok" }
# jika sudah jalan jangan duplikat
$running = Get-Process ngrok -ErrorAction SilentlyContinue
if ($running) { Write-Host "[tunnel] ngrok sudah jalan PID $($running.Id) — skip"; exit 0 }
Write-Host "[tunnel] starting ngrok detached..."
Start-Process -FilePath $ngrok -ArgumentList "http","3000" -WindowStyle Hidden
Start-Sleep -Seconds 1
Get-Process ngrok -ErrorAction SilentlyContinue | Format-Table Id,ProcessName -AutoSize
Write-Host "Selesai — boleh close terminal ini, Web Kelas tetap online via ngrok."
