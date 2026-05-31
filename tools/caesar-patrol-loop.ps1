$ErrorActionPreference = "Continue"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogDir = Join-Path $Root "data\system-logs"
$LogPath = Join-Path $LogDir "caesar-patrol-loop.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $Root

while ($true) {
  $at = Get-Date -Format o
  Add-Content -Path $LogPath -Encoding UTF8 -Value "[$at] Caesar patrol tick"
  $output = & node tools\caesar-patrol.cjs 2>&1 | Out-String
  if ($output.Trim().Length -gt 0) {
    Add-Content -Path $LogPath -Encoding UTF8 -Value $output.TrimEnd()
  }
  Start-Sleep -Seconds 120
}
