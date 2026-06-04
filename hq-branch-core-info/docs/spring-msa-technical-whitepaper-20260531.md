# Spring MSA Technical Whitepaper

Date: 2026-05-31  
Owner: Joon MSA  
Audience: Lucas  
Target session: 2026-05-31 20:00 KST  
Status: meeting-ready integrated draft

## 0. Executive Summary

MSA는 서버를 많이 띄우는 기술 목록이 아니라, 책임과 데이터 소유권과 배포 단위를 분리하는 아키텍처 운영 방식이다. 좋은 MSA는 좋은 경계에서 시작한다. 경계가 불명확한 상태에서 Spring Cloud, Gateway, Discovery, Kafka, Kubernetes부터 붙이면 단일 애플리케이션의 복잡성이 네트워크와 운영 복잡성으로 확산된다.

LCC Core의 현재 권장 방향은 바로 네트워크 MSA로 쪼개는 것이 아니다. 먼저 로컬 모놀리스로 실행 가능하게 유지하면서 `domain`, `application`, `adapters`, `providers` 계층을 정리하고, Work Ledger를 source of truth로 세우며, 서비스 후보별 데이터 소유권과 이벤트 계약을 안정화해야 한다.

20:00 수업의 핵심 문장은 다음과 같다.

> MSA는 코드를 많이 나누는 일이 아니라, 책임과 데이터 소유권과 변경의 경계를 명확히 나누는 일이다.

오늘 수업의 성공 기준은 Lucas가 `runtime-service`, `ledger-service`, `sync-service`의 책임과 데이터 소유권을 구분하고, `LedgerEventCreated` 이벤트 스키마를 직접 설명할 수 있는 것이다.

## 1. MSA 핵심 개념과 도입 판단

### 1.1 Monolith, Modular Monolith, MSA

| 구조 | 의미 | 장점 | 위험 |
| --- | --- | --- | --- |
| Monolith | 하나의 애플리케이션, 하나의 배포 단위 | 빠른 개발, 단순한 운영, 로컬 디버깅 쉬움 | 규모가 커지면 경계가 흐려지고 변경 영향 범위가 커짐 |
| Modular Monolith | 배포는 하나지만 내부 책임과 의존성을 모듈로 분리 | 경계를 낮은 운영 비용으로 검증 가능 | 빌드 규칙과 코드 리뷰가 약하면 다시 단일 덩어리로 흐름 |
| MSA | 서비스별 독립 배포, 독립 데이터 소유, API/Event 통신 | 독립 확장, 장애 격리, 팀별 책임 분리 | 네트워크 장애, 분산 트랜잭션, 관측성, 운영 비용 증가 |

MSA는 다음 조건이 있을 때 의미가 커진다.

- 서비스별 배포 주기와 장애 격리가 실제로 필요하다.
- 특정 기능만 독립적으로 확장해야 한다.
- 팀이 서비스 단위로 독립 책임을 가져야 한다.
- 데이터 소유권과 API/Event 계약이 이미 충분히 안정되어 있다.
- 운영팀이 로그, 메트릭, 트레이싱, 장애 대응을 감당할 수 있다.

반대로 다음 상태라면 MSA가 빠른 정답이 아니다.

- 도메인 경계가 아직 논의 중이다.
- 모든 기능이 같은 데이터베이스 테이블을 직접 읽고 쓴다.
- 서비스 간 계약보다 내부 구현 변경이 더 자주 바뀐다.
- 장애 추적, 배포 자동화, 모니터링 체계가 없다.
- 단순 CRUD 수준인데 네트워크 분리만 먼저 하려 한다.

LCC Core는 현재 "모듈러 모놀리스 먼저, MSA는 나중"이 더 안전하다. 미래 서비스 후보는 이미 보이지만, 첫 번째 안정 계약은 공유 DB가 아니라 이벤트 스키마여야 한다.

## 2. LCC Core Bounded Context와 서비스 후보

LCC Core의 장기 구조는 기능 이름이 아니라 책임과 데이터 소유권 기준으로 나누어야 한다.

| 후보 서비스 | 핵심 책임 | 직접 소유해야 하는 데이터 | 직접 접근하면 안 되는 데이터 |
| --- | --- | --- | --- |
| `runtime-service` | 터미널 세션 생성, 실행, 스트리밍, 종료, resize/input 전달 | session id, command, cwd, process state, stream metadata, runtime event | work item 본문, ledger audit record, license policy 원본 |
| `ledger-service` | Work Ledger, 작업 상태, 결정, 증거 참조, 감사 내역 | work item, ledger event, decision, evidence reference, audit export | 터미널 프로세스 상태, blob 원본 파일, auth credential |
| `sync-service` | HQ/branch/team 간 이벤트 동기화와 relay | sync checkpoint, outbound message, inbound message, conflict event | ledger 내부 테이블 직접 접근, runtime session table |
| `auth-service` | 사용자, 계정, 라이선스, SSO, 권한 정책 | user, account, role, license, policy, token metadata | work ledger event 본문, terminal stream |
| `artifact-service` | 로그, 스크린샷, evidence blob, 리포트 파일 보관 | artifact metadata, blob URI, checksum, retention policy | work item 상태, runtime process state |

