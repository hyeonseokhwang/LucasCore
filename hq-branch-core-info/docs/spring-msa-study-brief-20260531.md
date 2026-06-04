# Spring MSA Study Brief - 2026-05-31

Owner: Joon MSA
Priority: 20:00 KST Spring MSA study
Audience: Lucas
Status: HQ contact attempted; protected HQ APIs require a token not present in this session.

## 1. HQ Contact Log

### Attempt

- Time: 2026-05-31 KST, after Chief Min assignment
- Channel: `http://hanwool-board.duckdns.org:9082/api/lcc`
- Target person: Haneul / 하늘
- Agent id used in attempted request: `joon-msa`
- Result:
  - `GET /health`: success, `ok=true`, `l1=hanul-editor:9082`, upstream `ok`
  - `POST /speak`: failed with `401 Unauthorized`
  - `GET /inbox?virtual_agent_id=joon-msa`: failed with `401 Unauthorized`
- Constraint: no `LCC_BRANCH_TOKEN`, `X_LCC_TOKEN`, or `LCC_BRANCH_INBOUND_TOKEN` environment variable is present in this session.
- Security note: no token value was printed or persisted.

### Request Sent Or Prepared For Haneul

The following request was prepared for the approved HQ speak channel. Because the protected API returned `401`, it must be resent once the branch token is available in the current session.

```text
[Joon MSA -> 하늘][Spring MSA][20:00 study prep]
20:00 KST Spring MSA 스터디 준비를 위해 본사에서 보유한 진행 이력을 요청드립니다.

확인 요청:
1. 본사에서 이미 진행한 Spring MSA 학습/논의 범위
2. 사용한 예제, 문서, 코드, 아키텍처 방향
3. Lucas가 이미 이해한 내용과 아직 약한 부분
4. 오늘 20:00 스터디에서 반드시 다룰 주제
5. 실습 또는 과제로 남길 항목

응답에는 토큰, secret, private credential 값을 포함하지 말아 주세요.
가능하면 meeting id, canvas id, 문서 경로, commit id, ledger event id 같은 evidence reference를 함께 주세요.
```

### Response Summary

- Haneul answer received: not yet.
- Reason: current `joon-msa` session cannot authenticate to protected HQ `speak` or `inbox`.
- Usable local evidence:
  - `data/work-ledger.json`: 13:30 Spring MSA whitepaper and 20:00 Spring MSA study are scheduled.
  - `docs/architecture-roadmap.md`: future MSA boundary is event-based, not shared-database based.
  - `docs/work-ledger-ops.md`: 20:00 study must record completed/missed/blocked/snoozed state and next step.
  - `data/hq-hotline-session.jsonl`: earlier `branch-lcc-core` LIVE PASS exists, but it contains hotline/encoding support, not Spring MSA study history.

## 2. Current Understanding

No local record proves that a prior Spring MSA lesson was completed. The safest 20:00 plan is therefore a baseline-to-architecture session:

1. Confirm Lucas's current mental model.
2. Explain MSA using LCC Core's concrete future boundaries.
3. Connect Spring components only where they solve a real boundary problem.
4. Leave one small practical assignment.

Local architecture direction already favors:

- Local monolith first, clean boundaries now.
- Domain/application/adapters/provider layering.
- Work Ledger as source of truth.
- Future services split by capability, not by database table.
- Event schema as the first integration contract.
- No shared database between services as the default MSA rule.

Candidate future services from the roadmap:

- `runtime-service`: terminal/session lifecycle and streaming
- `ledger-service`: work items, ledger events, audit export
- `sync-service`: team replication and cloud relay
- `auth-service`: account, license, SSO, policy
- `artifact-service`: logs, screenshots, evidence blobs

## 3. Required Topics For 20:00

Must cover:

1. What MSA is and when it is not worth using.
2. Service boundary design using LCC Core examples.
3. Spring Boot service shape: controller, service, repository, config, health.
4. API Gateway role: external entry point, routing, auth handoff, rate/traffic policy.
5. Service discovery and config: when useful, when overkill.
6. Inter-service communication: REST for queries/commands, events for state changes.
7. Data ownership: each service owns its own data; other services consume APIs/events.
8. Transactions: local transaction first, saga/outbox/eventual consistency for cross-service flow.
9. Observability: logs, metrics, tracing, health checks.
10. Practical next step: define an event schema and one service boundary before coding.

