param(
  [string]$WebPort = "9000",
  [string]$ApiPort = "9001",
  [string]$HostName = "127.0.0.1",
  [switch]$ApiOnly,
  [switch]$WebOnly,
  [switch]$SkipAgentBootstrap,
  [int]$AgentBootstrapTimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Resolve-Path "$PSScriptRoot\.."
$ApiOrigin = "http://${HostName}:$ApiPort"
$WsOrigin = "ws://${HostName}:$ApiPort"

if (-not $WebOnly) {
  Write-Host "Starting LCC Agent/API server on $ApiOrigin"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\dev-api.ps1`" -Port `"$ApiPort`"" `
    -WorkingDirectory $Root `
    -WindowStyle Hidden

  if (-not $SkipAgentBootstrap) {
    Write-Host "Scheduling Caesar/Max bootstrap after API readiness"
    Start-Process -FilePath "powershell.exe" `
      -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\bootstrap-lcc-managers.ps1`" -ApiUrl `"$ApiOrigin`" -TimeoutSeconds `"$AgentBootstrapTimeoutSeconds`"" `
      -WorkingDirectory $Root `
      -WindowStyle Hidden
  }
}

if (-not $ApiOnly) {
  Write-Host "Starting LCC Web UI on http://${HostName}:$WebPort -> $ApiOrigin"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\dev-web.ps1`" -Port `"$WebPort`" -ApiOrigin `"$ApiOrigin`" -WsOrigin `"$WsOrigin`" -HostName `"$HostName`"" `
    -WorkingDirectory $Root `
    -WindowStyle Hidden
}

Write-Host "LCC Core endpoints:"
Write-Host "  Web: http://${HostName}:$WebPort"
Write-Host "  API: $ApiOrigin"
Write-Host "  WS:  $WsOrigin"