### 2.1 경계 원칙

1. 서비스는 자기 데이터만 직접 소유한다.
2. 다른 서비스 데이터는 API 또는 이벤트로만 접근한다.
3. 테이블 기준이 아니라 책임 기준으로 나눈다.
4. 이벤트 스키마는 장기 계약이므로 처음부터 버전을 둔다.
5. 로컬 모놀리스에서도 같은 포트와 경계를 유지한다.

예를 들어 `ledger-service`는 `runtime-service`의 세션 테이블을 직접 조회하지 않는다. 런타임이 `TerminalSessionEnded` 이벤트를 발행하면, Ledger가 그 이벤트를 받아 evidence reference를 남긴다. 로그 파일의 원본 blob은 `artifact-service`가 소유하고, Ledger는 artifact id나 URI만 참조한다.

## 3. Spring Boot Service Anatomy

Spring Boot에서 각 서비스는 단순한 패키지 묶음이 아니라 하나의 실행 가능한 책임 단위로 설계한다.

`ledger-service`를 예로 들면 기본 구성은 다음과 같다.

| 구성 요소 | 역할 | 예시 | 주의점 |
| --- | --- | --- | --- |
| Controller | 외부 HTTP 요청을 애플리케이션 명령으로 바꾸는 entrypoint | `POST /ledger/events`, `GET /work-items/{id}/timeline` | 비즈니스 판단을 넣지 않는다 |
| Application Service | use case 실행, 트랜잭션 경계 조정 | `AppendLedgerEventService`, `CloseWorkItemService` | 상태 전이와 정책 판단은 여기서 조정한다 |
| Domain | 순수 업무 규칙과 상태 전이 | `WorkItem`, `LedgerEvent`, `Decision`, `EvidenceRef` | Spring Web, JPA, Kafka를 모르게 둔다 |
| Repository Port | 저장소 접근 추상화 | `WorkLedgerRepository`, `LedgerEventRepository` | application이 concrete DB client에 묶이지 않게 한다 |
| Repository Adapter | 실제 DB/JSONL/JPA 구현 | PostgreSQL adapter, local JSONL adapter | 저장 방식 변경을 adapter 안에 가둔다 |
| Configuration | Bean wiring, clock, serializer, publisher 설정 | `LedgerServiceConfig` | 환경값과 업무 규칙을 섞지 않는다 |
| Actuator Health | liveness, readiness, metrics | `/actuator/health`, `/actuator/metrics` | 살아 있음과 요청 처리 가능 상태를 구분한다 |

의존성 방향은 안쪽으로 향해야 한다.

```text
boot/config -> web adapter -> application -> domain
storage adapter -> application port -> domain
```

금지해야 할 방향은 다음과 같다.

```text
domain -> Spring Web
domain -> JPA EntityManager
application -> concrete PostgreSQL client
ledger-service -> runtime-service database
```

이 구조를 따르면 데이터베이스가 JSONL에서 PostgreSQL로 바뀌거나, 메시지 브로커가 in-memory에서 Kafka로 바뀌어도 domain과 핵심 use case가 흔들리지 않는다.

### 3.1 Multi-Module을 먼저 보는 이유

Multi-module은 폴더 정리가 아니라 빌드 도구로 책임 경계를 강제하는 구조다.

예시:

```text
ledger-domain
ledger-application
ledger-adapter-web
ledger-adapter-storage
ledger-provider-local
ledger-boot
```

권장 의존성:

```text
ledger-boot -> ledger-adapter-web -> ledger-application -> ledger-domain
ledger-adapter-storage -> ledger-application -> ledger-domain
```

금지 의존성:

```text
ledger-domain -> ledger-adapter-storage
ledger-domain -> Spring Web
ledger-application -> JPA EntityManager
```

MSA로 바로 가지 않고 multi-module을 먼저 쓰면, 네트워크와 배포 복잡성을 도입하기 전에 경계와 의존성 방향을 검증할 수 있다.

## 4. Gateway, Config, Discovery 판단 기준

### 4.1 API Gateway

Gateway는 외부 요청의 단일 진입점이다.

주 역할:

- URL/path 기반 라우팅
- 인증/인가 handoff
- 공통 로깅과 trace id 부여
- CORS, rate limit, timeout, retry 정책
- 외부 API shape와 내부 서비스 위치의 분리

LCC Core 예시:

```text
Client -> Gateway -> ledger-service
Client -> Gateway -> runtime-service
Client -> Gateway -> artifact-service
```

Gateway가 비즈니스 규칙을 가지면 안 된다. Gateway는 traffic policy와 routing 계층이지, `WorkItem` 상태 전이나 `LedgerEvent` 검증을 담당하는 서비스가 아니다.

도입할 만한 시점:

- 외부 클라이언트가 호출하는 서비스가 여러 개다.
- 인증, CORS, rate limit, 공통 로깅을 한 곳에서 처리해야 한다.
- 내부 서비스 주소를 외부에 노출하고 싶지 않다.

아직 과한 시점:

