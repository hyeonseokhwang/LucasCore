param(
  [string]$ApiPort = "9004",
  [string]$WebPort = "9003",
  [switch]$ApiOnly,
  [switch]$WebOnly,
  [switch]$IncludeOsRegistry
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Resolve-Path "$PSScriptRoot\.."
$RegistryPath = Join-Path $Root "data\os-agents-9003\registry.json"
$ApiOrigin = "http://127.0.0.1:$ApiPort"
$WsOrigin = "ws://127.0.0.1:$ApiPort"

if (-not $WebOnly) {
  Write-Host "Starting Stage 1 Agent/API server on $ApiOrigin"
  $apiArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\dev-api.ps1`" -Port `"$ApiPort`" -MaxActiveSessions `"20`""
  if ($IncludeOsRegistry) {
    $apiArgs = "$apiArgs -OsAgentRegistry `"$RegistryPath`""
    Write-Host "OS registry enabled for compatibility: $RegistryPath"
  } else {
    $apiArgs = "$apiArgs -OsAgentRegistry `"`""
    Write-Host "OS registry disabled for Stage 1. Agents are API child PTYs until Stage 2."
  }
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList $apiArgs `
    -WorkingDirectory $Root `
    -WindowStyle Hidden
}

if (-not $ApiOnly) {
  Write-Host "Starting Stage 1 Web UI on http://127.0.0.1:$WebPort -> $ApiOrigin"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\dev-web.ps1`" -Port `"$WebPort`" -ApiOrigin `"$ApiOrigin`" -WsOrigin `"$WsOrigin`"" `
    -WorkingDirectory $Root `
    -WindowStyle Hidden
}

Write-Host "Stage 1 endpoints:"
Write-Host "  Web: http://127.0.0.1:$WebPort"
Write-Host "  API: $ApiOrigin"
Write-Host "  WS:  $WsOrigin"
