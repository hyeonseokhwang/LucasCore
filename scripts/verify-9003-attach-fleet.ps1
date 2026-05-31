param(
  [string[]]$AgentIds = @("test-agent-1", "test-agent-2", "test-agent-3", "test-agent-4"),
  [string]$Api9002 = "http://127.0.0.1:9002",
  [string]$Api9004 = "http://127.0.0.1:9004",
  [int]$BaseRunnerPort = 19101,
  [Alias("Start9003Script")]
  [string]$Start9004Script = "",
  [int]$TimeoutSec = 45,
  [Alias("Skip9003Restart")]
  [switch]$Skip9004Restart
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Resolve-Path "$PSScriptRoot\.."
if (-not $Start9004Script) {
  $Start9004Script = Join-Path $PSScriptRoot "start-9004-os-control-plane.ps1"
} elseif (-not [System.IO.Path]::IsPathRooted($Start9004Script)) {
  $Start9004Script = Join-Path $Root $Start9004Script
}

$Start9004Out = Join-Path $Root "data\os-agents-9004\verify-9004-fleet-api.out.log"
$Start9004Err = Join-Path $Root "data\os-agents-9004\verify-9004-fleet-api.err.log"
$VerifyId = "verify-9003-fleet-{0}" -f ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$ReportPath = Join-Path $Root "data\os-agents-9004\$VerifyId.report.log"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReportPath) | Out-Null
Set-Content -LiteralPath $ReportPath -Encoding UTF8 -Value "VERIFY_9003_ATTACH_FLEET report_id=$VerifyId started=$([DateTimeOffset]::UtcNow.ToString('o')) web=9003 api=9004"

function Write-Pass {
  param([string]$Name, [string]$Detail = "")
  $line = ""
  if ($Detail) {
    $line = "[PASS] $Name $Detail"
  } else {
    $line = "[PASS] $Name"
  }
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
  Add-Content -LiteralPath $ReportPath -Encoding UTF8 -Value $line
}

function Fail {
  param([string]$Message)
  Add-Content -LiteralPath $ReportPath -Encoding UTF8 -Value "[FAIL] $Message"
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
  $attempts = 0
  $lastError = $null
  while ($attempts -lt 4) {
    $attempts += 1
    try {
      $params = @{
        Uri = $Uri
        Method = $Method
        TimeoutSec = 8
      }
      if ($null -ne $Body) {
        $params.ContentType = "application/json; charset=utf-8"
        $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
      }
      return Invoke-RestMethod @params
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds (250 * $attempts)
      if ($Uri -like "$Api9004/*") {
        try { Wait-HttpOk -Uri "$Api9004/api/health" -Seconds 5 } catch {}
      }
    }
  }
  throw $lastError
}

