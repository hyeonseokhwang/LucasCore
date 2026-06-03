param(
  [string]$TaskName = "LucasCore-PM2-Startup"
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Admin privileges required. Run this script from an elevated PowerShell."
}

$Root = Resolve-Path "$PSScriptRoot\.."
$BatPath = Join-Path $PSScriptRoot "pm2-startup.bat"
if (-not (Test-Path -LiteralPath $BatPath)) {
  throw "PM2 startup batch not found: $BatPath"
}

$action = New-ScheduledTaskAction -Execute $BatPath
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Highest

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "LCC Core PM2 startup in the interactive Lucas Windows profile" | Out-Null

Write-Host "Registered $TaskName for user=$env:USERNAME logonType=Interactive runLevel=Highest root=$Root"
