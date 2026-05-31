# HQ Hotline Verification Checklist

Date: 2026-05-31 KST

Scope: verify the public HQ hotline path at `http://hanwool-board.duckdns.org:9082/api/lcc` for health, intake, speak, orders, inbox, ack, and UTF-8 Korean message delivery into the HQ meeting.

Token rule: never print, log, paste, commit, screenshot, or echo the branch token. Keep it only in the current shell environment or an approved secret store.

## Current Result

| Check | Command surface | Expected | Result | Status | Notes |
|---|---|---|---|---|---|
| Health | `GET /health` | `200`, `ok=true`, `upstream.status=ok` | `200`, `ok=true`, `l1=hanul-editor:9082`, upstream `ok` | PASS | Public reachability verified. |
| Intake auth gate | `POST /intake` without token | `401` | `401` | PASS | Confirms protected endpoint rejects tokenless request. |
| Speak auth gate | `POST /speak` without token | `401` | `401` | PASS | Confirms protected endpoint rejects tokenless request. |
| Orders auth gate | `GET /orders?branch_id=...` without token | `401` | `401` | PASS | Confirms protected endpoint rejects tokenless request. |
| Inbox auth gate | `GET /inbox?virtual_agent_id=...` without token | `401` | `401` | PASS | Confirms protected endpoint rejects tokenless request. |
| Authenticated intake | `POST /intake` with token | receipt/status returned | Not run | BLOCKED | `LCC_BRANCH_TOKEN` is not present in this shell. |
| Authenticated speak | `POST /speak` with token | `ok=true`, `msgId`, HQ meeting row appears | Not run | BLOCKED | Needs branch token. |
| Authenticated orders | `GET /orders?branch_id=...` with token | `ok=true`, `orders`, `count` | Not run | BLOCKED | Needs branch token. |
| Authenticated inbox | `GET /inbox?virtual_agent_id=...` with token | `ok=true`, `messages`, `count` | Not run | BLOCKED | Needs branch token. |
| Authenticated ack | `POST /ack-message/:msg_id` with token | `ok=true`, `acked_at` | Not run | BLOCKED | Needs an inbox message id and branch token. |
| Korean HQ meeting regression | `POST /speak` with Korean UTF-8 payload | Payload is readable in HQ meeting | Not run | BLOCKED | Needs branch token and HQ meeting observation. |
| Session log JSONL | `data/hq-hotline-session.jsonl` | Every line parses as JSON | 24/24 lines valid | PASS | Parsed with UTF-8. |
| Session log token scan | `data/hq-hotline-session.jsonl` | No token value or secret-shaped token | 0 matches across secret-pattern scan | PASS | Literal token/error words are not treated as token values. |

## Required Authenticated Checklist

Run only after `LCC_BRANCH_TOKEN` is injected into the current PowerShell session. Do not print the variable.

1. Health: call `GET /health`; record status, `ok`, `l1`, and `upstream.status`.
2. Intake: send a small evidence bundle; record only receipt id/status, not headers.
3. Speak: send the Korean regression payload below using `Content-Type: application/json; charset=utf-8`.
4. HQ meeting observation: confirm the HQ meeting row shows the Korean text readable, not mojibake.
5. Orders: call `GET /orders?branch_id=laptop-lucas-01`; record count and whether any order id exists.
6. Inbox: call `GET /inbox?virtual_agent_id=branch-lcc-core&since=<session-start-minus-10m>`; record count and one message id if present.
7. Ack: for one inbox message id, call `POST /ack-message/:msg_id`; record `acked_at`.
8. Session log: parse `data/hq-hotline-session.jsonl` as UTF-8 JSONL.
9. Secret scan: verify `data/hq-hotline-session.jsonl` contains no token values or secret-shaped strings.

## Korean Encoding Regression Payload

The exact content below must arrive readable in the HQ meeting:

```text
[지사장→HQ][encoding-regression] 한글 인코딩 회귀 테스트입니다. 본부 미팅에서 이 문장이 깨지지 않고 읽혀야 합니다. KST=<HH:mm:ss>
```

Request requirements:

- Encode the JSON body as UTF-8 bytes.
- Use `Content-Type: application/json; charset=utf-8`.
- Keep `virtual_agent_id`, `X-Agent-Id`, and `X-Actor-Id` aligned as `branch-lcc-core`.
- Record the returned `msgId`, but do not record any token.

## Minimal PowerShell Harness

```powershell
$base = "http://hanwool-board.duckdns.org:9082/api/lcc"
$headers = @{
  "X-LCC-Token" = $env:LCC_BRANCH_TOKEN
  "X-Branch-Id" = "laptop-lucas-01"
  "X-Agent-Id" = "branch-lcc-core"
  "X-Actor-Id" = "branch-lcc-core"
}

$body = @{
  meeting_id = "mtg-1780195037159"
  virtual_agent_id = "branch-lcc-core"
  content = "[지사장→HQ][encoding-regression] 한글 인코딩 회귀 테스트입니다. 본부 미팅에서 이 문장이 깨지지 않고 읽혀야 합니다. KST=$((Get-Date).ToString('HH:mm:ss'))"
  threadId = "msg-1780195057932-f6eb57c2"
  targets = @("lucas", "cto", "dev-2")
}

$json = $body | ConvertTo-Json -Compress -Depth 12
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
Invoke-RestMethod -Method Post -Uri "$base/speak" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $bytes
```

After the call, verify the HQ meeting display manually or through the approved HQ-side meeting read path. A successful API response alone is not enough for the encoding regression; the Korean text must be readable where HQ sees it.
