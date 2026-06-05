# 지사 인바운드 운영 가이드

목적: 본부가 지사 원장과 메시지 상태를 조회하거나 전달할 수 있게 하되, 터미널 제어권은 절대 열지 않는다.

이 모드는 파일 기반 지사 인바운드 전용 모드다. LAN, VPN, 터널, 라우터, 공개망에 열기 전에는 반드시 `LCC_INBOUND_ONLY=1`과 토큰 검증이 켜져 있어야 한다.

## 원칙

일반 Terminal Fleet API는 실제 터미널 세션 생성, 입력 전송, 로그 조회, WebSocket 제어를 포함한다. 이 API를 본부 접근 포트로 열면 원격에서 지사 터미널을 읽거나 조작할 수 있으므로 위험하다.

본부용 인바운드 포트는 아래 기능만 제공한다.

- 지사 생존 확인
- 지사 상태 요약
- 오늘 업무 원장 조회
- 본부-지사 메시지 조회/등록

아래 경로는 인바운드 포트에서 노출되면 안 된다.

- `/api/sessions`
- `/api/sessions/*`
- `/ws/terminal`
- 터미널 로그, 터미널 입력, 세션 생성/삭제/리사이즈, PTY 통계

## 실행 환경

권장 실행값:

```powershell
$env:LCC_INBOUND_ONLY = "1"
$env:LCC_API_HOST = "0.0.0.0"
$env:LCC_API_PORT = "9102"
$env:LCC_BRANCH_INBOUND_TOKEN = "<긴_랜덤_토큰>"
$env:LCC_WORK_LEDGER_PATH = "data/work-ledger.json"
$env:LCC_PEER_STORAGE_PATH = "data/peer-bridge-inbound.jsonl"
```

환경변수 의미:

- `LCC_INBOUND_ONLY=1`: 제한된 본부 인바운드 라우터만 켠다.
- `LCC_API_HOST=0.0.0.0`: 허용된 네트워크 경로에서 본부가 접근할 수 있게 바인딩한다.
- `LCC_API_PORT=9102`: 일반 터미널 포트와 분리한다.
- `LCC_BRANCH_INBOUND_TOKEN`: `GET /api/branch/health`를 제외한 모든 본부 요청에 필요한 공유 토큰이다.
- `LCC_WORK_LEDGER_PATH`: 오늘 업무 원장 JSON 파일 경로다.
- `LCC_PEER_STORAGE_PATH`: 본부-지사 메시지 JSONL 파일 경로다.

토큰이 없거나 빈 값이면 보호 API는 실패해야 한다. 인증 없이 조용히 열리면 안 된다.

## 허용 엔드포인트

### 생존 확인

`GET /api/branch/health`

토큰 없이 호출 가능하다. 민감 정보, 세션 수, 파일 경로, 토큰 상태는 반환하지 않는다.

### 지사 상태

`GET /api/branch/status`

필수 헤더:

```text
X-LCC-Token: <긴_랜덤_토큰>
```

반환 예:

```json
{
  "ok": true,
  "service": "lcc-core-branch-inbound",
  "time": "2026-05-31T00:00:00Z",
  "work_ledger_tasks": 3,
  "peer_messages": 1,
  "agent_total": 4,
  "agent_active": 3,
  "agent_session_source": "live-9001-api",
  "agent_session_api_ok": true,
  "agent_session_api_note": "http://127.0.0.1:9001/api/sessions"
}
```

### 지사 에이전트 가시화

`GET /api/branch/agents`

필수 헤더:

```text
X-LCC-Token: <긴_랜덤_토큰>
```

반환값은 branch-safe summary만 포함한다.

- `total_agents`, `active_agents`
- `session_source`, `session_api`
- `agents[]` with `id`, `name`, `team`, `status`, `pid`, `preview`, `last_activity_at`

이 endpoint는 HQ가 "지금 지사 에이전트가 몇 명이고 누구인지"를 직접 확인하기 위한 용도다. 터미널 제어, `/api/sessions`, `/ws/terminal`은 여전히 열지 않는다.

### 업무 원장 조회

`GET /api/branch/work-ledger`

필수 헤더: `X-LCC-Token`

반환값은 `data/work-ledger.json`의 `tasks`, `events` 구조다.

### 본부-지사 메시지

`GET /api/branch/messages`

필수 헤더: `X-LCC-Token`

`POST /api/branch/messages`

필수 헤더: `X-LCC-Token`

요청 본문:

```json
{
  "from": "hq",
  "to": "branch",
  "kind": "status",
  "body": "현재 원장 진행 상황을 보고해 주세요."
}
```

필드 기준:

- `from`: 필수. 예: `hq`, `lcc-hq`, `branch-lcc-core`
- `to`: 선택. 기본값은 `branch`
- `kind`: 선택. 기본값은 `hq-inbound`
- `body`: 필수

