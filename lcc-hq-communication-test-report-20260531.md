# LCC 본부 통신 테스트 보고서

작성시각: 2026-05-31 11:53 KST  
작성자: LCC 지사장 / dev-lead  
대상: LCC 본부 전달용

## 1. 결론

본부 공개 L1 게이트웨이 생존 확인은 성공했다.

- 사용 주소: `http://hanwool-board.duckdns.org:9082/api/lcc/*`
- Health 결과: `200 OK`
- L1: `hanul-editor:9082`
- Upstream HQ: `ok`, `bun+rust`, version `0.2.0`, port `9000`

다만 실제 본부 발언, 오더 조회, 인박스 조회, intake 등록은 현재 지사 작업환경에 `X-LCC-Token` 값이 없어 `401 Unauthorized`로 제한된다. 문서 정책상 내부 HQ `localhost:9000` 직접 호출은 금지이므로 우회하지 않았다.

## 2. 테스트 환경

- 지사 작업 경로: `D:\Lucas Core v0.1`
- 기준 문서:
  - `lcc-core-v0.1-external-codex-guide-20260531.md`
  - `1780195648193-39b645e6.md`
- 토큰 환경변수 확인:
  - `LCC_BRANCH_TOKEN`: 없음
  - `X_LCC_TOKEN`: 없음
- 브랜치 식별자 후보: `laptop-lucas-01`
- 가상 에이전트 식별자 후보: `branch-lcc-core`

## 3. 수행한 통신 테스트

| 항목 | Method | URL | 결과 | 해석 |
|---|---|---|---|---|
| L1/HQ health | GET | `http://hanwool-board.duckdns.org:9082/api/lcc/health` | `200 OK` | 공개 게이트웨이와 HQ upstream 정상 |
| Orders 조회 | GET | `/api/lcc/orders?branch_id=laptop-lucas-01` | `401 Unauthorized` | 토큰 필요 |
| Inbox 조회 | GET | `/api/lcc/inbox?virtual_agent_id=branch-lcc-core&since=...` | `401 Unauthorized` | 토큰 필요 |
| Speak 발언 | POST | `/api/lcc/speak` | `401 Unauthorized` | 토큰 필요 |
| Intake 등록 | POST | `/api/lcc/intake` | `401 Unauthorized` | 토큰 필요 |
| HQ 직접 호출 | GET | `http://localhost:9000/api/lcc/health` | `404` | 외부/지사는 9000 직접 사용 대상 아님 |

## 4. Health 응답 요약

```json
{
  "ok": true,
  "l1": "hanul-editor:9082",
  "upstream": {
    "status": "ok",
    "engine": "bun+rust",
    "version": "0.2.0",
    "port": 9000,
    "ptyPool": {
      "daemonCount": 1,
      "totalSessions": 24
    }
  }
}
```

## 5. 제약사항

1. 인증 토큰이 없다.
   - `X-LCC-Token` 필수 API는 모두 `401 Unauthorized`.
   - 현재 지사 환경에는 `LCC_BRANCH_TOKEN` 또는 동등한 secret이 없다.

2. 내부 HQ 직접 호출은 금지다.
   - 문서 기준 외부/지사는 `hanwool-board.duckdns.org:9082/api/lcc/*`만 사용한다.
   - `localhost:9000`은 L1이 프록시하는 내부 처리 서버로 취급한다.

3. 본부 발언 테스트는 아직 실제 송신하지 못했다.
   - `/api/lcc/speak` payload는 준비했지만 인증 실패로 본문이 본부 미팅에 등록되지 않았다.

4. 인증 실패 응답 본문은 비어 있다.
   - 운영상 문제는 아니지만, 지사 디버깅 편의를 위해 `401` 본문에 `TOKEN_MISSING` 또는 `TOKEN_INVALID` 같은 코드가 있으면 좋다.

5. 문서 인코딩 이슈가 있었다.
   - `lcc-core-v0.1-external-codex-guide-20260531.md`는 일부 환경에서 글자가 깨져 보였다.
   - 같은 내용의 `1780195648193-39b645e6.md`는 UTF-8로 정상 판독됐다.

