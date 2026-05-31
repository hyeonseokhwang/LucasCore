param(
  [Parameter(Mandatory = $true)]
  [string]$PeerUrl,

  [int]$TimeoutSec = 5
)

$ErrorActionPreference = "Stop"

function Normalize-PeerUrl {
  param([string]$Value)

  $trimmed = $Value.Trim().TrimEnd("/")
  if ($trimmed -notmatch "^https?://") {
    $trimmed = "http://$trimmed"
  }

  return $trimmed
}

function Invoke-JsonCheck {
  param(
    [string]$Url,
    [int]$TimeoutSec
  )

  try {
    $response = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec
    return [pscustomobject]@{
      Ok = $true
      Status = "PASS"
      Data = $response
      Error = $null
    }
  } catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }

    return [pscustomobject]@{
      Ok = $false
      Status = if ($statusCode -eq 404) { "ABSENT" } else { "FAIL" }
      Data = $null
      Error = $_.Exception.Message
    }
  }
}

function Get-NextAction {
  param(
    [uri]$PeerUri,
    [bool]$HealthOk,
    [string]$HealthError
  )

  $hostName = $PeerUri.Host.ToLowerInvariant()
  $isLoopback = $hostName -eq "localhost" -or $hostName -eq "127.0.0.1" -or $hostName -eq "::1"

  if ($HealthOk -and $isLoopback) {
    return "Local only: this works on the same machine/RDP. For branch<->HQ, bind API/Web to LAN/VPN IP or expose through VPN/tunnel."
  }

  if ($HealthOk) {
    return "Peer reachable: share this URL with the other side and verify WebSocket/UI through the same host."
  }

  if ($isLoopback) {
    return "127.0.0.1 is not reachable from another machine. Run the API on 0.0.0.0 or a LAN/VPN IP, then retry with that peer URL."
  }

  if ($HealthError -match "timed out|No connection|actively refused|unable to connect|forcibly closed") {
    return "Check that the peer API is running, bound to LAN/VPN instead of 127.0.0.1, and inbound firewall/NAT allows the port."
  }

  return "Confirm peer URL, scheme, port, VPN/LAN route, firewall, and whether a token/auth gateway is required."
}

$baseUrl = Normalize-PeerUrl $PeerUrl
$peerUri = [uri]$baseUrl
$healthUrl = "$baseUrl/api/health"
$peerStatusUrl = "$baseUrl/api/peer/status"

Write-Host "LCC peer check"
Write-Host "Peer: $baseUrl"
Write-Host ""

$health = Invoke-JsonCheck -Url $healthUrl -TimeoutSec $TimeoutSec
if ($health.Ok) {
  Write-Host "PASS /api/health"
  if ($health.Data) {
    $summary = $health.Data | ConvertTo-Json -Compress -Depth 6
    Write-Host "     $summary"
  }
} else {
  Write-Host "FAIL /api/health"
  Write-Host "     $($health.Error)"
}

$peerStatus = Invoke-JsonCheck -Url $peerStatusUrl -TimeoutSec $TimeoutSec
if ($peerStatus.Ok) {
  Write-Host "PASS /api/peer/status"
  if ($peerStatus.Data) {
    $summary = $peerStatus.Data | ConvertTo-Json -Compress -Depth 6
    Write-Host "     $summary"
  }
} elseif ($peerStatus.Status -eq "ABSENT") {
  Write-Host "SKIP /api/peer/status"
  Write-Host "     Endpoint not present on this peer."
} else {
  Write-Host "FAIL /api/peer/status"
  Write-Host "     $($peerStatus.Error)"
}

Write-Host ""
Write-Host "Next action:"
Write-Host (Get-NextAction -PeerUri $peerUri -HealthOk $health.Ok -HealthError $health.Error)

if (-not $health.Ok) {
  exit 1
}