Defer unless Lucas asks:

- Kubernetes deep dive
- Full Spring Cloud component matrix
- Kafka operations tuning
- Multi-region or high-scale deployment
- Premature service extraction from the current local monolith

## 4. 30 Minute Plan

Goal: give Lucas a usable mental model quickly.

1. 0-5 min: ask Lucas what he thinks MSA means and where it might apply to LCC Core.
2. 5-12 min: explain monolith vs modular monolith vs MSA.
3. 12-20 min: map LCC Core into possible future services: runtime, ledger, sync, auth, artifact.
4. 20-27 min: explain the three hardest rules: service owns data, communicate by API/event, distributed transactions are avoided.
5. 27-30 min: assign one task: write `LedgerEvent` event schema fields and producer/consumer examples.

## 5. 60 Minute Plan

Goal: cover architecture choices and Spring mapping.

1. 0-10 min: diagnosis and vocabulary alignment.
2. 10-20 min: LCC Core target architecture: local monolith now, service boundaries later.
3. 20-35 min: Spring Boot service anatomy and where gateway/config/discovery fit.
4. 35-45 min: communication patterns: REST vs event, outbox pattern, idempotency.
5. 45-55 min: data ownership and transaction examples using `ledger-service` and `runtime-service`.
6. 55-60 min: recap, questions, and assignment.

## 6. 90 Minute Plan

Goal: leave Lucas with explanation ability plus a small design artifact.

1. 0-10 min: Lucas baseline check and today's target.
2. 10-25 min: MSA fundamentals with simple LCC examples.
3. 25-40 min: service boundary workshop: runtime, ledger, sync, auth, artifact.
4. 40-55 min: Spring stack mapping:
   - Spring Boot for each service
   - Spring Cloud Gateway for ingress
   - Config management only after config duplication appears
   - Discovery only if deployment topology requires it
5. 55-70 min: data and transaction workshop:
   - owner database per service
   - event publication
   - eventual consistency
   - outbox pattern
6. 70-82 min: observability and operations:
   - health checks
   - structured logs
   - trace id
   - metrics
7. 82-90 min: Lucas explains back the design; record next homework.

## 7. Practice Or Homework

Minimum assignment:

1. Define a `LedgerEventCreated` event schema:
   - `event_id`
   - `event_type`
   - `occurred_at`
   - `producer`
   - `work_item_id`
   - `actor`
   - `payload`
   - `schema_version`
   - `trace_id`
2. Draw two flows:
   - `runtime-service` emits terminal session event -> `ledger-service` records evidence.
   - `ledger-service` emits work item completed -> `sync-service` sends branch/HQ update.
3. Write one rule for each service saying what data it owns and what it must not access directly.

Stretch assignment:

1. Create a tiny Spring Boot skeleton for `ledger-service`.
2. Add one POST endpoint for appending a ledger event.
3. Add one health endpoint.
4. Do not add discovery, gateway, Kafka, or Kubernetes until the boundary and event schema are clear.

## 8. Korean Summary For Lucas

MSA는 "서버를 많이 쪼개는 기술"이 아니라 "책임과 데이터 소유권을 분리하는 운영 방식"입니다.

지금 LCC Core는 바로 MSA로 쪼개기보다, 먼저 모듈 경계를 깨끗하게 잡는 게 맞습니다. 예를 들면 터미널 실행은 `runtime-service`, 작업 원장은 `ledger-service`, 본사/지사 동기화는 `sync-service`, 계정/권한은 `auth-service`, 로그와 증거 파일은 `artifact-service` 후보가 됩니다.

핵심 규칙은 세 가지입니다.

1. 한 서비스는 자기 데이터만 직접 소유합니다.
2. 다른 서비스와는 API나 이벤트로만 대화합니다.
3. 여러 서비스가 한 번에 같은 DB 트랜잭션을 잡는 구조는 피합니다.

Spring으로 구현한다면 각 서비스는 Spring Boot 앱이 되고, 외부 입구는 Gateway가 담당합니다. 서비스가 많아지고 배포가 복잡해질 때 Config, Discovery, 메시징, Kubernetes를 붙입니다. 처음부터 전부 붙이면 공부가 아니라 복잡도만 늘어납니다.

오늘 20:00에는 "LCC Core를 MSA로 바꾼다면 어디를 어떻게 나눌 것인가"를 기준으로 이해하면 됩니다. 공부 결과물은 코드보다 먼저 `LedgerEvent` 이벤트 스키마와 서비스별 데이터 소유권 표가 되어야 합니다.