- 서비스가 하나뿐이다.
- 내부 서비스 간 통신만 있고 외부 API 진입점이 단순하다.
- MVP 단계에서 Nginx나 단순 reverse proxy로 충분하다.

### 4.2 Config Server

Config Server는 여러 서비스의 설정을 중앙에서 관리하는 도구다.

도입할 만한 시점:

- 서비스가 여러 개이고 환경별 설정이 반복된다.
- DB, Redis, timeout, feature flag, model setting이 서비스마다 흩어진다.
- 설정 변경 audit과 표준화가 중요하다.

아직 과한 시점:

- 서비스 수가 적고 설정이 단순하다.
- Kubernetes ConfigMap/Secret, Vault, cloud secret manager로 충분하다.
- Config Server 자체가 장애 지점이 되는 부담이 더 크다.

### 4.3 Service Discovery

Discovery는 서비스 인스턴스가 동적으로 늘고 줄며, 주소가 고정되지 않을 때 필요하다.

도입할 만한 시점:

- 같은 서비스의 인스턴스가 여러 개다.
- autoscaling 또는 VM/EC2 배포로 주소가 자주 바뀐다.
- client-side 또는 gateway-side load balancing이 필요하다.

아직 과한 시점:

- 로컬 모놀리스 또는 고정 포트 소수 서비스다.
- Kubernetes Service DNS나 cloud load balancer가 이미 discovery 역할을 한다.
- 서비스 경계와 데이터 계약이 아직 안정되지 않았다.

Lucas에게 줄 판단 순서는 다음이다.

1. 서비스 경계와 데이터 소유권을 먼저 정한다.
2. API/Event 계약을 먼저 정한다.
3. 그 다음 Gateway, Config, Discovery를 필요 조건에 맞게 붙인다.

## 5. Data Ownership, API Contract, Event Contract

### 5.1 데이터 소유권

MSA의 가장 중요한 규칙은 "각 서비스는 자기 데이터만 직접 읽고 쓴다"이다.

잘못된 예:

```text
ledger-service -> runtime DB 직접 조회
runtime-service -> ledger DB 직접 insert
sync-service -> ledger DB table join
```

올바른 예:

```text
runtime-service -> TerminalSessionEnded event -> ledger-service
ledger-service -> GET /work-items/{id} API -> sync-service
ledger-service -> WorkItemCompleted event -> sync-service
artifact-service -> artifact URI/checksum API -> ledger-service
```

### 5.2 REST와 Event 선택 기준

REST는 즉시 응답이 필요한 동기 요청에 적합하다.

REST가 맞는 경우:

- 사용자가 지금 화면에서 결과를 기다린다.
- 성공/실패에 따라 즉시 다음 동작을 결정해야 한다.
- 현재 상태 조회가 중요하다.
- 예: `GET /work-items/{id}/timeline`, `POST /sessions`

Event는 이미 발생한 상태 변화를 여러 서비스가 비동기로 따라가야 할 때 적합하다.

Event가 맞는 경우:

- 어떤 일이 발생했고 여러 서비스가 후속 처리를 해야 한다.
- producer는 consumer가 누구인지 몰라도 된다.
- 약간 늦게 반영되어도 업무적으로 허용된다.
- 예: `TerminalSessionEnded`, `WorkItemCompleted`, `LedgerEventCreated`

주의할 점: 이벤트는 명령이 아니라 사실이어야 한다. `CreateLedgerEvent`보다 `LedgerEventCreated`가 더 좋은 이벤트 이름이다.

### 5.3 Event Envelope

기본 이벤트 envelope:

```json
{
  "event_id": "evt-20260531-2000-001",
  "event_type": "WorkItemCompleted",
  "schema_version": 1,
  "occurred_at": "2026-05-31T20:00:00+09:00",
  "producer": "ledger-service",
  "trace_id": "trace-lcc-study-001",
  "correlation_id": "corr-spring-msa-study-2000",
  "causation_id": "evt-previous-001",
  "actor": {
    "type": "agent",
    "id": "joon-msa"
  },
  "payload": {}
}
```

필드 기준:

- `event_id`: 중복 처리 방지를 위한 전역 고유 ID
- `event_type`: 과거형 사실 이름
- `schema_version`: 계약 진화를 위한 버전
- `occurred_at`: producer 기준 실제 발생 시각
- `producer`: 이벤트를 발행한 서비스
- `trace_id`: API 호출과 이벤트 흐름 연결
- `correlation_id`: 하나의 업무 흐름 전체를 묶는 ID
- `causation_id`: 이 이벤트를 발생시킨 직전 메시지 ID
- `payload`: 이벤트 타입별 업무 데이터

`LedgerEventCreated` 예시:

```json
{
  "event_id": "evt-20260531-2000-002",
  "event_type": "LedgerEventCreated",
  "schema_version": 1,
  "occurred_at": "2026-05-31T20:00:00+09:00",
  "producer": "ledger-service",
  "trace_id": "trace-spring-msa-study-2000",
  "correlation_id": "corr-spring-msa-study-2000",
  "causation_id": "term-exit-20260531-0007",
  "work_item_id": "spring-msa-study-2000",
  "actor": {
    "type": "agent",
    "id": "joon-msa"
  },
  "payload": {
    "ledger_event_type": "study_completed",
    "summary": "Lucas completed Spring MSA boundary and event-contract study.",
    "evidence_refs": [
      "D:\\Lucas Core v0.1\\docs\\spring-msa-technical-whitepaper-20260531.md"
    ]
  }
}
```

