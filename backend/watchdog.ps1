# watchdog.ps1 — fallback PowerShell watchdog (runs hidden, survives reboot via Run registry)
# Checks localhost:3000 every 7s, restarts node server.js if not responding. No internet fetch.
$ErrorActionPreference = 'SilentlyContinue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $dir 'watchdog.log'
function Log($m){ try{ Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }catch{} }
Log "watchdog.ps1 start"
while($true){
  try{
    $ok=$false
    try{ $r=Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -UseBasicParsing -TimeoutSec 3; if($r.StatusCode -eq 200){$ok=$true} }catch{}
    if(-not $ok){
      Log "down → restart"
      try{
        $line = (netstat -ano | Select-String ":3000" | Select-Object -First 1)
        if($line){ $pid=(($line.ToString() -split '\s+') | Where-Object{$_ -match '^\d+$'} | Select-Object -Last 1); if($pid){ try{ Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue }catch{} } }
      }catch{}
      Start-Sleep -Seconds 1
      try{ Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $dir -WindowStyle Hidden }catch{ Log "restart fail $_" }
    }
  }catch{ Log "loop err $_" }
  Start-Sleep -Seconds 7
}
