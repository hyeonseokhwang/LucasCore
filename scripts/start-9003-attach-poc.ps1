param(
  [string]$AgentId = "test-agent-1",
  [string]$Name = "Test Agent 1",
  [string]$Team = "os-agent-test",
  [string]$Model = "gpt-5.4",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 19101,
  [string]$Cwd = "workspaces/test-agent-1/repo",
  [string]$RegistryPath = "",
  [string]$LogDir = "",
  [string]$RunnerPath = "",
  [switch]$ForceRegistryUpsertOnly
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Resolve-Path "$PSScriptRoot\.."
if (-not $RegistryPath) {
  $RegistryPath = Join-Path $Root "data\os-agents-9003\registry.json"
} elseif (-not [System.IO.Path]::IsPathRooted($RegistryPath)) {
  $RegistryPath = Join-Path $Root $RegistryPath
}

if (-not $LogDir) {
  $LogDir = Join-Path $Root "data\os-agents-9003\logs"
} elseif (-not [System.IO.Path]::IsPathRooted($LogDir)) {
  $LogDir = Join-Path $Root $LogDir
}

if (-not $RunnerPath) {
  $RunnerPath = Join-Path $Root "target-os-agent-runner\debug\os_agent_runner.exe"
  if (-not (Test-Path -LiteralPath $RunnerPath)) {
    $RunnerPath = Join-Path $Root "target-attach-poc\debug\os_agent_runner.exe"
  }
} elseif (-not [System.IO.Path]::IsPathRooted($RunnerPath)) {
  $RunnerPath = Join-Path $Root $RunnerPath
}

function Convert-ToRootRelative {
  param([string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $rootPath = [System.IO.Path]::GetFullPath($Root)
  if (-not $rootPath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $rootPath = $rootPath + [System.IO.Path]::DirectorySeparatorChar
  }
  $rootUri = New-Object System.Uri($rootPath)
  $pathUri = New-Object System.Uri($fullPath)
  return [System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($pathUri).ToString()).Replace("\", "/")
}

function Read-Registry {
  if (-not (Test-Path -LiteralPath $RegistryPath)) {
    return @()
  }
  $raw = Get-Content -LiteralPath $RegistryPath -Raw -Encoding UTF8
  if (-not $raw.Trim()) {
    return @()
  }
  $value = $raw.TrimStart([char]0xfeff) | ConvertFrom-Json
  $records = @()
  foreach ($item in @($value)) {
    if ($item.id) {
      $records += $item
    } elseif ($item.value) {
      foreach ($nested in @($item.value)) {
        if ($nested.id) {
          $records += $nested
        }
      }
    }
  }
  return $records
}

function Write-Registry {
  param([array]$Records)
  $registryDir = Split-Path -Parent $RegistryPath
  New-Item -ItemType Directory -Force -Path $registryDir | Out-Null
  $json = @($Records | Where-Object { $_.id } | Sort-Object id) | ConvertTo-Json -Depth 12
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $tmpPath = "$RegistryPath.tmp"
  [System.IO.File]::WriteAllText($tmpPath, $json, $utf8NoBom)
  if (Test-Path -LiteralPath $RegistryPath) {
    $backupPath = "$RegistryPath.bak"
    [System.IO.File]::Replace($tmpPath, $RegistryPath, $backupPath, $false)
    if (Test-Path -LiteralPath $backupPath) {
      Remove-Item -LiteralPath $backupPath -Force
    }
  } else {
    [System.IO.File]::Move($tmpPath, $RegistryPath)
  }
}

function Test-RunnerHealth {
  param([string]$BaseUrl)
  try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 2
    return [bool]($response.id -eq $AgentId)
  } catch {
    return $false
  }
}

function Test-ProcessAlive {
  param([object]$ProcessId)
  if (-not $ProcessId) {
    return $false
  }
  try {
    return [bool](Get-Process -Id ([int]$ProcessId) -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

function Get-PortFromUrl {
  param([string]$Url)
  if (-not $Url) {
    return $null
  }
  try {
    return ([System.Uri]$Url).Port
  } catch {
    return $null
  }
}

function Quote-ProcessArgument {
  param([string]$Value)
  if ($null -eq $Value) {
    return '""'
  }
  return '"' + ($Value -replace '\\(?=")', '\' -replace '"', '\"') + '"'
}

function Upsert-AttachRegistry {
  param([object]$ProcessId)

  $now = (Get-Date).ToUniversalTime().ToString("o")
  $controlUrl = "http://${HostName}:$Port"
  $writeUrl = "$controlUrl/write"
  $logPath = Join-Path $LogDir "$AgentId.ansi.log"
  $errPath = Join-Path $LogDir "$AgentId.err.log"
  $cwdRelative = $Cwd.Replace("\", "/")

  $records = @(Read-Registry)
  $byId = @{}
  foreach ($record in $records) {
    if ($record.id) {
      $byId[$record.id] = $record
    }
  }

  $existing = $byId[$AgentId]
  $createdAt = $now
  if ($existing -and $existing.created_at) {
    $createdAt = $existing.created_at
  }

  $record = [ordered]@{
    id = $AgentId
    name = $Name
    team = $Team
    cwd = $cwdRelative
    cmd = "codex.cmd"
    args = @("--model", $Model, "--cd", ".", "--no-alt-screen", "--dangerously-bypass-approvals-and-sandbox")
    model = $Model
    pid = if ($ProcessId) { [int]$ProcessId } elseif ($existing -and $existing.pid) { [int]$existing.pid } else { $null }
    status = "active"
    log_path = (Convert-ToRootRelative -Path $logPath)
    err_path = (Convert-ToRootRelative -Path $errPath)
    io_mode = "os-runner-pty"
    input_mode = "http-write"
    log_mode = "runner-tail"
    control_url = $controlUrl
    write_url = $writeUrl
    attach_url = $controlUrl
    runner_endpoint = $controlUrl
    created_at = $createdAt
    updated_at = $now
  }

  $byId[$AgentId] = [pscustomobject]$record
  Write-Registry -Records @($byId.Values)
  return [pscustomobject]$record
}

$controlUrl = "http://${HostName}:$Port"
$registryDir = Split-Path -Parent $RegistryPath
$agentCwd = if ([System.IO.Path]::IsPathRooted($Cwd)) { $Cwd } else { Join-Path $Root $Cwd }

New-Item -ItemType Directory -Force -Path $registryDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $agentCwd | Out-Null

if (-not (Test-Path -LiteralPath $RunnerPath)) {
  throw "Runner not found: $RunnerPath. Build it first with: cargo build --bin os_agent_runner --target-dir target-os-agent-runner"
}

$records = @(Read-Registry)
$existing = @($records | Where-Object { $_.id -eq $AgentId } | Select-Object -First 1)
$existingPort = Get-PortFromUrl -Url $existing.control_url
if (-not $PSBoundParameters.ContainsKey("Port") -and $existingPort) {
  $Port = [int]$existingPort
  $controlUrl = "http://${HostName}:$Port"
}
$existingPid = if ($existing -and $existing.pid) { [int]$existing.pid } else { $null }
$runnerStarted = $false
$processId = $existingPid

if (-not $ForceRegistryUpsertOnly) {
  if (Test-RunnerHealth -BaseUrl $controlUrl) {
    Write-Host "Runner already healthy: $controlUrl"
  } else {
    $portOwner = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($portOwner) {
      throw "Port $Port is already listening by PID $($portOwner.OwningProcess), but $controlUrl/health did not identify $AgentId."
    }

    $runnerOut = Join-Path $LogDir "$AgentId.runner.out.log"
    $runnerErr = Join-Path $LogDir "$AgentId.runner.err.log"
    $arguments = @(
      "--id", $AgentId,
      "--name", $Name,
      "--team", $Team,
      "--cwd", $agentCwd,
      "--cmd", "codex.cmd",
      "--model", $Model,
      "--host", $HostName,
      "--port", "$Port",
      "--registry", $RegistryPath,
      "--log-dir", $LogDir
    )
    $argumentLine = ($arguments | ForEach-Object { Quote-ProcessArgument -Value $_ }) -join " "

    $process = Start-Process -FilePath $RunnerPath `
      -ArgumentList $argumentLine `
      -WorkingDirectory $Root `
      -WindowStyle Hidden `
      -RedirectStandardOutput $runnerOut `
      -RedirectStandardError $runnerErr `
      -PassThru

    $runnerStarted = $true
    $processId = $process.Id
    $deadline = (Get-Date).AddSeconds(15)
    do {
      Start-Sleep -Milliseconds 300
      if (Test-RunnerHealth -BaseUrl $controlUrl) {
        break
      }
    } while ((Get-Date) -lt $deadline)

    if (-not (Test-RunnerHealth -BaseUrl $controlUrl)) {
      throw "Runner PID $processId did not become healthy at $controlUrl/health within 15 seconds. Check $runnerErr"
    }
  }
}

if ($processId -and -not (Test-ProcessAlive -ProcessId $processId)) {
  $processId = $null
}

$record = Upsert-AttachRegistry -ProcessId $processId

([pscustomobject]@{
  agent_id = $AgentId
  runner_started = $runnerStarted
  runner_pid = $record.pid
  control_url = $record.control_url
  write_url = $record.write_url
  io_mode = $record.io_mode
  registry = $RegistryPath
}) | ConvertTo-Json -Depth 8