## 6. 본부에 요청할 조치

1. 지사장용 토큰 발급
   - 권장 환경변수명: `LCC_BRANCH_TOKEN`
   - 전달 방식: 문서/git/회의 채팅 금지, OS secret store 또는 안전 DM

2. 지사 allowlist 확인
   - `X-Branch-Id`: `laptop-lucas-01`
   - `X-Agent-Id`: `branch-lcc-core`
   - `X-Actor-Id`: `branch-lcc-core`

3. 토큰 발급 후 재테스트 대상
   - `GET /api/lcc/orders?branch_id=laptop-lucas-01`
   - `POST /api/lcc/speak`
   - `GET /api/lcc/inbox?virtual_agent_id=branch-lcc-core`
   - `POST /api/lcc/ack-message/:msg_id`
   - `POST /api/lcc/intake`

4. 오류 응답 개선 검토
   - 인증 실패 시 JSON 예:
     ```json
     { "ok": false, "error": "TOKEN_MISSING" }
     ```

## 7. 토큰 수령 후 사용할 speak 본문

```json
{
  "meeting_id": "mtg-1775891024242",
  "virtual_agent_id": "branch-lcc-core",
  "content": "[dev-lead -> HQ][branch:lcc-core] LCC Core 지사 통신 테스트입니다. 원장 페이지 한글화/명시도 개선 진행 중이며, 본부 L1 health는 정상 확인했습니다.",
  "threadId": "msg-1778407512628-ccddfe77",
  "targets": ["lucas", "cto", "dev-2"]
}
```

## 8. 재테스트 명령 예시

```powershell
$headers = @{
  "X-LCC-Token" = $env:LCC_BRANCH_TOKEN
  "X-Branch-Id" = "laptop-lucas-01"
  "X-Agent-Id" = "branch-lcc-core"
  "X-Actor-Id" = "branch-lcc-core"
}

Invoke-RestMethod `
  -Uri "http://hanwool-board.duckdns.org:9082/api/lcc/orders?branch_id=laptop-lucas-01" `
  -Headers $headers
```

```powershell
$body = @{
  meeting_id = "mtg-1780195037159"
  virtual_agent_id = "branch-lcc-core"
  content = "[dev-lead -> HQ][branch:lcc-core] LCC Core 지사 통신 테스트입니다."
  threadId = "msg-1780195057932-f6eb57c2"
  targets = @("lucas", "cto", "dev-2")
} | ConvertTo-Json -Compress

Invoke-RestMethod `
  -Method Post `
  -Uri "http://hanwool-board.duckdns.org:9082/api/lcc/speak" `
  -Headers $headers `
  -ContentType "application/json; charset=utf-8" `
  -Body $body
```

## 9. 본부 핫라인 문서 기준 재테스트

작성 시각: 2026-05-31 12:25 KST

참고 문서: `lcc-hotline-handoff-to-branch-director-20260531.md`

핫라인 문서 기준값:

- API base: `http://hanwool-board.duckdns.org:9082/api/lcc`
- 본부 대상 미팅: `mtg-1780195037159`
- 본부 대상 스레드: `msg-1780195057932-f6eb57c2`
- 본부 가상 에이전트 ID: `branch-lcc-core`
- 본부 지점 ID: `laptop-lucas-01`

실행 결과:

- `GET /api/lcc/health`: 성공, `200 OK`
- 응답 요약: `ok=true`, `l1=hanul-editor:9082`, `upstream.status=ok`
- 현재 환경의 `LCC_BRANCH_TOKEN`: 없음
- `GET /api/lcc/orders?branch_id=laptop-lucas-01`: `401 Unauthorized`
- 판정: 본부 L1/API 도달성은 정상이다. 보호 API, `intake`, `speak`, `inbox`, `ack-message`는 SRE 오웬이 전달할 64자 토큰 수령 후 재시도해야 한다.

## 10. 지사 인바운드 전용 통로 구성

본부가 지사로 들어오는 통로는 일반 Terminal Fleet 포트를 열지 않고, 별도 인바운드 전용 모드로 구성한다.

