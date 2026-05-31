$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\.."
$script = Join-Path $PSScriptRoot "dev-api.ps1"

if (-not (Test-Path -LiteralPath $script)) {
  throw "dev-api.ps1 not found."
}

Start-Process powershell.exe `
  -Verb RunAs `
  -WorkingDirectory $root `
  -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