## 9. Open Items For Haneul

Pending HQ/Haneul confirmation:

1. Prior Spring MSA sessions already completed.
2. Exact examples, documents, repositories, or diagrams used by HQ.
3. Lucas's already-understood points and weak points.
4. Whether the 20:00 session should be general Spring MSA, LCC Core architecture, or both.
5. Whether a code exercise is expected today.

## 10. Chief Min Status

- 20:00 Spring MSA study is being treated as top priority.
- HQ health checked successfully.
- Direct protected communication to Haneul is blocked by missing session token.
- The Haneul request text is prepared and token-safe.
- Study brief now contains a fallback plan that can run even without HQ history.
- No product code edits were made.

## 11. Researcher 1 REPORT - MSA Fundamentals Lesson Notes

Owner: Spring MSA Researcher 1
Scope: monolith vs modular monolith vs MSA, when not to use MSA, LCC Core examples
Audience: Lucas
Language: Korean lesson notes

### 11.1 핵심 한 줄

MSA는 "서버를 많이 만드는 기술"이 아니라 "책임, 데이터 소유권, 배포 책임을 서비스 단위로 분리하는 운영 방식"입니다. 지금 LCC Core는 바로 MSA로 쪼개기보다, 먼저 모듈러 모놀리스로 경계를 잡고 나중에 필요한 부분만 서비스로 분리하는 흐름이 맞습니다.

### 11.2 세 가지 구조 비교

| 구조 | 의미 | 장점 | 비용 | LCC Core 예시 |
| --- | --- | --- | --- | --- |
| 모놀리스 | 하나의 애플리케이션 안에 UI/API/도메인/저장이 함께 배포되는 구조 | 개발, 실행, 디버깅, 배포가 단순함 | 코드가 커지면 경계가 흐려지고 변경 영향이 넓어짐 | 현재 `apps/api`가 세션, 캔버스, 피어 메시지, 워크 원장 API를 한 프로세스에서 제공 |
| 모듈러 모놀리스 | 배포는 하나지만 내부를 도메인 모듈과 포트로 분리한 구조 | 운영은 단순하게 유지하면서 미래 분리 가능성을 확보 | 모듈 경계를 지키는 설계 discipline이 필요함 | `domain`, `application`, `adapters`, `providers`로 나누고 `WorkLedgerRepository`, `SessionEventSource`, `SyncProvider` 같은 포트로 연결 |
| MSA | 여러 서비스가 각자 책임과 데이터를 소유하고 API/이벤트로 통신하는 구조 | 팀/배포/확장/장애 격리를 서비스 단위로 할 수 있음 | 네트워크, 인증, 관측성, 데이터 정합성, 배포 자동화 비용이 급증 | 미래의 `runtime-service`, `ledger-service`, `sync-service`, `auth-service`, `artifact-service` |

Lucas 레벨에서 가장 중요한 구분은 "코드를 폴더로 나눴는가"가 아닙니다. 진짜 구분은 "데이터를 누가 소유하는가", "변경을 누가 배포하는가", "장애가 어디까지 번지는가"입니다.

### 11.3 모놀리스

모놀리스는 나쁜 구조가 아닙니다. 초기 제품, 로컬 도구, 운영자가 한 명이거나 팀이 작은 제품에는 모놀리스가 가장 빠르고 안전한 경우가 많습니다.

LCC Core의 현재 모습은 모놀리스에 가깝습니다. Rust Axum API 하나가 세션 생성, 터미널 스트리밍, 캔버스, 피어 메시지, 워크 원장 라우트를 함께 들고 있습니다. 로컬 JSON 파일을 쓰고, React UI가 이 API를 호출합니다. 이 구조는 v0.1에는 합리적입니다. 이유는 실행 환경이 로컬이고, 설치 요구사항을 줄여야 하며, 아직 서비스 경계보다 제품 기능 검증이 더 중요하기 때문입니다.

모놀리스의 위험은 "한 파일에 코드가 많다"가 아니라 "업무 규칙이 웹 라우트, 파일 저장, UI 모양에 섞이는 것"입니다. 그래서 지금 해야 할 일은 서버를 쪼개는 것이 아니라 업무 규칙을 도메인과 애플리케이션 계층으로 빼는 것입니다.

