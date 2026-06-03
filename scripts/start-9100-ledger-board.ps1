param(
  [string]$Port = "9100",
  [ValidateSet("Normal", "Minimized")]
  [string]$WindowStyle = "Minimized",
  [switch]$Elevated
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Resolve-Path "$PSScriptRoot\.."
$ServerScript = Join-Path $Root "tools\ceo-ledger-board-server.cjs"

if (-not (Test-Path -LiteralPath $ServerScript)) {
  throw "9100 ledger board server not found: $ServerScript"
}

if ($Elevated) {
  Start-Process -FilePath "powershell.exe" `
    -Verb RunAs `
    -WorkingDirectory $Root `
    -WindowStyle $WindowStyle `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"`$env:CEO_LEDGER_PORT='$Port'; node tools\ceo-ledger-board-server.cjs`""
  Write-Host "Requested elevated visible 9100 ledger board on http://127.0.0.1:$Port"
  Write-Host "Approve the Windows UAC prompt in the interactive user session."
  exit 0
}

$env:CEO_LEDGER_PORT = $Port
Write-Host "Starting visible 9100 ledger board on http://127.0.0.1:$Port"
node $ServerScript
