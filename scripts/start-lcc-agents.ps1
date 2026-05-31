param(
  [string]$ApiUrl = "http://127.0.0.1:9001",
  [string]$LeadModel = "gpt-5.5",
  [string]$WorkerModel = "gpt-5.4",
  [string]$LogPath = ""
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."
if (-not $LogPath) {
  $LogPath = Join-Path $Root "data\system-logs\agent-ops.jsonl"
}

function Write-AgentOpsLog {
  param(
    [string]$Event,
    [string]$AgentId = "",
    [string]$Status = "",
    [string]$Message = "",
    [hashtable]$Data = @{}
  )
  $dir = Split-Path -Parent $LogPath
  if ($dir) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $record = [ordered]@{
    at = (Get-Date).ToUniversalTime().ToString("o")
    event = $Event
    agent_id = $AgentId
    status = $Status
    message = $Message
    data = $Data
  }
  Add-Content -LiteralPath $LogPath -Value ($record | ConvertTo-Json -Compress -Depth 12)
}

$LeadAgentIds = @("ceo", "dev-lead")
function Get-AgentModel {
  param([string]$AgentId)
  if ($LeadAgentIds -contains $AgentId) {
    return $LeadModel
  }
  return $WorkerModel
}

$agents = @(
  @{ id = "ceo"; name = "CEO"; team = "executive"; cwd = "workspaces/ceo/repo" },
  @{ id = "dev-lead"; name = "Dev Lead"; team = "development"; cwd = "workspaces/dev-lead/repo" },
  @{ id = "developer-1"; name = "Developer 1"; team = "development"; cwd = "workspaces/developer-1/repo" },
  @{ id = "developer-2"; name = "Developer 2"; team = "development"; cwd = "workspaces/developer-2/repo" },
  @{ id = "developer-3"; name = "Developer 3"; team = "development"; cwd = "workspaces/developer-3/repo" },
  @{ id = "developer-4"; name = "Developer 4"; team = "development"; cwd = "workspaces/developer-4/repo" }
)

function Get-Sessions {
  @(Invoke-RestMethod -Uri "$ApiUrl/api/sessions" -Method Get -TimeoutSec 10)
}

$existing = @{}
foreach ($session in Get-Sessions) {
  if (-not $session -or -not $session.id) {
    continue
  }
  $existing[$session.id] = $session
}

$created = @()
$skipped = @()
$failed = @()

foreach ($agent in $agents) {
  $agentModel = Get-AgentModel -AgentId $agent.id

  if ($existing.ContainsKey($agent.id) -and $existing[$agent.id].status -eq "active") {
    $skipped += $agent.id
    Write-AgentOpsLog -Event "spawn.skipped" -AgentId $agent.id -Status "active" -Message "session already active" -Data @{
      team = $agent.team
      cwd = $agent.cwd
    }
    continue
  }

  Write-AgentOpsLog -Event "spawn.attempt" -AgentId $agent.id -Status "starting" -Message "creating Codex session" -Data @{
    team = $agent.team
    cwd = $agent.cwd
    model = $agentModel
    api_url = $ApiUrl
  }

  $body = @{
    id = $agent.id
    name = $agent.name
    team = $agent.team
    cwd = $agent.cwd
    cmd = "codex.cmd"
    args = @("--model", $agentModel, "--cd", ".", "--no-alt-screen", "--dangerously-bypass-approvals-and-sandbox")
    model = $agentModel
  } | ConvertTo-Json -Depth 8

  try {
    Invoke-RestMethod -Uri "$ApiUrl/api/sessions" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 20 | Out-Null
    $created += $agent.id
    Write-AgentOpsLog -Event "spawn.created" -AgentId $agent.id -Status "active" -Message "session created" -Data @{
      team = $agent.team
      cwd = $agent.cwd
      model = $agentModel
    }
  } catch {
    $failed += "$($agent.id): $($_.Exception.Message)"
    Write-AgentOpsLog -Event "spawn.failed" -AgentId $agent.id -Status "error" -Message $_.Exception.Message -Data @{
      team = $agent.team
      cwd = $agent.cwd
      model = $agentModel
    }
  }
}

$stats = Invoke-RestMethod -Uri "$ApiUrl/api/sessions/pty-stats" -Method Get -TimeoutSec 10
Write-AgentOpsLog -Event "spawn.summary" -Status "complete" -Message "agent spawn run finished" -Data @{
  created = $created
  skipped_active = $skipped
  failed = $failed
  active = $stats.active
  max_active = $stats.max_active
  total = $stats.total
}
[pscustomobject]@{
  created = $created
  skipped_active = $skipped
  failed = $failed
  active = $stats.active
  max_active = $stats.max_active
  total = $stats.total
}
