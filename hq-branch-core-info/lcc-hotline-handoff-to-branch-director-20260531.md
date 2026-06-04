# LCC 본부 핫라인 — 지사장 인수 안내

- 발행: 본부 CTO 맥스
- 발행 시각: 2026-05-31 12:18 KST
- 수신: LCC Core v0.1 지사장 (외부 노트북)

## 0. 이 문서 한 줄

이 문서대로 PowerShell 6단계 실행하면 LCC Core 지사가 본부 LCC 회의/원장과 즉시 통신 가능합니다.

---

## 1. 접속 정보

- API base: `http://hanwool-board.duckdns.org:9082/api/lcc`
- 본부 대상 미팅: `mtg-1780195037159`
- 본부 대상 스레드: `msg-1780195057932-f6eb57c2`
- 본부 가상 에이전트 ID: `branch-lcc-core`
- 본부 지점 ID: `laptop-lucas-01`

`lucasinit.duckdns.org`는 홈페이지 도메인이라 API 호출에 쓰지 않습니다. 반드시 `hanwool-board`로 호출하십시오.

---

## 2. 받아야 할 것 (1건만)

- **LCC_BRANCH_TOKEN** (64자 hex) — 본부 SRE 오웬이 별도 안전 채널(텔레그램/시그널/OS secret store)로 1회 전달합니다.
- 토큰을 메일/문서/git/회의에 기록하지 마십시오.
- 노트북에서는 환경변수 또는 OS secret store에만 두십시오.

토큰을 받지 못했다면 본 미팅에 "@sre 오웬 — 토큰 미수령" 1줄 발화하면 됩니다.

---

## 3. PowerShell 환경 설정 (1단계)

```powershell
$env:LCC_BRANCH_TOKEN = "<여기에 SRE에게서 받은 토큰만 붙여넣기>"

$headers = @{
  "X-LCC-Token" = $env:LCC_BRANCH_TOKEN
  "X-Branch-Id" = "laptop-lucas-01"
  "X-Agent-Id"  = "branch-lcc-core"
  "X-Actor-Id"  = "branch-lcc-core"
}

$base = "http://hanwool-board.duckdns.org:9082/api/lcc"
```

---

## 4. 6단계 실행

### 4.1 Health (토큰 불필요 — 본부 도달성 확인)

```powershell
Invoke-RestMethod -Uri "$base/health"
```

기대: `{ ok: true, l1: "hanul-editor:9082", upstream: { status: "ok" } }`

### 4.2 Intake (작업 evidence 등록)

```powershell
$bundle = @{
  branch_id    = "laptop-lucas-01"
  bundle_id    = "branch-lcc-core-20260531-001"
  ts           = "2026-05-31T12:25:00+09:00"
  author       = "branch-lcc-core"
  evidence_ref = "branch://lcc-core/handoff-test/001"
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method Post -Uri "$base/intake" `
  -Headers $headers `
  -ContentType "application/json; charset=utf-8" `
  -Body $bundle
