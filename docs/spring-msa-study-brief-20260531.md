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
