param(
  [string]$LeadModel = "gpt-5.5",
  [string]$WorkerModel = "gpt-5.4",
  [string]$StorageRoot = "",
  [string]$RegistryPath = "",
  [string]$LogDir = "",
  [string]$RunnerPath = "",
  [string]$HostName = "127.0.0.1",
  [int]$BasePort = 19101,
  [switch]$DevelopmentOnly,
  [switch]$SpringMsaOnly,
  [switch]$DevAndSpringMsaOnly,
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

function Resolve-StoragePath {
  param([string]$Path)
  if (-not $Path) {
    return ""
  }
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $Root $Path))
}

function Get-StorageRoot {
  if ($StorageRoot) {
    return Resolve-StoragePath -Path $StorageRoot
  }
  if ($RegistryPath) {
    return Split-Path -Parent (Resolve-StoragePath -Path $RegistryPath)
  }
  if ($LogDir) {
    return Split-Path -Parent (Resolve-StoragePath -Path $LogDir)
  }
  if ($env:LCC_OS_AGENT_REGISTRY) {
    return Split-Path -Parent (Resolve-StoragePath -Path $env:LCC_OS_AGENT_REGISTRY)
  }
  return Join-Path $Root "data\os-agents-9003"
}

$StorageRoot = Get-StorageRoot
if (-not $RegistryPath) {
  $RegistryPath = Join-Path $StorageRoot "registry.json"
} else {
  $RegistryPath = Resolve-StoragePath -Path $RegistryPath
}
if (-not $LogDir) {
  $LogDir = Join-Path $StorageRoot "logs"
} else {
  $LogDir = Resolve-StoragePath -Path $LogDir
}
if (-not $RunnerPath) {
  $RunnerPath = Join-Path $Root "target-os-agent-runner\debug\os_agent_runner.exe"
  if (-not (Test-Path -LiteralPath $RunnerPath)) {
    $RunnerPath = Join-Path $Root "target-attach-poc\debug\os_agent_runner.exe"
  }
} else {
  $RunnerPath = Resolve-StoragePath -Path $RunnerPath
}
if (-not (Test-Path -LiteralPath $RunnerPath)) {
  throw "Runner not found: $RunnerPath. Build it first with: cargo build --bin os_agent_runner --target-dir target-os-agent-runner"
}

$agents = @(
  @{ id = "chief-min"; name = "CHIEF-MIN"; team = "management"; cwd = "workspaces/chief-min/repo" },
  @{ id = "dev-lead"; name = "Dev Lead"; team = "development"; cwd = "workspaces/dev-lead/repo" },
  @{ id = "developer-1"; name = "Developer 1"; team = "development"; cwd = "workspaces/developer-1/repo" },
  @{ id = "developer-2"; name = "Developer 2"; team = "development"; cwd = "workspaces/developer-2/repo" },
  @{ id = "developer-3"; name = "Developer 3"; team = "development"; cwd = "workspaces/developer-3/repo" },
  @{ id = "developer-4"; name = "Developer 4"; team = "development"; cwd = "workspaces/developer-4/repo" },
  @{ id = "joon-msa"; name = "Joon MSA"; team = "spring-msa"; cwd = "workspaces/joon-msa/repo" },
  @{ id = "spring-msa-research-1"; name = "Spring MSA Researcher 1"; team = "spring-msa"; cwd = "workspaces/spring-msa-research-1/repo" },
  @{ id = "spring-msa-research-2"; name = "Spring MSA Researcher 2"; team = "spring-msa"; cwd = "workspaces/spring-msa-research-2/repo" },
  @{ id = "spring-msa-research-3"; name = "Spring MSA Researcher 3"; team = "spring-msa"; cwd = "workspaces/spring-msa-research-3/repo" },
  @{ id = "spring-msa-research-4"; name = "Spring MSA Researcher 4"; team = "spring-msa"; cwd = "workspaces/spring-msa-research-4/repo" }
)

$LeadAgentIds = @("chief-min", "dev-lead")
function Get-AgentModel {
  param([string]$AgentId)
  if ($LeadAgentIds -contains $AgentId) {
    return $LeadModel
  }
  return $WorkerModel
}

if ($DevelopmentOnly) {
  $agents = @($agents | Where-Object { $_.team -eq "development" })
} elseif ($SpringMsaOnly) {
  $agents = @($agents | Where-Object { $_.team -eq "spring-msa" })
} elseif ($DevAndSpringMsaOnly) {
  $agents = @($agents | Where-Object { $_.team -eq "development" -or $_.team -eq "spring-msa" })
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $RegistryPath) | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$results = @()
for ($index = 0; $index -lt $agents.Count; $index++) {
  $agent = $agents[$index]
  $parameters = @{
    AgentId = $agent.id
    Name = $agent.name
    Team = $agent.team
    Model = (Get-AgentModel -AgentId $agent.id)
    HostName = $HostName
    Port = ($BasePort + $index)
    Cwd = $agent.cwd
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
    throw "Attach POC script did not return JSON for $($agent.id). Output: $($raw -join [Environment]::NewLine)"
  }

  $jsonText = ($raw[$jsonStart..($raw.Count - 1)] -join [Environment]::NewLine)
  $results += ($jsonText | ConvertFrom-Json)
}

([pscustomobject]@{
  registry = $RegistryPath
  runner = $RunnerPath
  base_port = $BasePort
  results = $results
}) | ConvertTo-Json -Depth 10
