param(
  [string]$ApiUrl = "http://127.0.0.1:9001",
  [string]$LeadModel = "gpt-5.5",
  [string]$WorkerModel = "gpt-5.4",
  [string]$LogPath = "",
  [switch]$IncludeWorkers,
  [string[]]$WorkerIds = @(),
  [switch]$RefreshBootPrompt
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."
if (-not $LogPath) {
  $LogPath = Join-Path $Root "data\system-logs\agent-ops.jsonl"
}
$LedgerReferenceDisabledPath = Join-Path $Root "data\ledger-reference-disabled.json"

function Test-LedgerReferenceDisabled {
  if ($env:LCC_LEDGER_REFERENCE_DISABLED -eq "1") {
    return $true
  }
  if (-not (Test-Path -LiteralPath $LedgerReferenceDisabledPath)) {
    return $false
  }
  try {
    $state = Get-Content -LiteralPath $LedgerReferenceDisabledPath -Raw | ConvertFrom-Json
    return [bool]$state.disabled
  } catch {
    return $true
  }
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
  @{ id = "ceo"; name = "Caesar"; team = "executive"; cwd = "workspaces/ceo/repo" },
  @{ id = "dev-lead"; name = "Max"; team = "development"; cwd = "workspaces/dev-lead/repo" }
)

$resolvedWorkerIds = @()
if ($IncludeWorkers -and $WorkerIds.Count -eq 0) {
  $resolvedWorkerIds = 1..12 | ForEach-Object { "developer-$_" }
} elseif ($WorkerIds.Count -gt 0) {
  $resolvedWorkerIds = $WorkerIds | ForEach-Object {
    if ($_ -match '^\d+$') {
      "developer-$_"
    } else {
      $_
    }
  }
}

foreach ($workerId in $resolvedWorkerIds) {
  if ($workerId -notmatch '^developer-(\d+)$') {
    throw "Invalid worker id '$workerId'. Use developer-N or N."
  }
  $n = [int]$Matches[1]
  $agents += @{ id = "developer-$n"; name = "Developer $n"; team = "development"; cwd = "workspaces/developer-$n/repo" }
}

Write-AgentOpsLog -Event "spawn.policy" -Status "planned" -Message "9001 bootstrap starts Caesar and Max by default; workers require IncludeWorkers or WorkerIds after ledger review" -Data @{
  api_url = $ApiUrl
  include_workers = [bool]$IncludeWorkers
  worker_ids = $resolvedWorkerIds
}

function Get-Sessions {
  @(Invoke-RestMethod -Uri "$ApiUrl/api/sessions" -Method Get -TimeoutSec 10)
}

function Get-AgentBootPrompt {
  param([string]$AgentId)

  $promptPath = Join-Path $Root "data\agent-boot-prompts.json"
  $roleEntry = "data/agent-boot-prompts.json::$AgentId"

  return @(
    "[LCC BOOT POLICY - MUST READ BEFORE WORK]"
    "agent=$AgentId"
    "1. Read AGENTS.md at repo root if present."
    "2. Read data/branch-boot-context.md."
    "3. Read docs/command-chain-policy-20260531.md."
    "4. Read docs/agent-state-management-policy-20260531.md if present."
    "5. Ledger reference is currently disabled by Lucas. Do not read data/ceo-command-ledger.json, data/work-ledger.json, execution-board, or 9100 until Lucas restores ledger reference."
    "6. Read data/agent-boot-prompts.json only for role identity; ignore any ledger-read instructions while ledger reference is disabled."
    "Role entry path: $roleEntry"
    "Rules: 9001 startup begins with Caesar and Max. Do not inspect, execute, or assign ledger items. Do not code before an explicit task card states permission=edit."
    "Reply first with: POLICY_ACK agent=<id> role=<role> read=<files> mode=<normal|lucas-direct|emergency> ledger_reference=disabled next=<first action> blocker=<none|...>"
  ) -join "`n"
}

function Send-AgentBootPrompt {
  param([string]$AgentId)

  $prompt = Get-AgentBootPrompt -AgentId $AgentId
  function Submit-AgentPromptFallback {
    param([string]$TargetAgentId)
    try {
      Invoke-RestMethod -Uri "$ApiUrl/api/sessions/$TargetAgentId/prompt-submit" -Method Post -ContentType "application/json" -Body (@{ repeat = 1 } | ConvertTo-Json -Compress) -TimeoutSec 10 | Out-Null
      return "prompt-submit"
    } catch {
      Invoke-RestMethod -Uri "$ApiUrl/api/sessions/$TargetAgentId/write" -Method Post -ContentType "application/json" -Body (@{ data = "" } | ConvertTo-Json -Compress) -TimeoutSec 10 | Out-Null
      return "write-empty-fallback"
    }
  }

  try {
    Start-Sleep -Seconds 8
    $initialSubmitMethod = Submit-AgentPromptFallback -TargetAgentId $AgentId
    Start-Sleep -Seconds 2
    try {
      Invoke-RestMethod -Uri "$ApiUrl/api/sessions/$AgentId/prompt-text" -Method Post -ContentType "application/json" -Body (@{ data = $prompt } | ConvertTo-Json -Compress) -TimeoutSec 20 | Out-Null
      Start-Sleep -Milliseconds 300
      $bootSubmitMethod = Submit-AgentPromptFallback -TargetAgentId $AgentId
    } catch {
      Invoke-RestMethod -Uri "$ApiUrl/api/sessions/$AgentId/write" -Method Post -ContentType "application/json" -Body (@{ data = $prompt } | ConvertTo-Json -Compress) -TimeoutSec 20 | Out-Null
      Start-Sleep -Milliseconds 300
      $bootSubmitMethod = Submit-AgentPromptFallback -TargetAgentId $AgentId
    }
    Write-AgentOpsLog -Event "boot_prompt.sent" -AgentId $AgentId -Status "sent" -Message "policy-first boot prompt submitted" -Data @{
      api_url = $ApiUrl
      initial_submit_method = $initialSubmitMethod
      boot_submit_method = $bootSubmitMethod
    }
  } catch {
    Write-AgentOpsLog -Event "boot_prompt.failed" -AgentId $AgentId -Status "error" -Message $_.Exception.Message -Data @{
      api_url = $ApiUrl
    }
  }
}

$existing = @{}
foreach ($session in (Get-Sessions)) {
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
    if ($RefreshBootPrompt) {
      Send-AgentBootPrompt -AgentId $agent.id
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
    Send-AgentBootPrompt -AgentId $agent.id
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