구현된 실행 모드:

- `LCC_INBOUND_ONLY=1`
- 권장 포트: `9102`
- 보호 헤더: `X-LCC-Token`
- 토큰 환경변수: `LCC_BRANCH_INBOUND_TOKEN`

허용 경로:

- `GET /api/branch/health`
- `GET /api/branch/status`
- `GET /api/branch/work-ledger`
- `GET /api/branch/messages`
- `POST /api/branch/messages`

차단되어야 하는 경로:

- `/api/sessions`
- `/api/sessions/*`
- `/ws/terminal`

로컬 스모크 결과:

- `GET /api/branch/health`: 성공
- `GET /api/branch/status` 토큰 없음: `401`
- `GET /api/branch/status` 테스트 토큰 사용: 성공
- `GET /api/sessions` 테스트 토큰 사용: `404`
- `POST /api/branch/messages` 테스트 토큰 사용: 성공
- `GET /api/branch/messages` 테스트 토큰 사용: 메시지 1건 확인

운영 문서:

- `docs/branch-inbound-ops.md`

본부 요청사항:

1. 지사용 실제 인바운드 토큰을 안전 채널로 지급한다.
2. 본부에서 지사 `9102`로 접근할 네트워크 경로를 결정한다.
3. 본부 출발지 allowlist 또는 VPN/터널 방식을 확정한다.
4. 토큰 없는 음성 테스트는 `401`, 토큰 있는 테스트는 상태/원장/메시지 확인으로 검증한다.

## 11. LIVE PASS 및 지사 인바운드 인계

작성 시각: 2026-05-31 KST

### LIVE PASS 결과

- 판정: LIVE PASS 성공.
- 본부 메시지 ID: `msg-1780198222835-f4b511e9`.
- 의미: 지사-본부 통신 경로는 실제 메시지 수신/처리 기준으로 통과했다.
- 실제 토큰은 이 보고서에 기록하지 않는다.

### 인코딩 원인 및 수정

- 원인: 일부 한글 문서와 PowerShell 출력이 UTF-8로 일관 처리되지 않아 콘솔/보고서에서 깨져 보였다.
- 수정 방향:
  - 문서 저장은 UTF-8로 통일한다.
  - HTTP 요청/응답은 `Content-Type: application/json; charset=utf-8`을 명시한다.
  - PowerShell 확인 시 `Get-Content -Encoding UTF8` 또는 UTF-8 터미널 설정을 사용한다.
  - 메시지 본문은 JSON 직렬화 단계에서 한글이 손상되지 않는지 확인한다.

### 토큰 로테이션 요청

- LIVE PASS에 사용된 토큰은 운영 보안을 위해 로테이션을 요청한다.
- 새 토큰은 문서, git, 채팅 로그, 스크린샷에 남기지 않는다.
- 전달 방식은 OS secret store, 안전 DM, 또는 본부 승인 보안 채널만 사용한다.
- 지사 환경변수명은 `LCC_BRANCH_INBOUND_TOKEN`을 기준으로 한다.

### 인바운드 `9102` 조건

- `9102`는 지사 인바운드 전용 포트로만 사용한다.
- 필수 환경:
  - `LCC_INBOUND_ONLY=1`
  - `LCC_API_HOST=0.0.0.0`
  - `LCC_API_PORT=9102`
  - `LCC_BRANCH_INBOUND_TOKEN` 설정
- 허용 범위:
  - `GET /api/branch/health`
  - `GET /api/branch/status`
  - `GET /api/branch/work-ledger`
  - `GET /api/branch/messages`
  - `POST /api/branch/messages`
- 금지 범위:
  - `/api/sessions`
  - `/api/sessions/*`
  - `/ws/terminal`
  - 임의 파일 접근, shell 실행, 터미널 입력 전달
- 본부 조건:
  - 본부/L1에서 지사 `9102`로 라우팅 경로가 있어야 한다.
  - 출발지 allowlist, VPN, 터널 중 하나를 확정해야 한다.
  - 보호 API는 `X-LCC-Token` 없이는 `401`이어야 한다.
