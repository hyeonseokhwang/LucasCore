param(
  [string]$WebPort = "9000",
  [string]$ApiPort = "9001",
  [string]$HostName = "127.0.0.1",
  [switch]$ApiOnly,
  [switch]$WebOnly,
  [switch]$ElevatedApi,
  [switch]$ElevatedWeb,
  [ValidateSet("Normal", "Minimized")]
  [string]$ChildWindowStyle = "Minimized",
  [switch]$SkipAgentBootstrap,
  [int]$AgentBootstrapTimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Resolve-Path "$PSScriptRoot\.."
$ApiOrigin = "http://${HostName}:$ApiPort"
$WsOrigin = "ws://${HostName}:$ApiPort"

function Start-LccVisibleProcess {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [Parameter(Mandatory = $true)][string]$Arguments,
    [switch]$Elevated
  )

  $startArgs = @{
    FilePath = "powershell.exe"
    ArgumentList = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" $Arguments"
    WorkingDirectory = $Root
    WindowStyle = $ChildWindowStyle
  }
  if ($Elevated) {
    $startArgs.Verb = "RunAs"
  }
  Start-Process @startArgs
}

if (-not $WebOnly) {
  Write-Host "Starting LCC Agent/API server on $ApiOrigin"
  Start-LccVisibleProcess `
    -ScriptPath "$PSScriptRoot\dev-api.ps1" `
    -Arguments "-Port `"$ApiPort`"" `
    -Elevated:$ElevatedApi

  if (-not $SkipAgentBootstrap) {
    Write-Host "Scheduling Caesar/Max bootstrap after API readiness"
    Start-Process -FilePath "powershell.exe" `
      -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\bootstrap-lcc-managers.ps1`" -ApiUrl `"$ApiOrigin`" -TimeoutSeconds `"$AgentBootstrapTimeoutSeconds`"" `
      -WorkingDirectory $Root `
      -WindowStyle $ChildWindowStyle
  }
}

if (-not $ApiOnly) {
  Write-Host "Starting LCC Web UI on http://${HostName}:$WebPort -> $ApiOrigin"
  Start-LccVisibleProcess `
    -ScriptPath "$PSScriptRoot\dev-web.ps1" `
    -Arguments "-Port `"$WebPort`" -ApiOrigin `"$ApiOrigin`" -WsOrigin `"$WsOrigin`" -HostName `"$HostName`"" `
    -Elevated:$ElevatedWeb
}

Write-Host "LCC Core endpoints:"
Write-Host "  Web: http://${HostName}:$WebPort"
Write-Host "  API: $ApiOrigin"
Write-Host "  WS:  $WsOrigin"
