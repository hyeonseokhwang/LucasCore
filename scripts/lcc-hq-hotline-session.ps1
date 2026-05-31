param(
  [string]$Base = "http://hanwool-board.duckdns.org:9082/api/lcc",
  [string]$BranchId = "laptop-lucas-01",
  [string]$AgentId = "branch-lcc-core",
  [string]$MeetingId = "mtg-1780195037159",
  [string]$ThreadId = "msg-1780195057932-f6eb57c2",
  [string[]]$Targets = @("lucas"),
  [int]$PollSeconds = 60,
  [switch]$Once,
  [switch]$SkipInitialSpeak
)

$ErrorActionPreference = "Stop"
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

try {
  [Console]::InputEncoding = $script:Utf8NoBom
  [Console]::OutputEncoding = $script:Utf8NoBom
  $OutputEncoding = $script:Utf8NoBom
} catch {
  # Non-interactive hosts can reject console encoding changes.
}

if ([string]::IsNullOrWhiteSpace($env:LCC_BRANCH_TOKEN)) {
  throw "LCC_BRANCH_TOKEN is missing. Set it in this PowerShell session only; do not write it to files."
}

$logPath = Join-Path (Resolve-Path ".").Path "data\hq-hotline-session.jsonl"
New-Item -ItemType Directory -Force -Path (Split-Path $logPath) | Out-Null

function Write-HotlineLog {
  param([string]$Kind, [object]$Payload)
  $entry = [ordered]@{
    at = (Get-Date).ToUniversalTime().ToString("o")
    kind = $Kind
    payload = (Protect-HotlineLogPayload $Payload)
  }
  ($entry | ConvertTo-Json -Compress -Depth 12) | Add-Content -Encoding UTF8 -Path $logPath
}

function Protect-HotlineLogPayload {
  param([object]$Value)

  if ($null -eq $Value) {
    return $null
  }

  if ($Value -is [string]) {
    if (-not [string]::IsNullOrWhiteSpace($env:LCC_BRANCH_TOKEN) -and $Value.Contains($env:LCC_BRANCH_TOKEN)) {
      return $Value.Replace($env:LCC_BRANCH_TOKEN, "[redacted]")
    }
    return $Value
  }

  if ($Value -is [System.Collections.IDictionary]) {
    $copy = [ordered]@{}
    foreach ($key in $Value.Keys) {
      if ($key -match '(?i)token|authorization|secret') {
        $copy[$key] = "[redacted]"
      } else {
        $copy[$key] = Protect-HotlineLogPayload $Value[$key]
      }
    }
    return $copy
  }

  if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
    $items = @()
    foreach ($item in $Value) {
      $items += ,(Protect-HotlineLogPayload $item)
    }
    return $items
  }

  if ($Value -is [psobject]) {
    $copy = [ordered]@{}
    foreach ($property in $Value.PSObject.Properties) {
      if ($property.Name -match '(?i)token|authorization|secret') {
        $copy[$property.Name] = "[redacted]"
      } else {
        $copy[$property.Name] = Protect-HotlineLogPayload $property.Value
      }
    }
    return $copy
  }

  return $Value
}

function ConvertFrom-Utf8Base64 {
  param([string]$Value)
  return $script:Utf8NoBom.GetString([Convert]::FromBase64String($Value))
}

function ConvertTo-Utf8JsonBytes {
  param([object]$Value)
  $json = $Value | ConvertTo-Json -Compress -Depth 12
  return [byte[]]$script:Utf8NoBom.GetBytes($json)
}

function Invoke-Hotline {
  param(
    [string]$Method = "Get",
    [string]$Path,
    [object]$Body = $null
  )

  $headers = @{
    "X-LCC-Token" = $env:LCC_BRANCH_TOKEN
    "X-Branch-Id" = $BranchId
    "X-Agent-Id" = $AgentId
    "X-Actor-Id" = $AgentId
  }

  $uri = "$Base$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -TimeoutSec 20
  }

  $bytes = ConvertTo-Utf8JsonBytes $Body

  return Invoke-RestMethod `
    -Method $Method `
    -Uri $uri `
    -Headers $headers `
    -ContentType "application/json; charset=utf-8" `
    -Body ([byte[]]$bytes) `
    -TimeoutSec 20
}