## PowerShell 점검

```powershell
$Base = "http://branch-host:9102"
$Headers = @{ "X-LCC-Token" = "<긴_랜덤_토큰>" }

Invoke-RestMethod -Method Get -Uri "$Base/api/branch/health"
Invoke-RestMethod -Method Get -Uri "$Base/api/branch/status" -Headers $Headers
Invoke-RestMethod -Method Get -Uri "$Base/api/branch/agents" -Headers $Headers
Invoke-RestMethod -Method Get -Uri "$Base/api/branch/work-ledger" -Headers $Headers

$Body = @{
  from = "hq"
  to = "branch"
  kind = "status"
  body = "현재 원장 진행 상황을 보고해 주세요."
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$Base/api/branch/messages" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body
```

차단 확인:

```powershell
Invoke-WebRequest -Method Get -Uri "$Base/api/sessions" -Headers $Headers
Invoke-WebRequest -Uri "$Base/ws/terminal" -Headers $Headers
```

위 두 요청은 인바운드 포트에서 실패해야 정상이다.

## 공개 전 체크리스트

- `LCC_INBOUND_ONLY=1` 상태로 실행했다.
- 포트는 일반 터미널 포트와 분리했다. 권장값은 `9102`.
- `LCC_BRANCH_INBOUND_TOKEN`은 긴 랜덤값이고 문서/깃/채팅/스크린샷에 남기지 않았다.
- `/api/branch/status`는 토큰 없이는 실패한다.
- `/api/branch/work-ledger`는 토큰이 있어야 성공한다.
- `/api/branch/messages`는 토큰이 있어야 성공한다.
- `/api/sessions`와 `/ws/terminal`은 인바운드 포트에서 실패한다.
- 방화벽, 라우터, 터널, 리버스 프록시는 본부 출발지 또는 허용된 경로만 통과시킨다.

## 파일 기반 운영

당분간 DB 없이 파일을 원장으로 쓴다.

- 업무 원장: `data/work-ledger.json`
- 본부-지사 메시지 로그: `data/peer-bridge-inbound.jsonl`

복구가 필요하면 먼저 인바운드 프로세스를 멈추고, 파일을 백업한 뒤 JSON/JSONL 유효성을 확인한다.

## 최신 인계: LIVE PASS 및 운영 조건

작성 시각: 2026-05-31 KST

### LIVE PASS

- 판정: LIVE PASS 성공.
- 본부 메시지 ID: `msg-1780198222835-f4b511e9`.
- 실제 토큰은 문서, git, 채팅 로그, 스크린샷에 기록하지 않는다.

### 인코딩 원인 및 수정

- 원인: 한글 문서와 PowerShell 출력 경로에서 UTF-8 처리가 일관되지 않아 일부 문서가 깨져 보였다.
- 수정:
  - 문서는 UTF-8로 저장한다.
  - JSON 요청은 `Content-Type: application/json; charset=utf-8`을 사용한다.
  - PowerShell 확인은 `Get-Content -Encoding UTF8` 또는 UTF-8 콘솔 설정을 사용한다.
  - 본부/지사 메시지는 JSON 직렬화 후 한글 본문이 보존되는지 확인한다.

### 토큰 로테이션 요청

- LIVE PASS에 사용된 토큰은 운영 전 로테이션한다.
- 새 토큰은 안전 채널로만 공유한다.
- 지사 환경변수는 `LCC_BRANCH_INBOUND_TOKEN`을 사용한다.
- 토큰 없는 요청은 `401`이어야 하며, 가능하면 `TOKEN_MISSING` 또는 `TOKEN_INVALID` 같은 구조화 오류를 반환한다.

### 인바운드 `9102` 공개 조건

필수 조건:

- `LCC_INBOUND_ONLY=1`
- `LCC_API_HOST=0.0.0.0`
- `LCC_API_PORT=9102`
- `LCC_BRANCH_INBOUND_TOKEN` 설정
- 본부/L1에서 지사 `9102`까지 라우팅 가능
- 출발지 allowlist, VPN, 또는 터널 정책 확정

허용 API:

- `GET /api/branch/health`
- `GET /api/branch/status`
- `GET /api/branch/agents`
- `GET /api/branch/work-ledger`
- `GET /api/branch/messages`
- `POST /api/branch/messages`

금지 API:

- `/api/sessions`
- `/api/sessions/*`
- `/ws/terminal`
- 임의 파일 접근
- shell 실행
- 터미널 입력 전달

운영 원칙:

- `9102`는 지사 인바운드 전용이다.
- 일반 Terminal Fleet 포트를 본부에 공개하지 않는다.
- health를 제외한 보호 API는 `X-LCC-Token`을 필수로 요구한다.
- 토큰 로테이션 후 본부에서 tokenless negative test와 authenticated smoke test를 모두 수행한다.
