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
  meeting_id = "mtg-1775891024242"
  virtual_agent_id = "branch-lcc-core"
  content = "[dev-lead -> HQ][branch:lcc-core] LCC Core 지사 통신 테스트입니다."
  threadId = "msg-1778407512628-ccddfe77"
  targets = @("lucas", "cto", "dev-2")
} | ConvertTo-Json -Compress

Invoke-RestMethod `
  -Method Post `
  -Uri "http://hanwool-board.duckdns.org:9082/api/lcc/speak" `
  -Headers $headers `
  -ContentType "application/json; charset=utf-8" `
  -Body $body
```
