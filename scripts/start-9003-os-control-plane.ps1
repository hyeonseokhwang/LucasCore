param(
  [switch]$StartDevTeam,
  [switch]$ApiOnly
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."
$RegistryPath = Join-Path $Root "data\os-agents-9003\registry.json"
$LogDir = Join-Path $Root "data\os-agents-9003\logs"

if (-not $ApiOnly) {
  & (Join-Path $PSScriptRoot "start-os-codex-agents.ps1") `
    -RegistryPath $RegistryPath `
    -LogDir $LogDir `
    -DevelopmentOnly | Out-Host
}

if ($StartDevTeam) {
  & (Join-Path $PSScriptRoot "start-lcc-agents.ps1") -ApiUrl "http://127.0.0.1:9004" | Out-Host
}

Write-Host "Starting 9004 API with OS registry: $RegistryPath"
& (Join-Path $PSScriptRoot "dev-api.ps1") -Port "9004" -OsAgentRegistry $RegistryPath -MaxActiveSessions "20"
