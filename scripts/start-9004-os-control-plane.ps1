param(
  [switch]$ApiOnly
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."
$RegistryPath = Join-Path $Root "data\os-agents-9003\registry.json"

Write-Host "Starting 9004 API with OS registry enabled"
Write-Host "  web=9003 api=9004"
Write-Host "  registry=$RegistryPath"
Write-Host "  note=9003 web is not managed by this bootstrap"

& (Join-Path $PSScriptRoot "dev-api.ps1") -Port "9004" -OsAgentRegistry $RegistryPath -MaxActiveSessions "20"