## 6. Outbox, Idempotency, Saga, Eventual Consistency

### 6.1 분산 트랜잭션을 피해야 하는 이유

단일 DB 트랜잭션은 한 서비스 내부에서는 강력하다. 하지만 여러 서비스에 걸쳐 하나의 트랜잭션을 만들면 네트워크 지연, 부분 실패, 잠금, 재시도, 장애 복구가 모두 어려워진다.

나쁜 목표:

```text
runtime DB update + ledger DB insert + sync DB enqueue를 하나의 글로벌 트랜잭션으로 묶기
```

좋은 목표:

```text
각 서비스는 자기 로컬 트랜잭션을 완료하고, 이벤트와 재시도로 전체 상태를 맞춘다.
```

### 6.2 Outbox Pattern

Outbox는 "DB 변경은 성공했는데 이벤트 발행은 실패"하는 문제를 줄이기 위한 패턴이다.

`ledger-service` 예시:

1. `WorkItem` 상태를 `completed`로 바꾼다.
2. 같은 로컬 트랜잭션에서 `outbox_events`에 `WorkItemCompleted`를 저장한다.
3. 별도 publisher가 outbox row를 읽어 메시지 브로커나 sync-service로 발행한다.
4. 발행 성공 시 outbox row를 `published`로 표시한다.
5. 실패하면 재시도한다.

간단한 outbox table:

```text
outbox_event
- id
- aggregate_type
- aggregate_id
- event_type
- payload
- status: NEW | PUBLISHED | FAILED
- created_at
- published_at
```

핵심은 업무 데이터 변경과 outbox 저장이 같은 로컬 트랜잭션이라는 점이다. 외부 발행은 나중에 재시도 가능하게 만든다.

### 6.3 Idempotency

Idempotency는 같은 요청이나 이벤트가 여러 번 처리되어도 결과가 깨지지 않게 만드는 성질이다.

적용 예:

- `POST /ledger/events`는 `Idempotency-Key` 또는 `event_id` 중복을 확인한다.
- consumer는 `processed_event_id` 테이블에 처리 완료 이벤트를 기록한다.
- `sync-service`는 같은 `WorkItemCompleted`를 두 번 받아도 outbound message를 하나만 만든다.
- `ledger-service`는 `source_event_id + ledger_rule` unique key로 같은 evidence를 중복 생성하지 않는다.

### 6.4 Saga Pattern

Saga는 여러 서비스에 걸친 긴 업무 흐름을 여러 로컬 트랜잭션과 보상 작업으로 나누는 방식이다.

두 가지 방식:

- Choreography: 각 서비스가 이벤트를 듣고 다음 행동을 한다. 단순하지만 흐름 추적이 어려워질 수 있다.
- Orchestration: 중앙 orchestrator가 각 단계를 지시한다. 흐름은 명확하지만 orchestrator가 강한 결합 지점이 될 수 있다.

LCC Core에서 단순한 ledger 후속 처리는 choreography가 적합하다.

```text
runtime-service -> TerminalSessionEnded
ledger-service -> LedgerEventCreated
sync-service -> SyncMessageQueued
```

반대로 "승인 -> 기록 -> 차감 -> 정산 예약"처럼 반드시 순서와 보상 정책이 필요한 업무라면 orchestrated saga를 검토한다.

### 6.5 Eventual Consistency

Eventual consistency는 모든 서비스가 항상 동시에 같은 상태를 보장하지는 않지만, 재시도와 이벤트 처리 후에는 최종적으로 일관된 상태에 도달하게 만드는 방식이다.

예시 흐름:

```text
runtime-service
  -> TerminalSessionEnded 발행
ledger-service
  -> evidence reference 기록
  -> LedgerEventCreated 발행
sync-service
  -> HQ/branch outbound message 생성
```

중간에 `sync-service`가 잠시 실패해도 `ledger-service`의 기록은 유지된다. sync는 outbox/checkpoint를 기준으로 나중에 따라잡는다.

운영 보완책:

- consumer는 반드시 idempotent해야 한다.
- 실패 이벤트는 retry table 또는 DLQ에 보낸다.
- 화면에는 `PENDING_LEDGER`, `LEDGER_CREATED`, `LEDGER_FAILED`처럼 처리 상태를 명확히 보여준다.
- 이벤트에는 `trace_id`, `correlation_id`, `causation_id`를 포함한다.

## 7. Lucas 20:00 Study Plan

### 7.1 60분 진행안