### 11.4 모듈러 모놀리스

모듈러 모놀리스는 LCC Core의 다음 정답에 가깝습니다. 하나의 프로세스로 배포하지만 내부는 미래 서비스 후보처럼 나눕니다.

예를 들면 다음처럼 나눌 수 있습니다.

| 모듈 | 책임 | 직접 소유해야 할 것 | 직접 알면 안 되는 것 |
| --- | --- | --- | --- |
| `runtime` | 터미널 세션 생성, 종료, 입력, 출력 스트리밍 | 세션 상태, pty 이벤트, 실행 정책 | 워크 원장의 저장 방식 |
| `ledger` | 작업, 이벤트, 증거, 감사 기록 | `WorkItem`, `LedgerEvent`, `Evidence` | 터미널 pty 구현 방식 |
| `sync` | 본사/지사/팀 간 이벤트 동기화 | 동기화 큐, 충돌 기록, 전송 상태 | 로컬 UI 세부 상태 |
| `auth` | 계정, 라이선스, 권한 정책 | 사용자, 토큰 정책, 권한 규칙 | 터미널 출력 내용 |
| `artifact` | 로그, 스크린샷, 증거 파일 | 파일 메타데이터, 보관 위치, 해시 | 워크 아이템 상태 변경 규칙 |

이 단계에서는 네트워크 호출을 늘리지 않습니다. 대신 모듈 사이를 포트로 연결합니다. 예를 들어 `runtime`은 터미널 이벤트를 만들고, `ledger`는 `SessionEventSource` 포트를 통해 그 이벤트를 받아 `LedgerEvent`로 기록합니다. 나중에 MSA로 분리하더라도 이 포트가 API나 이벤트 컨슈머로 바뀌면 됩니다.

### 11.5 MSA

MSA는 서비스마다 책임과 데이터 소유권이 분리됩니다. `ledger-service`가 워크 원장 데이터를 소유한다면 `runtime-service`는 원장 DB를 직접 읽거나 쓰면 안 됩니다. 대신 API를 호출하거나 이벤트를 발행해야 합니다.

LCC Core를 미래에 MSA로 나눈다면 자연스러운 후보는 다음과 같습니다.

| 서비스 | 책임 | 소유 데이터 | 통신 방식 예시 |
| --- | --- | --- | --- |
| `runtime-service` | 에이전트 세션 생명주기, 터미널 스트리밍 | 세션 메타데이터, 실행 상태 | 세션 이벤트 발행, 세션 조회 API |
| `ledger-service` | 작업 원장, 이벤트, 감사 export | 작업, 원장 이벤트, 결정, 증거 참조 | 원장 API, `LedgerEventCreated` 이벤트 |
| `sync-service` | 본사/지사/클라우드 릴레이 | 동기화 배치, 충돌, 노드 시퀀스 | 이벤트 배치 push/pull |
| `auth-service` | 계정, 라이선스, SSO, 정책 | 사용자, 권한, 라이선스 | 토큰 검증 API, 정책 이벤트 |
| `artifact-service` | 로그, 스크린샷, evidence blob | 파일, 해시, 보관 정책 | 업로드 API, evidence metadata 이벤트 |

MSA에서 어려운 점은 코드 작성이 아니라 운영입니다. 서비스가 5개가 되면 로그도 5곳, 배포도 5개, 장애 지점도 5개, 인증도 서비스 간으로 늘어납니다. 하나의 기능이 여러 서비스를 지나가면 trace id, 재시도, idempotency, outbox, dead letter, health check가 필요해집니다.

### 11.6 MSA를 쓰지 말아야 하는 경우

다음 조건이면 MSA를 피해야 합니다.

1. 도메인 경계가 아직 불분명하다.
2. 한 팀이나 한 사람이 대부분의 기능을 같이 고친다.
3. 서비스별 독립 배포가 실제로 필요하지 않다.
4. 데이터 소유권을 나눌 준비가 안 되어 있다.
5. 장애 추적, 로그 집계, metrics, tracing 체계가 없다.
6. CI/CD와 환경 관리가 약하다.
7. 네트워크 장애, 중복 이벤트, eventual consistency를 감당할 이유가 없다.
8. 단순 CRUD나 로컬 도구인데 운영 복잡도만 늘어난다.

