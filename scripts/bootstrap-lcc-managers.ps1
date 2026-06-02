param(
  [string]$ApiUrl = "http://127.0.0.1:9001",
  [int]$TimeoutSeconds = 90,
  [string]$LogPath = ""
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."
if (-not $LogPath) {
  $LogPath = Join-Path $Root "data\system-logs\manager-bootstrap-9001.log"
}

function Write-BootstrapLog {
  param([string]$Message)
  $dir = Split-Path -Parent $LogPath
  if ($dir) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  Add-Content -LiteralPath $LogPath -Value "$((Get-Date).ToUniversalTime().ToString("o")) $Message"
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
Write-BootstrapLog "waiting for API $ApiUrl"

while ((Get-Date) -lt $deadline) {
  try {
    Invoke-RestMethod -Uri "$ApiUrl/api/sessions" -Method Get -TimeoutSec 5 | Out-Null
    Write-BootstrapLog "API is ready; starting Caesar and Max"
    & "$PSScriptRoot\start-lcc-agents.ps1" -ApiUrl $ApiUrl
    Write-BootstrapLog "manager bootstrap complete"
    exit 0
  } catch {
    Start-Sleep -Seconds 2
  }
}

Write-BootstrapLog "timed out waiting for API $ApiUrl"
exit 1
