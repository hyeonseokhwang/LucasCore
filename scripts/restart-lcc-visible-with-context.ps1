param(
  [string]$ContextDir = "",
  [string]$HostName = "127.0.0.1",
  [string]$WebPort = "9000",
  [string]$ApiPort = "9001",
  [string]$LedgerPort = "9100",
  [switch]$ApplyRestart,
  [switch]$ForceStop,
  [switch]$ElevatedWeb,
  [switch]$ElevatedApi,
  [switch]$ElevatedLedger,
  [ValidateSet("Normal", "Minimized")]
  [string]$ChildWindowStyle = "Minimized"
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Resolve-Path "$PSScriptRoot\.."
if (-not $ContextDir) {
  $latest = Get-ChildItem -LiteralPath (Join-Path $Root "data\system-logs") -Directory -Filter "restart-context-*" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) {
    throw "No restart-context-* directory found under data\system-logs."
  }
  $ContextDir = $latest.FullName
}

if (-not [System.IO.Path]::IsPathRooted($ContextDir)) {
  $ContextDir = Join-Path $Root $ContextDir
}
$ContextDir = (Resolve-Path -LiteralPath $ContextDir).Path
$PostDir = Join-Path $ContextDir "post-restart"
New-Item -ItemType Directory -Force -Path $PostDir | Out-Null

function Write-RestartLog {
  param([string]$Message)
  $line = "$((Get-Date).ToUniversalTime().ToString("o")) $Message"
  Add-Content -Encoding UTF8 -LiteralPath (Join-Path $PostDir "restart-run.log") -Value $line
  Write-Host $line
}

function Get-Listeners {
  Get-NetTCPConnection -LocalPort @([int]$WebPort, [int]$ApiPort, [int]$LedgerPort) -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalPort,OwningProcess |
    Sort-Object LocalPort
}

function Get-ProcessSessionInfo {
  param([int]$ProcessId)
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $proc) { return $null }
  $runtime = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  [pscustomobject]@{
    pid = $ProcessId
    name = $proc.Name
    session_id = if ($runtime) { $runtime.SessionId } else { $null }
    command_line = $proc.CommandLine
  }
}

function Get-PortProcessInfo {
  @(Get-Listeners) | ForEach-Object {
    $info = Get-ProcessSessionInfo -ProcessId ([int]$_.OwningProcess)
    [pscustomobject]@{
      port = $_.LocalPort
      pid = $_.OwningProcess
      session_id = $info.session_id
      name = $info.name
      command_line = $info.command_line
    }
  }
}

function Stop-ListenerPort {
  param([string]$Port)
  $listeners = @(Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $procId = [int]$listener.OwningProcess
    if ($procId -le 0) { continue }
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { "unknown" }
    Write-RestartLog "stopping port=$Port pid=$procId process=$name"
    if ($ForceStop) {
      Stop-Process -Id $procId -Force
    } elseif ($proc -and $proc.CloseMainWindow()) {
      Start-Sleep -Seconds 5
      if (-not $proc.HasExited) {
        throw "port=$Port pid=$procId did not exit after CloseMainWindow. Re-run with -ForceStop only after recording approval/evidence."
      }
    } else {
      throw "port=$Port pid=$procId has no closable main window. Re-run with -ForceStop only after recording approval/evidence."
    }
  }
}

function Wait-PortState {
  param(
    [string]$Port,
    [bool]$ShouldListen,
    [int]$TimeoutSeconds = 60
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $listening = @(Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue).Count -gt 0
    if ($listening -eq $ShouldListen) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

Write-RestartLog "restart begin context=$ContextDir"
$before = @(Get-Listeners)
$before | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $PostDir "before-ports.json")
Get-PortProcessInfo | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $PostDir "before-processes.json")
Write-RestartLog "before listeners: $($before | ConvertTo-Json -Compress)"

if ($ApplyRestart) {
  Write-RestartLog "restart requested applyRestart=true forceStop=$([bool]$ForceStop)"
  Stop-ListenerPort -Port $WebPort
  Stop-ListenerPort -Port $LedgerPort
  Stop-ListenerPort -Port $ApiPort

  foreach ($port in @($WebPort, $ApiPort, $LedgerPort)) {
    if (-not (Wait-PortState -Port $port -ShouldListen $false -TimeoutSeconds 20)) {
      Write-RestartLog "warning port=$port still appears listening after stop window"
    }
  }
} else {
  Write-RestartLog "applyRestart=false; no listener will be stopped. Missing ports will be started and existing ports will be verified."
}

if (-not (Wait-PortState -Port $ApiPort -ShouldListen $true -TimeoutSeconds 1) -or -not (Wait-PortState -Port $WebPort -ShouldListen $true -TimeoutSeconds 1)) {
  Write-RestartLog "starting 9001 and 9000 in visible PowerShell windows for user=$env:USERNAME profile=$env:USERPROFILE session=$((Get-Process -Id $PID).SessionId)"
  $coreArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\start-lcc-core.ps1`" -HostName `"$HostName`" -WebPort `"$WebPort`" -ApiPort `"$ApiPort`" -ChildWindowStyle `"$ChildWindowStyle`""
  if ($ElevatedWeb) { $coreArgs += " -ElevatedWeb" }
  if ($ElevatedApi) { $coreArgs += " -ElevatedApi" }
  Start-Process -FilePath "powershell.exe" `
    -WorkingDirectory $Root `
    -WindowStyle $ChildWindowStyle `
    -ArgumentList $coreArgs
} else {
  Write-RestartLog "9000 and 9001 already listening; preserving existing processes"
}

if (-not (Wait-PortState -Port $LedgerPort -ShouldListen $true -TimeoutSeconds 1)) {
  Write-RestartLog "starting 9100 in visible PowerShell window for user=$env:USERNAME profile=$env:USERPROFILE session=$((Get-Process -Id $PID).SessionId)"
  $ledgerArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\start-9100-ledger-board.ps1`" -Port `"$LedgerPort`" -WindowStyle `"$ChildWindowStyle`""
  if ($ElevatedLedger) { $ledgerArgs += " -Elevated" }
  Start-Process -FilePath "powershell.exe" `
    -WorkingDirectory $Root `
    -WindowStyle $ChildWindowStyle `
    -ArgumentList $ledgerArgs
} else {
  Write-RestartLog "9100 already listening; preserving existing process"
}

foreach ($port in @($ApiPort, $WebPort, $LedgerPort)) {
  if (-not (Wait-PortState -Port $port -ShouldListen $true -TimeoutSeconds 120)) {
    Write-RestartLog "error port=$port did not become ready"
  } else {
    Write-RestartLog "ready port=$port"
  }
}

Start-Sleep -Seconds 8
$after = @(Get-Listeners)
$after | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $PostDir "after-ports.json")
Get-PortProcessInfo | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $PostDir "after-processes.json")
Write-RestartLog "after listeners: $($after | ConvertTo-Json -Compress)"

try {
  $sessions = Invoke-RestMethod -Uri "http://${HostName}:$ApiPort/api/sessions" -Method Get -TimeoutSec 20
  $sessions | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $PostDir "after-sessions.json")
  Write-RestartLog "after sessions fetched"
} catch {
  Write-RestartLog "after sessions fetch failed: $($_.Exception.Message)"
}

try {
  $ledger = Invoke-RestMethod -Uri "http://${HostName}:$LedgerPort/health" -Method Get -TimeoutSec 10
  $ledger | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $PostDir "after-9100-health.json")
  Write-RestartLog "9100 health fetched"
} catch {
  Write-RestartLog "9100 health failed: $($_.Exception.Message)"
}

Write-RestartLog "restart complete"
