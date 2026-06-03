$ErrorActionPreference = "Continue"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogDir = Join-Path $Root "data\system-logs"
$LogPath = Join-Path $LogDir "ceo-nonstop-loop.log"
$PidPath = Join-Path $LogDir "ceo-nonstop-loop.pid"
$IntervalSeconds = [int]($env:CEO_NONSTOP_LOOP_SECONDS)
if ($IntervalSeconds -le 0) {
  $IntervalSeconds = 60
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Content -Path $PidPath -Encoding UTF8 -Value $PID
Set-Location $Root

while ($true) {
  $at = Get-Date -Format o
  Add-Content -Path $LogPath -Encoding UTF8 -Value "[$at] CEO nonstop tick"

  foreach ($script in @("tools\agent-work-dispatcher.cjs", "tools\caesar-patrol.cjs", "tools\ceo-wake-tick.cjs")) {
    try {
      $output = & node $script 2>&1 | Out-String
      if ($output.Trim().Length -gt 0) {
        Add-Content -Path $LogPath -Encoding UTF8 -Value $output.TrimEnd()
      }
    } catch {
      Add-Content -Path $LogPath -Encoding UTF8 -Value "[$(Get-Date -Format o)] $script failed: $($_.Exception.Message)"
    }
  }

  Start-Sleep -Seconds $IntervalSeconds
}
