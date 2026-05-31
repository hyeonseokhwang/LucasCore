param(
  [string]$AgentId = "test-agent-1",
  [string]$Api9002 = "http://127.0.0.1:9002",
  [string]$Api9004 = "http://127.0.0.1:9004",
  [int]$RunnerPort = 19101,
  [string]$RunnerBase = "",
  [Alias("Start9003Script")]
  [string]$Start9004Script = "",
  [int]$TimeoutSec = 30,
  [Alias("Skip9003Restart")]
  [switch]$Skip9004Restart
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Resolve-Path "$PSScriptRoot\.."
if (-not $RunnerBase) {
  $RunnerBase = "http://127.0.0.1:$RunnerPort"
}
if (-not $Start9004Script) {
  $Start9004Script = Join-Path $PSScriptRoot "start-9004-os-control-plane.ps1"
} elseif (-not [System.IO.Path]::IsPathRooted($Start9004Script)) {
  $Start9004Script = Join-Path $Root $Start9004Script
}

$VerifyId = "verify-9003-attach-poc-{0}" -f ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$Start9004Out = Join-Path $Root "data\os-agents-9004\verify-9004-api.out.log"
$Start9004Err = Join-Path $Root "data\os-agents-9004\verify-9004-api.err.log"

function Write-Pass {
  param([string]$Name, [string]$Detail = "")
  if ($Detail) {
    Write-Host "[PASS] $Name $Detail"
  } else {
    Write-Host "[PASS] $Name"
  }
}

function Fail {
  param([string]$Message)
  throw "[FAIL] $Message"
}

function Get-ListenPid {
  param([int]$Port)
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $listener) {
    return $null
  }
  return [int]$listener.OwningProcess
}

function Require-ListenPid {
  param([int]$Port, [string]$Name)
  $listenPid = Get-ListenPid -Port $Port
  if (-not $listenPid) {
    Fail "$Name is not listening on port $Port"
  }
  return $listenPid
}

function Invoke-Json {
  param([string]$Uri, [string]$Method = "GET", [object]$Body = $null)
  $params = @{
    Uri = $Uri
    Method = $Method
    TimeoutSec = 5
  }
  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }
  return Invoke-RestMethod @params
}

function Invoke-StatusCode {
  param([string]$Uri, [string]$Method = "POST", [object]$Body = $null)
  $params = @{
    Uri = $Uri
    Method = $Method
    TimeoutSec = 5
  }
  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }
  $response = Invoke-WebRequest @params
  return [int]$response.StatusCode
}

function Quote-ProcessArgument {
  param([string]$Value)
  if ($null -eq $Value) {
    return '""'
  }
  return '"' + ($Value -replace '\\(?=")', '\' -replace '"', '\"') + '"'
}

function Wait-HttpOk {
  param([string]$Uri, [int]$Seconds)
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Uri -Method Get -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        return
      }
    } catch {
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  Fail "Timed out waiting for $Uri"
}

function Get-AgentSession {
  param([string]$ApiBase)
  $sessions = Invoke-Json -Uri "$ApiBase/api/sessions"
  $session = $sessions | Where-Object { $_.id -eq $AgentId } | Select-Object -First 1
  if (-not $session) {
    Fail "$AgentId was not returned by $ApiBase/api/sessions"
  }
  return $session
}

function Assert-AgentInteractive {
  param([string]$ApiBase)
  $session = Get-AgentSession -ApiBase $ApiBase
  if ($session.interactive -ne $true) {
    $actual = if ($null -eq $session.interactive) { "<missing>" } else { "$($session.interactive)" }
    Fail "$AgentId interactive must be true on $ApiBase; actual=$actual"
  }
  Write-Pass "AGENT_INTERACTIVE_TRUE" "api=$ApiBase agent=$AgentId source=$($session.source) pid=$($session.pid)"
  return $session
}

function Assert-Write200 {
  param([string]$ApiBase, [string]$Marker)
  $status = Invoke-StatusCode -Uri "$ApiBase/api/sessions/$AgentId/write" -Method POST -Body @{ input = $Marker }
  if ($status -ne 200) {
    Fail "POST $ApiBase/api/sessions/$AgentId/write returned $status"
  }
  Write-Pass "WRITE_200" "api=$ApiBase agent=$AgentId marker=$Marker"
}

function Get-RunnerLogText {
  $log = Invoke-Json -Uri "$RunnerBase/log?tail=262144"
  if ($null -ne $log.data) {
    return [string]$log.data
  }
  if ($null -ne $log.text) {
    return [string]$log.text
  }
  return ($log | ConvertTo-Json -Depth 8)
}