function Get-PublicIp {
  try {
    return (Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 10).ip
  } catch {
    return $null
  }
}

$publicIp = Get-PublicIp
$startedAt = Get-Date

$health = Invoke-RestMethod -Uri "$Base/health" -TimeoutSec 20
Write-HotlineLog -Kind "health" -Payload $health

$bundle = @{
  branch_id = $BranchId
  bundle_id = "branch-lcc-core-session-$($startedAt.ToUniversalTime().ToString('yyyyMMddHHmmss'))"
  ts = $startedAt.ToString("o")
  author = $AgentId
  evidence_ref = "branch://lcc-core/hotline-session/$($startedAt.ToUniversalTime().ToString('yyyyMMddHHmmss'))"
} 
$intake = Invoke-Hotline -Method "Post" -Path "/intake" -Body $bundle
Write-HotlineLog -Kind "intake" -Payload $intake

if (-not $SkipInitialSpeak) {
  $sessionMessage = (ConvertFrom-Utf8Base64 "W+yngOyCrOyepS0+SFFdIExDQyBDb3JlIOyngOyCrCDtlavrnbzsnbgg7IS47IWYIOyLnOyekS4g7KeA7IKsIOqzteyduElQPQ==") +
    $publicIp +
    (ConvertFrom-Utf8Base64 "LCDsp4DsoJA9") +
    $BranchId +
    (ConvertFrom-Utf8Base64 "LCDsl5DsnbTsoITtirg9") +
    $AgentId +
    (ConvertFrom-Utf8Base64 "LiDsmpTssq06IOydtCDqs7XsnbhJUOunjCBhbGxvd2xpc3TtlZjqs6AgWC1MQ0MtVG9rZW4g6riw67CY7Jy866GcIOuzuOu2gC3sp4Dsgqwg7KeB7KCRIO2GteyLoOydhCDsmrTsmqntlZjqsqDsirXri4jri6QuIO2EsOuvuOuEkCDsoJzslrQgQVBJ64qUIOuFuOy2nO2VmOyngCDslYrsirXri4jri6Qu") +
    " KST=$((Get-Date).ToString('HH:mm:ss'))"
  try {
    $speak = Invoke-Hotline -Method "Post" -Path "/speak" -Body @{
      meeting_id = $MeetingId
      virtual_agent_id = $AgentId
      content = $sessionMessage
      threadId = $ThreadId
      targets = $Targets
    }
    Write-HotlineLog -Kind "speak" -Payload $speak
  } catch {
    Write-HotlineLog -Kind "speak_error" -Payload @{ error = $_.Exception.Message }
  }
}

do {
  $orders = Invoke-Hotline -Path "/orders?branch_id=$BranchId"
  Write-HotlineLog -Kind "orders" -Payload $orders

  $since = [Uri]::EscapeDataString($startedAt.ToUniversalTime().AddMinutes(-10).ToString("o"))
  $inbox = Invoke-Hotline -Path "/inbox?virtual_agent_id=$AgentId&since=$since"
  Write-HotlineLog -Kind "inbox" -Payload $inbox

  $messages = @()
  if ($null -ne $inbox.messages) {
    $messages = @($inbox.messages)
  }

  foreach ($message in $messages) {
    $msgId = $message.msg_id
    if ([string]::IsNullOrWhiteSpace($msgId)) {
      $msgId = $message.id
    }
    if (-not [string]::IsNullOrWhiteSpace($msgId)) {
      try {
        $ack = Invoke-Hotline -Method "Post" -Path "/ack-message/$msgId" -Body @{ virtual_agent_id = $AgentId }
        Write-HotlineLog -Kind "ack" -Payload $ack
      } catch {
        Write-HotlineLog -Kind "ack_error" -Payload @{ msg_id = $msgId; error = $_.Exception.Message }
      }
    }
  }

  if ($Once) {
    break
  }
  Start-Sleep -Seconds $PollSeconds
} while ($true)