| 시간 | 주제 | 목표 |
| --- | --- | --- |
| 0-5분 | 현재 이해 확인 | Lucas가 생각하는 MSA 정의와 LCC Core 분리 후보를 말하게 한다 |
| 5-15분 | Monolith, Modular Monolith, MSA | MSA가 서버 개수 문제가 아니라 책임/데이터/배포 경계 문제임을 정리한다 |
| 15-30분 | LCC Core bounded context | runtime, ledger, sync, auth, artifact 후보와 owned data를 구분한다 |
| 30-42분 | Spring Boot service anatomy | Controller, Service, Repository, Config, Actuator 역할을 `ledger-service`에 매핑한다 |
| 42-52분 | API/Event/Data ownership | 공유 DB 금지, API/Event 계약, outbox/idempotency/eventual consistency를 예시로 설명한다 |
| 52-60분 | 실습과 확인 | `LedgerEventCreated` 스키마와 서비스별 must-not-access 데이터를 작성하게 한다 |

### 7.2 Lucas 확인 질문

1. MSA와 모듈러 모놀리스의 가장 큰 차이는 무엇인가?
2. LCC Core를 지금 바로 네트워크 MSA로 쪼개면 어떤 위험이 생기는가?
3. 가장 먼저 서비스 후보로 안정화할 수 있는 LCC Core capability는 무엇이고, 왜 그런가?
4. `ledger-service`가 소유해야 하는 데이터는 무엇인가?
5. `runtime-service`가 `ledger-service` DB를 직접 읽으면 왜 안 되는가?
6. API Gateway는 어떤 문제를 해결하고, 어떤 비즈니스 로직을 가지면 안 되는가?
7. Config Server와 Discovery는 언제 필요하고 언제 과한가?
8. REST API와 Event는 각각 어떤 상황에 적합한가?
9. Outbox pattern은 어떤 실패 상황을 줄이기 위한 것인가?
10. `LedgerEventCreated`에 `trace_id`와 `schema_version`이 필요한 이유는 무엇인가?

## 8. Practice And Scoring

### 8.1 Practice A: `LedgerEventCreated` Schema

Lucas가 다음 필드를 포함한 작은 이벤트 스키마를 작성한다.

- `event_id`
- `event_type`
- `schema_version`
- `occurred_at`
- `producer`
- `actor`
- `work_item_id`
- `trace_id`
- `correlation_id`
- `causation_id`
- `payload`

Acceptance checklist:

- 모든 필수 필드를 포함한다.
- ledger 이벤트의 producer를 `ledger-service`로 둔다.
- `trace_id`가 장애 추적과 요청 흐름 연결에 쓰인다는 점을 설명한다.
- `schema_version`이 계약 진화에 필요하다는 점을 설명한다.
- payload를 단순 문자열 덤프가 아니라 업무 의미가 있는 구조로 둔다.

### 8.2 Practice B: Service Ownership Table

Lucas가 다음 표를 채운다.

| Service | Owns | Must not access directly | Communicates by |
| --- | --- | --- | --- |
| `runtime-service` | | | |
| `ledger-service` | | | |
| `sync-service` | | | |

Acceptance checklist:

- 각 서비스가 하나의 명확한 책임을 가진다.
- 각 서비스가 자기 데이터만 소유한다.
- 각 서비스마다 금지된 직접 접근이 최소 하나 이상 있다.
- 통신 방식이 공유 DB가 아니라 API 또는 Event다.
- `runtime-service -> ledger-service -> sync-service` 흐름이 이해 가능하다.

### 8.3 Scoring Checklist

각 항목을 `pass`, `partial`, `miss`로 표시한다.

| Check | Expected answer |
| --- | --- |
| MSA definition | Responsibility, data ownership, deployment boundary separation |
| Current LCC Core direction | Local monolith now, modular boundaries first |
| First stable contract | `LedgerEvent` event schema before network extraction |
| Data ownership rule | Services do not read or write each other's databases directly |
| Communication rule | API for commands/queries, events for state changes |
| Spring mapping | Boot app, controller, service/application layer, repository/port, actuator |
| Gateway judgment | Useful for external entrypoint, routing, auth handoff, traffic policy |
| Discovery/config judgment | Add when deployment/config complexity requires it |
| Transaction judgment | Prefer local transaction, outbox/saga/eventual consistency across services |
| LCC Core service candidates | runtime, ledger, sync, auth, artifact |

Minimum pass:

- Lucas can explain the MSA definition in his own words.
- Lucas can name why LCC Core should not split immediately.
- Lucas can complete at least Practice A or Practice B with no critical data ownership error.

## 9. Researcher 1-4 Focus

Researcher 1: Spring Boot service anatomy

- Focus only on Controller, Service/Application, Repository/Port, Config, Actuator.
- Reinforce multi-module as boundary enforcement before MSA extraction.
- Avoid Gateway/Discovery/transaction deep dive.

Researcher 2: Gateway, Config, Discovery

- Focus only on when these components are useful and when they are overkill.
- Keep the message: these tools do not define service boundaries.
- Avoid data ownership and outbox details except where needed for routing context.

Researcher 3: Data ownership, events, transactions

- Focus only on owned data, REST vs Event, Outbox, Idempotency, Saga, Eventual Consistency.
- Use LCC Core flow: `TerminalSessionEnded -> LedgerEventCreated -> SyncMessageQueued`.
- Avoid Spring component taxonomy except where it supports transaction boundaries.

