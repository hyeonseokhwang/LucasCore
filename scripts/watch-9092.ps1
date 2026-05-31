$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."
$ApiUrl = "http://127.0.0.1:9092"
$LogPath = Join-Path $Root "lcc-9092-watchdog.log"
$ApiOut = Join-Path $Root "lcc-api-9092.log"
$ApiErr = Join-Path $Root "lcc-api-9092.err.log"

function Write-WatchLog {
  param([string]$Message)
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss K"), $Message
  Add-Content -LiteralPath $LogPath -Value $line
}

function Test-ApiHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$ApiUrl/api/health" -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Start-Api9092 {
  $listener = Get-NetTCPConnection -LocalPort 9092 -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" }
  if ($listener) {
    $pids = @($listener | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 })
    foreach ($listenerPid in $pids) {
      Write-WatchLog "stopping unhealthy 9092 listener pid=$listenerPid"
      try {
        Stop-Process -Id $listenerPid -Force -ErrorAction Stop
      } catch {
        Write-WatchLog "failed to stop pid=${listenerPid}: $($_.Exception.Message)"
      }
    }
    Start-Sleep -Seconds 2
  }

  Write-WatchLog "starting 9092 API"
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "& { `$env:LCC_API_PORT='9092'; `$env:LCC_MAX_ACTIVE_SESSIONS='20'; `$env:CARGO_TARGET_DIR='target-9092'; .\scripts\dev-api.ps1 }"
  )
  $process = Start-Process -FilePath powershell.exe `
    -ArgumentList $args `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ApiOut `
    -RedirectStandardError $ApiErr `
    -PassThru
  Write-WatchLog "started API launcher pid=$($process.Id)"
}

function Ensure-ChiefMin {
  try {
    $sessions = Invoke-RestMethod -Uri "$ApiUrl/api/sessions" -Method Get -TimeoutSec 5
  } catch {
    Write-WatchLog "session check failed: $($_.Exception.Message)"
    return
  }

  $chief = @($sessions) | Where-Object { $_.id -eq "chief-min" -and $_.status -eq "active" } | Select-Object -First 1
  if ($chief) {
    return
  }

  Write-WatchLog "creating CHIEF-MIN session"
  $body = @{
    id = "chief-min"
    name = "CHIEF-MIN"
    team = "management"
    cwd = "workspaces/chief-min/repo"
    cmd = "codex.cmd"
    args = @("--model", "gpt-5.5", "--cd", ".", "--no-alt-screen", "--dangerously-bypass-approvals-and-sandbox")
  } | ConvertTo-Json -Depth 8

  try {
    Invoke-RestMethod -Uri "$ApiUrl/api/sessions" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10 | Out-Null
    Write-WatchLog "created CHIEF-MIN session"
  } catch {
    Write-WatchLog "CHIEF-MIN create failed: $($_.Exception.Message)"
  }
}

Write-WatchLog "watchdog started"

while ($true) {
  if (-not (Test-ApiHealth)) {
    Write-WatchLog "9092 health failed"
    Start-Api9092
    Start-Sleep -Seconds 5
  }

  if (Test-ApiHealth) {
    Ensure-ChiefMin
  }

  Start-Sleep -Seconds 15
}