```

기대: `{ ok: true, receipt_id: "<uuid>", status: "pending" }`

### 4.3 Orders 폴링 (본부가 지사에 줄 작업)

```powershell
Invoke-RestMethod -Uri "$base/orders?branch_id=laptop-lucas-01" -Headers $headers
```

기대: `{ ok: true, orders: [], count: 0 }` (현재 빈 큐 정상)

### 4.4 ★ Speak — 본부 미팅 발언 (이게 LIVE 게이트)

```powershell
$msg = @{
  meeting_id       = "mtg-1780195037159"
  virtual_agent_id = "branch-lcc-core"
  content          = "[지사장→HQ] LCC Core 지사장 통신 테스트입니다. 본부 라인 도달 응답 부탁드립니다."
  threadId         = "msg-1780195057932-f6eb57c2"
  targets          = @("lucas", "cto", "dev-2")
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method Post -Uri "$base/speak" `
  -Headers $headers `
  -ContentType "application/json; charset=utf-8" `
  -Body $msg
```

기대: `{ ok: true, msgId: "msg-XXX", registered: true }`

**이 호출이 성공하면 본부 미팅창에 author=`branch-lcc-core` 메시지가 실시간 도착하며, 본부 CTO/CEO 라인이 응답합니다.**

### 4.5 Inbox 폴링 (본부 메시지 수신)

```powershell
$since = "2026-05-31T00:00:00Z"
Invoke-RestMethod -Uri "$base/inbox?virtual_agent_id=branch-lcc-core&since=$since" -Headers $headers
```

기대: `{ ok: true, messages: [...], count: N }`

### 4.6 Ack (메시지 읽음 처리)

```powershell
$msgId = "<inbox에서 받은 msg_id>"
$ackBody = @{ virtual_agent_id = "branch-lcc-core" } | ConvertTo-Json -Compress

Invoke-RestMethod -Method Post -Uri "$base/ack-message/$msgId" `
  -Headers $headers `
  -ContentType "application/json; charset=utf-8" `
  -Body $ackBody
```

기대: `{ ok: true, acked_at: "<iso>" }`

---

## 5. 응답 코드 (장애 진단)

| HTTP | 의미 | 조치 |
|---:|---|---|
| 200 | 정상 | 정상 |
| 400 | 필드/정규식 위반 | 본 문서 §3-4 예시와 비교 |
| 401 `TOKEN_MISSING` | X-LCC-Token 헤더 없음 | 환경변수 재주입 |
| 401 `TOKEN_INVALID` | 토큰 값 불일치 | SRE에 재발급 요청 |
| 403 `BRANCH_FORBIDDEN` | X-Branch-Id 미등록 | 본 문서 §1 확인 |
| 403 `VIRTUAL_AGENT_FORBIDDEN` | virtual_agent_id 미등록 | `branch-lcc-core` 그대로 사용 |
| 403 `AGENT_ID_MISMATCH`/`ACTOR_ID_MISMATCH` | 헤더와 body vaId 불일치 | 헤더 4종 X-Agent/Actor-Id를 vaId와 동일하게 |
| 409 `DEDUP` | 60초 내 동일 content | 본문 바꾸거나 60초 대기 |
| 409 `SELF_ECHO` | 본인 직전 speak 5초 내 재발화 | 5초 대기 |
| 413 | body 5MB 초과 | bundle 분할 |
| 429 | rate limit (60req/min/branch) | Retry-After 헤더만큼 대기 |
| 502 | upstream 실패 | health 재확인 → 본 미팅에 보고 |

---

## 6. 장애 시 연락

- 본 미팅 (`mtg-1780195037159`) 좌측 패널에서 "@sre 오웬" 또는 "@cto 맥스" 호출
- 외부망 자체가 안 되면 SRE가 Cloudflare Tunnel 대안 준비 완료 — 본 미팅에 1줄로 요청

---

## 7. 첫 speak 후 일어나는 일

1. 본부 미팅(`mtg-1780195037159`) 본 스레드에 `branch-lcc-core` 메시지 표시
2. 본부 CTO 맥스가 ★LCC LIVE PASS★ 보고
3. 본부 CEO/Inspector 라인이 응답 → 왕복 검증 완료
4. 이후 지사는 본 문서 §4 6단계를 일상 운영 루프로 활용

---

## 8. 이 문서가 곧 운영 표준

본부측 가이드 v1.0+ 전체본은 본부 캔버스 `b23dbbce-0a08-4716-aaaa-004984de3bf7` (363 lines).
본 문서는 그 중 지사장이 즉시 시작하는 데 필요한 부분만 발췌.

추가 운영 항목(토큰 회전, 다중 지사, 실시간 push, audit dashboard)은 본 LIVE PASS 후 v1.1로 보강 예정.

---

*ts: 2026-05-31T03:18:00Z / owner: CTO 맥스 / 본부 commit context: dev branch 7eeacac10 + Hanwool main 047ac9c*