LCC Core는 현재 이 조건 중 여러 개에 해당합니다. 특히 v0.1은 로컬 우선 제품이고, 설치가 쉬워야 하며, Work Ledger 도메인도 아직 막 정리되는 중입니다. 따라서 지금 MSA로 분리하면 제품 안정성보다 배포와 통신 복잡도가 먼저 커집니다.

### 11.7 Lucas에게 설명할 때 사용할 비유

LCC Core를 하나의 지휘실이라고 보면 됩니다.

모놀리스는 한 방 안에서 모든 담당자가 같은 화이트보드를 보며 일하는 방식입니다. 빠르고 말이 잘 통하지만 사람이 많아지면 복잡합니다.

모듈러 모놀리스는 같은 방 안에 있되, 세션 담당, 원장 담당, 동기화 담당, 권한 담당의 책상을 나누고 각자 책임 문서를 갖는 방식입니다. 아직 건물은 하나라 운영은 쉽습니다.

MSA는 각 담당 부서를 다른 사무실로 독립시키고, 문서 전달 규칙과 승인 절차를 갖추는 방식입니다. 독립성은 커지지만 전화, 문서, 감사, 보안, 장애 대응 비용이 생깁니다.

### 11.8 LCC Core 기준 의사결정 규칙

지금 결정은 다음 순서가 맞습니다.

1. 먼저 모놀리스로 제품 흐름을 완성합니다.
2. Work Ledger를 도메인 중심으로 분리합니다.
3. `runtime`, `ledger`, `sync`, `auth`, `artifact` 모듈 경계를 코드 안에서 지킵니다.
4. 각 모듈의 소유 데이터와 포트를 문서화합니다.
5. 이벤트 스키마를 먼저 안정화합니다.
6. 실제로 독립 배포, 독립 확장, 장애 격리가 필요해진 서비스만 MSA로 분리합니다.

서비스를 쪼갤지 판단할 때 질문은 하나입니다.

> 이 기능은 별도 서비스가 되었을 때 운영 비용보다 독립 배포, 독립 확장, 장애 격리 이득이 더 큰가?

LCC Core에서 첫 분리 후보는 `ledger-service`입니다. 이유는 Work Ledger가 제품의 source of truth가 될 가능성이 높고, UI/터미널 런타임보다 감사 기록과 동기화 요구가 더 오래 살아남기 때문입니다. 하지만 그 전에도 `LedgerEvent` 스키마와 `WorkLedgerRepository` 포트가 먼저 필요합니다.

### 11.9 20:00 수업 진행안

1. 0-5분: Lucas가 생각하는 MSA 정의를 먼저 말하게 합니다.
2. 5-15분: 모놀리스, 모듈러 모놀리스, MSA를 LCC Core로 비교합니다.
3. 15-25분: 왜 지금 LCC Core는 MSA보다 모듈러 모놀리스가 맞는지 설명합니다.
4. 25-40분: `runtime`, `ledger`, `sync`, `auth`, `artifact` 후보 경계를 같이 그립니다.
5. 40-50분: 데이터 소유권 규칙을 훈련합니다. "다른 서비스 DB 직접 접근 금지"를 강조합니다.
6. 50-60분: 숙제: `LedgerEventCreated` 스키마와 producer/consumer 예시를 작성합니다.

### 11.10 Lucas가 외워야 할 문장

- MSA는 기술 목록이 아니라 책임과 데이터 소유권을 나누는 운영 구조입니다.
- 모놀리스는 실패가 아니라 초기 제품에 자주 맞는 선택입니다.
- 모듈러 모놀리스는 MSA로 가기 전 가장 중요한 훈련장입니다.
- 서비스는 자기 데이터만 직접 소유하고, 남의 데이터는 API나 이벤트로만 봅니다.
- MSA는 경계가 명확하고 독립 배포가 필요할 때 이득이 납니다.
- LCC Core는 지금 바로 MSA가 아니라, Work Ledger 중심 모듈 경계를 먼저 세워야 합니다.

### 11.11 REPORT

Spring MSA Researcher 1 section completed.

- Covered: monolith, modular monolith, MSA, when not to use MSA.
- Applied to LCC Core: current local monolith, target modular monolith, future `runtime-service`, `ledger-service`, `sync-service`, `auth-service`, `artifact-service`.
- Recommendation: do not split LCC Core into MSA now. Build clean module boundaries and event contracts first.
- First concrete artifact for Lucas: `LedgerEventCreated` schema and service data ownership table.