Researcher 4: Validation and reporting

- Focus only on confirmation questions, practice tasks, scoring, and post-study report.
- Use the checklist in this document as the session verification sheet.
- Record completed/missed/blocked result after the 20:00 KST session.

## 10. REPORT Templates

Post-study report:

```text
[Spring MSA Study REPORT][2026-05-31 20:00 KST]
Status:
Completed/Missed/Blocked:
Lucas understanding:
Covered topics:
Practice A - LedgerEventCreated:
Practice B - Service ownership table:
Scoring checklist:
Open questions:
Next instruction:
Evidence:
```

PTY-visible concise report:

```text
REPORT spring-msa-study-2000 state=<completed|missed|blocked> evidence=<file/section/session> covered=<msa-basics,lcc-boundary,spring-boot,gateway-config-discovery,data-contract,outbox-idempotency-saga> practice=<pass|partial|miss> next=<next-action>
```

Whitepaper integration report:

```text
REPORT spring-msa-whitepaper state=completed evidence=D:\Lucas Core v0.1\docs\spring-msa-technical-whitepaper-20260531.md next=use-for-2026-05-31-20:00-KST-Lucas-study
```

## 11. Source Evidence

Integrated artifacts:

- `D:\Lucas Core v0.1\docs\spring-msa-technical-whitepaper-20260531.md`
- `D:\Lucas Core v0.1\docs\spring-msa-r4-checklist-template-20260531.md`
- `D:\Lucas Core v0.1\workspaces\joon-msa\repo\docs\spring-msa-lesson-draft-20260531.md`
- `D:\Lucas Core v0.1\workspaces\spring-msa-research-2\repo\REPORT.md`
- `D:\Lucas Core v0.1\workspaces\spring-msa-research-3\repo\docs\spring-msa-study-brief-20260531.md`

Supporting local evidence:

- `D:\Lucas Core v0.1\docs\architecture-roadmap.md`
- `D:\Lucas Core v0.1\docs\work-ledger-ops.md`
- `D:\Lucas Core v0.1\docs\spring-msa-study-brief-20260531.md`
- `D:\Lucas Core v0.1\docs\spring-msa-lesson-plan-lucas-20260531.md`

Constraint:

- HQ protected speak/inbox confirmation was not used because the current session has no branch token. The meeting plan is therefore based on local evidence and researcher artifacts.

## 12. LCC Core MSA 전환 설계 원칙

이 절은 Lucas가 실제로 LCC Core를 MSA 후보 구조로 바라볼 때 사용할 판단 기준이다. 핵심은 "지금 당장 서비스를 쪼갠다"가 아니라 "나중에 쪼갤 수밖에 없는 경계를 지금 코드와 데이터 계약에 반영한다"이다.

### 12.1 전환 순서

권장 순서는 다음과 같다.

1. 현재 기능을 capability 단위로 분류한다.
2. 각 capability가 소유해야 하는 데이터를 정한다.
3. 다른 capability가 직접 접근하면 안 되는 데이터를 적는다.
4. REST API가 필요한 요청과 event가 필요한 상태 변화를 분리한다.
5. 단일 프로세스 안에서 domain/application/adapter 경계를 먼저 강제한다.
6. 경계가 안정되고 운영 이유가 생겼을 때 별도 Spring Boot service로 분리한다.
7. 분리 후 gateway, discovery, config, broker를 필요 조건에 맞춰 추가한다.

이 순서를 지키면 MSA가 목표가 아니라 결과가 된다. 반대로 첫 단계에서 Spring Cloud, Kafka, Kubernetes부터 붙이면 경계가 불명확한 상태에서 운영 복잡도만 먼저 들어온다.

### 12.2 분리해도 되는 신호

다음 조건이 누적되면 서비스 분리를 검토할 수 있다.

- 해당 capability가 다른 기능과 다른 배포 주기를 가진다.
- 해당 capability만 독립적으로 확장해야 한다.
- 장애 격리가 실제 운영 가치가 있다.
- 데이터 소유권이 명확하고 공유 DB 없이 API/Event로 협력할 수 있다.
- 팀 또는 담당자가 독립적으로 운영 책임을 질 수 있다.
- 관측성, 배포 자동화, 장애 대응 절차가 준비되어 있다.

### 12.3 아직 분리하면 안 되는 신호

다음 상태라면 modular monolith가 더 적합하다.

- "어떤 테이블을 누가 소유하는가"에 답하지 못한다.
- 한 기능 변경이 여러 후보 서비스의 DB 변경을 동시에 요구한다.
- API/Event 계약보다 내부 클래스 구조가 더 자주 바뀐다.
- 장애 추적에 필요한 trace id, structured log, metric이 없다.
- 분리 이유가 운영 필요가 아니라 학습 또는 기술 도입 자체이다.

Lucas에게는 이 기준을 짧게 이렇게 말하면 된다.

```text
서비스를 나눌 준비가 됐다는 뜻은 코드 폴더가 나뉘었다는 뜻이 아니라,
데이터 소유권과 실패 처리 방식까지 나뉘었다는 뜻이다.
```

## 13. LCC Core 기준 서비스별 계약 초안

