param(
  [string]$Port = $env:LCC_API_PORT,
  [string]$OsAgentRegistry = $env:LCC_OS_AGENT_REGISTRY,
  [string]$MaxActiveSessions = $(if ($env:LCC_MAX_ACTIVE_SESSIONS) { $env:LCC_MAX_ACTIVE_SESSIONS } else { "20" })
)

$ErrorActionPreference = "Stop"

if (-not $Port) {
  $Port = "9001"
}
$vcvars = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path -LiteralPath $vcvars)) {
  # fallback: Community edition
  $vcvars = "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
}
if (-not (Test-Path -LiteralPath $vcvars)) {
  throw "vcvars64.bat not found. Install Visual Studio Build Tools or Community with C++ workload."
}

$envParts = @(
  'set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"',
  "set `"CARGO_TARGET_DIR=target-$Port`"",
  "set `"LCC_API_PORT=$Port`""
)
if ($MaxActiveSessions) {
  $envParts += "set `"LCC_MAX_ACTIVE_SESSIONS=$MaxActiveSessions`""
}
if ($OsAgentRegistry) {
  $envParts += "set `"LCC_OS_AGENT_REGISTRY=$OsAgentRegistry`""
} else {
  $envParts += 'set "LCC_OS_AGENT_REGISTRY=disabled"'
}

$command = "call `"$vcvars`" && $($envParts -join ' && ') && set `"PATH=%PATH:C:\Program Files\Git\usr\bin;=%`" && cargo run --manifest-path apps/api/Cargo.toml --bin lcc-core-api"
cmd /c $command
