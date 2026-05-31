param(
  [string]$Port = $env:LCC_API_PORT,
  [string]$OsAgentRegistry = $env:LCC_OS_AGENT_REGISTRY,
  [string]$MaxActiveSessions = $(if ($env:LCC_MAX_ACTIVE_SESSIONS) { $env:LCC_MAX_ACTIVE_SESSIONS } else { "20" })
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\.."
$script = Join-Path $PSScriptRoot "dev-api.ps1"

if (-not (Test-Path -LiteralPath $script)) {
  throw "dev-api.ps1 not found."
}

Start-Process powershell.exe `
  -Verb RunAs `
  -WorkingDirectory $root `
  -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"& '$script' -Port '$Port' -OsAgentRegistry '$OsAgentRegistry' -MaxActiveSessions '$MaxActiveSessions'`""
