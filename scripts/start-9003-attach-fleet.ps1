param(
  [string[]]$AgentIds = @("test-agent-1", "test-agent-2", "test-agent-3", "test-agent-4"),
  [string]$Team = "os-agent-test",
  [string]$Model = "gpt-5.4",
  [string]$HostName = "127.0.0.1",
  [int]$BasePort = 19101,
  [string]$CwdRoot = "workspaces",
  [string]$RegistryPath = "",
  [string]$LogDir = "",
  [string]$RunnerPath = "",
  [switch]$ForceRegistryUpsertOnly
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Resolve-Path "$PSScriptRoot\.."
$StartPocScript = Join-Path $PSScriptRoot "start-9003-attach-poc.ps1"
if (-not (Test-Path -LiteralPath $StartPocScript)) {
  throw "Attach POC script not found: $StartPocScript"
}

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

function Get-NormalizedAgentIds {
  param([string[]]$Values)

  $normalized = @()
  foreach ($value in @($Values)) {
    foreach ($part in @($value -split ",")) {
      $agentId = $part.Trim()
      if ($agentId) {
        $normalized += $agentId
      }
    }
  }

  if ($normalized.Count -eq 0) {
    throw "At least one agent id is required."
  }

  return $normalized
}

function Get-AgentName {
  param([string]$AgentId)

  if ($AgentId -match "^test-agent-(\d+)$") {
    return "Test Agent $($Matches[1])"
  }

  return ($AgentId -replace "[-_]+", " ")
}

function Get-AgentCwd {
  param([string]$AgentId)

  return (Join-Path (Join-Path $CwdRoot $AgentId) "repo")
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

function Test-RunnerHealth {
  param([string]$BaseUrl, [string]$ExpectedAgentId)
  try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 2
    return [bool]($response.id -eq $ExpectedAgentId)
  } catch {
    return $false
  }
}

function Get-NextAvailablePort {
  param([int]$StartPort, [System.Collections.Generic.HashSet[int]]$ReservedPorts)

  $candidate = $StartPort
  while ($true) {
    if ($ReservedPorts.Contains($candidate)) {
      $candidate++
      continue
    }
    $listener = Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) {
      return $candidate
    }
    $candidate++
  }
}

$normalizedAgentIds = @(Get-NormalizedAgentIds -Values $AgentIds)
$registryRecords = @(Read-Registry)
$registryById = @{}
foreach ($record in $registryRecords) {
  if ($record.id) {
    $registryById[$record.id] = $record
  }
}

$reservedPorts = [System.Collections.Generic.HashSet[int]]::new()
foreach ($record in $registryRecords) {
  $recordPort = Get-PortFromUrl -Url $record.control_url
  if ($recordPort) {
    $null = $reservedPorts.Add([int]$recordPort)
  }
}

$results = @()

for ($index = 0; $index -lt $normalizedAgentIds.Count; $index++) {
  $agentId = $normalizedAgentIds[$index]
  $preferredPort = $BasePort + $index
  $port = $preferredPort
  $existing = $registryById[$agentId]
  $existingPort = if ($existing) { Get-PortFromUrl -Url $existing.control_url } else { $null }
  if ($existingPort -and (Test-RunnerHealth -BaseUrl "http://${HostName}:$existingPort" -ExpectedAgentId $agentId)) {
    $port = [int]$existingPort
  } else {
    $port = Get-NextAvailablePort -StartPort $preferredPort -ReservedPorts $reservedPorts
  }
  $null = $reservedPorts.Add([int]$port)

  $parameters = @{
    AgentId = $agentId
    Name = (Get-AgentName -AgentId $agentId)
    Team = $Team
    Model = $Model
    HostName = $HostName
    Port = $port
    Cwd = (Get-AgentCwd -AgentId $agentId)
    RegistryPath = $RegistryPath
    LogDir = $LogDir
    RunnerPath = $RunnerPath
  }

  if ($ForceRegistryUpsertOnly) {
    $parameters.ForceRegistryUpsertOnly = $true
  }

  $raw = @(& $StartPocScript @parameters)
  $jsonStart = $null
  for ($lineIndex = 0; $lineIndex -lt $raw.Count; $lineIndex++) {
    if ($raw[$lineIndex] -match "^\s*\{") {
      $jsonStart = $lineIndex
      break
    }
  }

  if ($null -eq $jsonStart) {
    throw "Attach POC script did not return JSON for $agentId. Output: $($raw -join [Environment]::NewLine)"
  }

  $jsonText = ($raw[$jsonStart..($raw.Count - 1)] -join [Environment]::NewLine)
  $result = $jsonText | ConvertFrom-Json
  $results += $result
}

([pscustomobject]@{
  agents = $results
  count = $results.Count
  base_port = $BasePort
  registry = if ($results.Count -gt 0) { $results[0].registry } else { $RegistryPath }
}) | ConvertTo-Json -Depth 10