function Assert-RunnerLogContains {
  param([string]$Marker)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    try {
      $text = Get-RunnerLogText
      if ($text.Contains($Marker)) {
        Write-Pass "RUNNER_LOG_MARKER" "runner=$RunnerBase marker=$Marker"
        return
      }
    } catch {
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  Fail "Runner log at $RunnerBase/log did not contain marker=$Marker within $TimeoutSec seconds"
}

function Restart-9004Only {
  param([int]$Before9002Pid, [int]$Before9004Pid)

  if (-not (Test-Path -LiteralPath $Start9004Script)) {
    Fail "Start9004Script not found: $Start9004Script"
  }
  if ($Before9004Pid -eq $Before9002Pid) {
    Fail "Refusing restart: 9004 API PID equals 9002 PID ($Before9004Pid)"
  }

  Stop-Process -Id $Before9004Pid -Force
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    Start-Sleep -Milliseconds 300
    $current9004 = Get-ListenPid -Port 9004
    if (-not $current9004) {
      break
    }
  } while ((Get-Date) -lt $deadline)

  if (Get-ListenPid -Port 9004) {
    Fail "9004 API PID $Before9004Pid did not stop within $TimeoutSec seconds"
  }

  $stale9004Processes = Get-CimInstance Win32_Process -Filter "name='lcc-core-api.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -like "*target-9004*" -and [int]$_.ProcessId -ne $Before9002Pid }
  foreach ($process in @($stale9004Processes)) {
    Stop-Process -Id ([int]$process.ProcessId) -Force
  }

  $still9002 = Require-ListenPid -Port 9002 -Name "9002 control plane"
  if ($still9002 -ne $Before9002Pid) {
    Fail "9002 PID changed during 9004 API stop; before=$Before9002Pid after=$still9002"
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Start9004Out) | Out-Null
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $Start9004Script,
    "-ApiOnly"
  )
  $argumentLine = ($args | ForEach-Object { Quote-ProcessArgument -Value $_ }) -join " "
  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList $argumentLine `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $Start9004Out `
    -RedirectStandardError $Start9004Err `
    -PassThru

  Wait-HttpOk -Uri "$Api9004/api/health" -Seconds $TimeoutSec
  $after9004 = Require-ListenPid -Port 9004 -Name "9004 API"
  if ($after9004 -eq $Before9002Pid) {
    Fail "9004 API restarted onto the 9002 PID ($after9004), refusing to continue"
  }
  Write-Pass "RESTART_9004_ONLY" "web_port=9003 api_old_pid=$Before9004Pid api_new_pid=$after9004 launcher_pid=$($process.Id)"
  return $after9004
}

Wait-HttpOk -Uri "$Api9002/api/health" -Seconds $TimeoutSec
$pid9002Before = Require-ListenPid -Port 9002 -Name "9002 control plane"
Write-Pass "9002_PID_BASELINE" "pid=$pid9002Before"

Wait-HttpOk -Uri "$Api9004/api/health" -Seconds $TimeoutSec
$pid9004Before = Require-ListenPid -Port 9004 -Name "9004 API"
if ($pid9004Before -eq $pid9002Before) {
  Fail "9004 API PID equals 9002 PID ($pid9004Before)"
}
Write-Pass "9004_PID_PRESENT" "web_port=9003 api_pid=$pid9004Before"

Wait-HttpOk -Uri "$RunnerBase/health" -Seconds $TimeoutSec
$runnerListenerPidBefore = Require-ListenPid -Port $RunnerPort -Name "runner"
$runnerStatusBefore = Invoke-Json -Uri "$RunnerBase/status"
Write-Pass "RUNNER_PID_PRESENT" "listener_pid=$runnerListenerPidBefore child_pid=$($runnerStatusBefore.pid) endpoint=$RunnerBase"

$sessionBefore = Assert-AgentInteractive -ApiBase $Api9004
$markerBefore = "$VerifyId-before"
Assert-Write200 -ApiBase $Api9004 -Marker $markerBefore
Assert-RunnerLogContains -Marker $markerBefore

if (-not $Skip9004Restart) {
  $pid9004After = Restart-9004Only -Before9002Pid $pid9002Before -Before9004Pid $pid9004Before
  $runnerListenerPidAfter = Require-ListenPid -Port $RunnerPort -Name "runner"
  if ($runnerListenerPidAfter -ne $runnerListenerPidBefore) {
    Fail "Runner listener PID changed across 9004 API restart; before=$runnerListenerPidBefore after=$runnerListenerPidAfter"
  }
  Write-Pass "RUNNER_PID_PRESERVED" "listener_pid=$runnerListenerPidAfter"

  $sessionAfter = Assert-AgentInteractive -ApiBase $Api9004
  $markerAfter = "$VerifyId-after"
  Assert-Write200 -ApiBase $Api9004 -Marker $markerAfter
  Assert-RunnerLogContains -Marker $markerAfter
  Write-Pass "WRITE_200_AFTER_9004_RESTART" "web_port=9003 api=$Api9004 agent=$AgentId marker=$markerAfter session_pid=$($sessionAfter.pid) api_pid=$pid9004After"
} else {
  Write-Host "[SKIP] RESTART_9004_ONLY Skip9004Restart was set"
}

$pid9002After = Require-ListenPid -Port 9002 -Name "9002 control plane"
if ($pid9002After -ne $pid9002Before) {
  Fail "9002 PID changed; before=$pid9002Before after=$pid9002After"
}
Write-Pass "9002_PID_PRESERVED" "pid=$pid9002After"
Write-Pass "VERIFY_9003_ATTACH_POC_COMPLETE" "web_port=9003 api=$Api9004 agent=$AgentId runner=$RunnerBase"