function Invoke-StatusCode {
  param([string]$Uri, [string]$Method = "POST", [object]$Body = $null)
  $attempts = 0
  $lastError = $null
  while ($attempts -lt 4) {
    $attempts += 1
    try {
      $params = @{
        Uri = $Uri
        Method = $Method
        TimeoutSec = 8
      }
      if ($null -ne $Body) {
        $params.ContentType = "application/json; charset=utf-8"
        $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
      }
      return [int](Invoke-WebRequest @params).StatusCode
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds (250 * $attempts)
      if ($Uri -like "$Api9004/*") {
        try { Wait-HttpOk -Uri "$Api9004/api/health" -Seconds 5 } catch {}
      }
    }
  }
  throw $lastError
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

function Quote-ProcessArgument {
  param([string]$Value)
  if ($null -eq $Value) {
    return '""'
  }
  return '"' + ($Value -replace '\\(?=")', '\' -replace '"', '\"') + '"'
}

function Get-AgentSession {
  param([string]$AgentId)
  $sessions = Invoke-Json -Uri "$Api9004/api/sessions"
  $session = $sessions | Where-Object { $_.id -eq $AgentId } | Select-Object -First 1
  if (-not $session) {
    Fail "$AgentId was not returned by $Api9004/api/sessions"
  }
  return $session
}

function Assert-AgentAttachedInteractive {
  param([string]$AgentId, [int]$ExpectedPid)
  $session = Get-AgentSession -AgentId $AgentId
  if ($session.source -ne "os") {
    Fail "$AgentId source expected os; actual=$($session.source)"
  }
  if ($session.attached -ne $true) {
    Fail "$AgentId attached expected true; actual=$($session.attached)"
  }
  if ($session.interactive -ne $true) {
    Fail "$AgentId interactive expected true; actual=$($session.interactive)"
  }
  if ([int]$session.pid -ne $ExpectedPid) {
    Fail "$AgentId pid expected $ExpectedPid; actual=$($session.pid)"
  }
  if ($session.input_disabled_reason) {
    Fail "$AgentId input_disabled_reason expected null; actual=$($session.input_disabled_reason)"
  }
  Write-Pass "SESSION_ATTACHED_INTERACTIVE" "agent=$AgentId pid=$($session.pid) source=$($session.source) model=$($session.model)"
}

function Get-RunnerLogText {
  param([int]$Port)
  $log = Invoke-Json -Uri "http://127.0.0.1:$Port/log?tail=262144"
  if ($null -ne $log.data) {
    return [string]$log.data
  }
  return ($log | ConvertTo-Json -Depth 8)
}

function Test-LogContainsMarker {
  param([string]$Text, [string]$Marker)
  if ($Text.Contains($Marker)) {
    return $true
  }
  $compactText = [regex]::Replace($Text, "\s+", "")
  $compactMarker = [regex]::Replace($Marker, "\s+", "")
  return $compactText.Contains($compactMarker)
}

function Assert-WriteAndLog {
  param([string]$AgentId, [int]$Port, [string]$Marker)
  $status = Invoke-StatusCode -Uri "$Api9004/api/sessions/$AgentId/write" -Method POST -Body @{ input = $Marker }
  if ($status -ne 200) {
    Fail "$AgentId write returned HTTP $status"
  }
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $text = Get-RunnerLogText -Port $Port
    if (Test-LogContainsMarker -Text $text -Marker $Marker) {
      Write-Pass "WRITE_AND_LOG" "agent=$AgentId port=$Port marker=$Marker"
      return
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  Fail "$AgentId runner log did not contain marker=$Marker"
}

function Assert-DetachAttach {
  param([string]$AgentId)
  $detachStatus = Invoke-StatusCode -Uri "$Api9004/api/os-agents/$AgentId/detach" -Method POST
  if ($detachStatus -ne 200) {
    Fail "$AgentId detach returned HTTP $detachStatus"
  }
  $all = Invoke-Json -Uri "$Api9004/api/os-agents"
  $detached = $all | Where-Object { $_.id -eq $AgentId } | Select-Object -First 1
  if (-not $detached -or $detached.attached -ne $false) {
    Fail "$AgentId detach did not set attached=false"
  }
  Write-Pass "DETACH" "agent=$AgentId attached=false"

  $attached = Invoke-Json -Uri "$Api9004/api/os-agents/$AgentId/attach" -Method POST
  if ($attached.attached -ne $true -or $attached.interactive -ne $true) {
    Fail "$AgentId attach did not restore attached interactive state"
  }
  Write-Pass "ATTACH" "agent=$AgentId attached=$($attached.attached) interactive=$($attached.interactive)"
}

function Restart-9004Only {
  param([int]$Before9002Pid, [int]$Before9004Pid)
  if ($Before9004Pid -eq $Before9002Pid) {
    Fail "Refusing restart: 9004 PID equals 9002 PID ($Before9004Pid)"
  }
  Stop-Process -Id $Before9004Pid -Force
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    Start-Sleep -Milliseconds 300
    if (-not (Get-ListenPid -Port 9004)) {
      break
    }
  } while ((Get-Date) -lt $deadline)
  if (Get-ListenPid -Port 9004) {
    Fail "9004 PID $Before9004Pid did not stop"
  }
  $still9002 = Require-ListenPid -Port 9002 -Name "9002 control plane"
  if ($still9002 -ne $Before9002Pid) {
    Fail "9002 PID changed during 9004 stop; before=$Before9002Pid after=$still9002"
  }

  $stale9004Processes = Get-CimInstance Win32_Process -Filter "name='lcc-core-api.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -like "*target-9004*" -and [int]$_.ProcessId -ne $Before9002Pid }
  foreach ($process in @($stale9004Processes)) {
    Stop-Process -Id ([int]$process.ProcessId) -Force
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Start9004Out) | Out-Null
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Start9004Script, "-ApiOnly")
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
    Fail "9004 restarted onto 9002 PID ($after9004)"
  }
  Write-Pass "RESTART_9004_ONLY" "web_port=9003 api_old_pid=$Before9004Pid api_new_pid=$after9004 launcher_pid=$($process.Id)"
}