이 절은 20:00 수업 중 화이트보드 또는 문서 실습으로 바로 사용할 수 있는 계약 초안이다.

### 13.1 runtime-service

책임:

- terminal session 생성, 실행, 종료
- PTY stream, resize, input 전달
- command 실행 상태와 exit code 기록
- runtime lifecycle event 발행

소유 데이터:

- `session_id`
- `command`
- `cwd`
- `process_state`
- `started_at`
- `ended_at`
- `exit_code`
- `stream_ref`

발행 event:

- `TerminalSessionStarted`
- `TerminalSessionOutputAppended`
- `TerminalSessionEnded`
- `TerminalSessionFailed`

직접 접근하면 안 되는 데이터:

- work item 본문
- ledger audit record
- HQ sync checkpoint
- auth token 원본
- artifact blob 원본

### 13.2 ledger-service

책임:

- work item 상태 관리
- ledger event append
- decision, evidence reference, audit history 기록
- work item 완료 또는 보류 같은 업무 상태 event 발행

소유 데이터:

- `work_item_id`
- `work_item_status`
- `ledger_event_id`
- `decision`
- `evidence_ref`
- `audit_record`

발행 event:

- `LedgerEventCreated`
- `WorkItemCompleted`
- `WorkItemBlocked`
- `EvidenceAttached`

직접 접근하면 안 되는 데이터:

- runtime process table
- terminal stream 원본
- sync outbound queue
- artifact blob 파일 원본
- auth credential 원본

### 13.3 sync-service

책임:

- branch/HQ/team 간 event relay
- outbound message 생성
- inbound message 검증
- retry, checkpoint, conflict 기록

소유 데이터:

- `sync_message_id`
- `sync_checkpoint`
- `delivery_status`
- `retry_count`
- `remote_ref`
- `conflict_record`

발행 event:

- `SyncMessageQueued`
- `SyncMessageDelivered`
- `SyncMessageFailed`
- `SyncConflictDetected`

직접 접근하면 안 되는 데이터:

- ledger DB table
- runtime session table
- artifact blob 원본
- user credential 원본

### 13.4 artifact-service

책임:

- log, screenshot, report, evidence blob 저장
- checksum, retention, URI 관리
- artifact metadata 조회 API 제공

소유 데이터:

- `artifact_id`
- `artifact_uri`
- `checksum`
- `content_type`
- `size_bytes`
- `retention_policy`

발행 event:

- `ArtifactStored`
- `ArtifactExpired`
- `ArtifactChecksumFailed`

직접 접근하면 안 되는 데이터:

- work item 상태
- runtime process state
- sync delivery state
- auth credential 원본

### 13.5 auth-service

책임:

- account, user, role, license, policy 관리
- token metadata 관리
- service-to-service authorization 판단

소유 데이터:

- `user_id`
- `account_id`
- `role`
- `license`
- `policy`
- `token_metadata`

발행 event:

- `UserRoleChanged`
- `LicenseUpdated`
- `PolicyChanged`

직접 접근하면 안 되는 데이터:

- work item 본문
- terminal stream
- artifact blob 원본
- sync message payload 원본

## 14. 핵심 플로우 상세 설계

### 14.1 terminal session 종료 후 evidence 기록

목표는 runtime 종료 사실을 ledger evidence로 남기되, 두 서비스가 서로의 DB를 직접 만지지 않게 하는 것이다.

```text
Client
  -> runtime-service: POST /sessions
runtime-service
  -> stores local session state
runtime-service
  -> emits TerminalSessionEnded
ledger-service
  -> consumes TerminalSessionEnded
ledger-service
  -> appends LedgerEventCreated
artifact-service
  -> stores stream/log blob when needed
sync-service
  -> relays summary if policy requires
```

중요한 설계 포인트:

- `runtime-service`의 local transaction은 session 종료 상태 저장까지만 책임진다.
- `ledger-service`는 `TerminalSessionEnded.event_id`를 idempotency key로 사용한다.
- stream 원본이 크면 ledger에는 `artifact_id`, `artifact_uri`, `checksum`만 저장한다.
- sync 실패는 runtime 종료와 ledger 기록을 되돌리지 않는다.

예시 event:

```json
{
  "event_id": "evt-runtime-20260531-001",
  "event_type": "TerminalSessionEnded",
  "schema_version": 1,
  "occurred_at": "2026-05-31T20:10:00+09:00",
  "producer": "runtime-service",
  "trace_id": "trace-session-001",
  "correlation_id": "corr-workitem-msa-study",
  "payload": {
    "session_id": "term-001",
    "work_item_id": "spring-msa-study-2000",
    "exit_code": 0,
    "artifact_refs": [
      {
        "artifact_id": "art-term-log-001",
        "kind": "terminal-log"
      }
    ]
  }
}
```

### 14.2 work item 완료 후 HQ sync

목표는 ledger가 업무 완료의 source of truth가 되고, sync가 전달 책임만 갖는 것이다.

