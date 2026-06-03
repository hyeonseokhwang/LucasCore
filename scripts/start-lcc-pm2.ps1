param(
  [switch]$InstallPm2
)

$ErrorActionPreference = "Stop"
$env:PM2_HOME = "C:\Users\hysra\.pm2"
New-Item -ItemType Directory -Force -Path $env:PM2_HOME | Out-Null

$pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
if (-not $pm2) {
  if (-not $InstallPm2) {
    throw "pm2.cmd not found. Re-run with -InstallPm2 to install PM2 globally for the hysra profile."
  }
  npm install -g pm2
  $pm2 = Get-Command pm2.cmd -ErrorAction Stop
}

New-Item -ItemType Directory -Force -Path "data\system-logs\pm2" | Out-Null
& $pm2.Source start ecosystem.config.cjs --only lcc-api-9001,lcc-web-9000,lcc-ledger-9100
& $pm2.Source save --force
& $pm2.Source status
