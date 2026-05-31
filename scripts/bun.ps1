$ErrorActionPreference = "Stop"

$bun = Get-Command bun -ErrorAction SilentlyContinue
if ($bun) {
  & $bun.Source @args
  exit $LASTEXITCODE
}

$wingetBun = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter bun.exe -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $wingetBun) {
  throw "bun.exe not found. Install with: winget install --id Oven-sh.Bun -e --source winget"
}

& $wingetBun @args