```text
Client
  -> ledger-service: POST /work-items/{id}/complete
ledger-service
  -> updates work item status
ledger-service
  -> writes WorkItemCompleted to outbox in same local transaction
outbox publisher
  -> publishes WorkItemCompleted
sync-service
  -> creates outbound message
sync-service
  -> retries delivery until completed or dead-lettered
```

중요한 설계 포인트:

- `ledger-service`가 HQ API를 직접 호출하지 않는다.
- `sync-service`가 ledger DB를 직접 join하지 않는다.
- `WorkItemCompleted`는 여러 번 전달될 수 있으므로 sync consumer는 idempotent해야 한다.
- HQ 전달 실패는 work item 완료 자체를 취소하지 않고 sync 상태로 별도 추적한다.

## 15. Spring Boot 구현 스켈레톤 지침

이 절은 코드 실습으로 넘어갈 때의 최소 구조이다. 지금 문서의 목적은 전체 프로젝트 생성이 아니라 "어떤 모양으로 시작해야 경계가 무너지지 않는가"를 보여주는 것이다.

권장 package/module 흐름:

```text
ledger-domain
  WorkItem
  LedgerEvent
  EvidenceRef

ledger-application
  AppendLedgerEventUseCase
  CompleteWorkItemUseCase
  LedgerEventRepository port
  EventPublisher port

ledger-adapter-web
  LedgerEventController
  CompleteWorkItemController
  request/response DTO

ledger-adapter-storage
  JsonlLedgerEventRepository or JpaLedgerEventRepository
  OutboxRepository

ledger-adapter-messaging
  OutboxEventPublisher
  TerminalSessionEndedConsumer

ledger-boot
  SpringBootApplication
  configuration
  actuator
```

application service 예시 책임:

```text
CompleteWorkItemUseCase
  - validate current work item state
  - mark completed
  - append ledger event
  - write WorkItemCompleted to outbox
  - commit one local transaction
```

controller가 하면 안 되는 일:

- work item 상태 전이 규칙 판단
- repository 직접 조합
- 외부 sync 호출
- event payload를 임의로 생성해서 우회 발행

domain이 알면 안 되는 것:

- HTTP status code
- Spring annotation
- JPA EntityManager
- Kafka topic name
- file path 또는 S3 client

## 16. 운영 리스크와 관측성 요구사항

MSA에서 장애는 "발생하지 않게 하는 것"보다 "어디서 멈췄는지 알 수 있게 하는 것"이 중요하다.

필수 로그 필드:

- `timestamp`
- `service`
- `level`
- `trace_id`
- `correlation_id`
- `event_id`
- `work_item_id`
- `message`
- `error_code`

필수 metric:

- API request count, latency, error rate
- event publish success/failure count
- consumer lag
- outbox pending count
- retry count
- dead-letter count
- sync delivery latency

필수 health 구분:

- liveness: 프로세스가 살아 있는가
- readiness: 요청을 받아도 되는가
- dependency health: DB, broker, external relay가 사용 가능한가

장애 대응 기준:

- outbox pending이 증가하면 publisher 또는 broker 상태를 먼저 본다.
- consumer lag이 증가하면 consumer 처리 시간과 idempotency 저장소를 본다.
- trace id가 끊기면 gateway, client, event publisher에서 propagation을 확인한다.
- sync 실패가 반복되면 ledger 완료 상태를 되돌리지 말고 sync retry/DLQ로 격리한다.

## 17. Lucas 수업 진행 스크립트

도입:

```text
오늘은 Spring 기능 이름을 외우는 시간이 아니라,
LCC Core를 나중에 MSA로 나눌 수 있게 책임과 데이터 경계를 그리는 시간입니다.
```

핵심 설명:

```text
MSA는 서버를 여러 개 띄우는 기술이 아닙니다.
각 서비스가 자기 책임과 자기 데이터를 갖고,
다른 서비스와는 API 또는 event 계약으로만 협력하게 만드는 운영 구조입니다.
```

LCC Core 연결:

```text
runtime은 terminal session을 알고,
ledger는 work item과 audit trail을 알고,
sync는 HQ로 무엇을 보냈는지를 압니다.
서로의 DB를 직접 읽는 순간 서비스 경계는 깨집니다.
```

Spring 연결:

```text
Spring Boot, Gateway, Config, Discovery는 경계를 구현하고 운영하기 위한 도구입니다.
도구가 경계를 정해주지는 않습니다.
먼저 경계를 정하고, 그 다음 필요한 도구를 붙입니다.
```

마무리:

```text
오늘 통과 기준은 하나입니다.
Lucas가 runtime-service, ledger-service, sync-service의 소유 데이터와 금지 접근을 말할 수 있고,
LedgerEventCreated event schema를 설명할 수 있으면 됩니다.
```

## 18. 다음 확장 작업

백서의 다음 보강 대상은 다음 순서가 적합하다.

1. `LedgerEventCreated`, `WorkItemCompleted`, `TerminalSessionEnded` JSON Schema 초안 작성
2. `ledger-service` multi-module 예제 Gradle 구조 작성
3. outbox table DDL과 retry state machine 작성
4. Spring Boot controller/use case/repository port 샘플 코드 작성
5. 20:00 수업 후 Lucas 답변 기반 보완 섹션 추가