Wait-HttpOk -Uri "$Api9002/api/health" -Seconds $TimeoutSec
$pid9002Before = Require-ListenPid -Port 9002 -Name "9002 control plane"
Write-Pass "9002_PID_BASELINE" "pid=$pid9002Before"

Wait-HttpOk -Uri "$Api9004/api/health" -Seconds $TimeoutSec
$pid9004Before = Require-ListenPid -Port 9004 -Name "9004 API"
if ($pid9004Before -eq $pid9002Before) {
  Fail "9004 PID equals 9002 PID ($pid9004Before)"
}
Write-Pass "9004_PID_PRESENT" "web_port=9003 api_pid=$pid9004Before"

$runnerPids = @{}
for ($i = 0; $i -lt $AgentIds.Count; $i++) {
  $agentId = $AgentIds[$i]
  $port = $BaseRunnerPort + $i
  Wait-HttpOk -Uri "http://127.0.0.1:$port/health" -Seconds $TimeoutSec
  $runnerPid = Require-ListenPid -Port $port -Name "$agentId runner"
  $runnerPids[$agentId] = $runnerPid
  $status = Invoke-Json -Uri "http://127.0.0.1:$port/status"
  Write-Pass "RUNNER_PRESENT" "agent=$agentId port=$port listener_pid=$runnerPid child_pid=$($status.pid)"
  Assert-AgentAttachedInteractive -AgentId $agentId -ExpectedPid $runnerPid
  Assert-DetachAttach -AgentId $agentId
  Assert-AgentAttachedInteractive -AgentId $agentId -ExpectedPid $runnerPid
  Assert-WriteAndLog -AgentId $agentId -Port $port -Marker "$VerifyId-$agentId-before"
}

if (-not $Skip9004Restart) {
  Restart-9004Only -Before9002Pid $pid9002Before -Before9004Pid $pid9004Before
  for ($i = 0; $i -lt $AgentIds.Count; $i++) {
    $agentId = $AgentIds[$i]
    $port = $BaseRunnerPort + $i
    $runnerPid = Require-ListenPid -Port $port -Name "$agentId runner"
    if ($runnerPid -ne $runnerPids[$agentId]) {
      Fail "$agentId runner PID changed across 9004 API restart; before=$($runnerPids[$agentId]) after=$runnerPid"
    }
    Write-Pass "RUNNER_PID_PRESERVED" "agent=$agentId port=$port pid=$runnerPid"
    Assert-AgentAttachedInteractive -AgentId $agentId -ExpectedPid $runnerPid
    Assert-WriteAndLog -AgentId $agentId -Port $port -Marker "$VerifyId-$agentId-after"
  }
}

$pid9002After = Require-ListenPid -Port 9002 -Name "9002 control plane"
if ($pid9002After -ne $pid9002Before) {
  Fail "9002 PID changed; before=$pid9002Before after=$pid9002After"
}
Write-Pass "9002_PID_PRESERVED" "pid=$pid9002After"
Write-Pass "VERIFY_9003_ATTACH_FLEET_COMPLETE" "web_port=9003 api=$Api9004 agents=$($AgentIds -join ',')"
