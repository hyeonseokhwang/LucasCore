param(
  [string]$Port = "9000",
  [string]$ApiOrigin = "http://127.0.0.1:9001",
  [string]$WsOrigin = "",
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Resolve-Path "$PSScriptRoot\.."
$WebRoot = Join-Path $Root "apps\web"
if (-not $WsOrigin) {
  $WsOrigin = $ApiOrigin -replace "^http:", "ws:" -replace "^https:", "wss:"
}

$env:VITE_LCC_API_ORIGIN = $ApiOrigin
$env:VITE_LCC_WS_ORIGIN = $WsOrigin
$env:LCC_API_ORIGIN = $ApiOrigin
$env:LCC_WS_ORIGIN = $WsOrigin

Write-Host "Starting LCC web UI on http://${HostName}:$Port"
Write-Host "API origin: $ApiOrigin"
Write-Host "WS origin:  $WsOrigin"

$vite = Join-Path $Root "apps\web\node_modules\.bin\vite.exe"
if (Test-Path -LiteralPath $vite) {
  Push-Location $WebRoot
  try {
    & $vite --host $HostName --port $Port
    exit $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

& (Join-Path $PSScriptRoot "bun.ps1") --cwd $WebRoot vite --host $HostName --port $Port
