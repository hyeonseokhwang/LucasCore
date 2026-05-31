# Lucas Spring MSA Lesson Plan - 2026-05-31 20:00 KST

Owner: Chief Min
Study owner: Joon MSA
Audience: Lucas
Source context:
- `data/branch-boot-context.md`
- `data/branch-org.json`
- `docs/spring-msa-study-brief-20260531.md`
- `docs/architecture-roadmap.md`

## 1. 수업 목표

오늘 목표는 Lucas가 Spring MSA를 "서버를 많이 쪼개는 기술"이 아니라 "책임, 데이터 소유권, 운영 경계를 분리하는 설계 방식"으로 이해하는 것이다.

수업이 끝나면 Lucas는 다음을 설명할 수 있어야 한다.

1. 모놀리스, 모듈러 모놀리스, MSA의 차이
2. LCC Core를 바로 MSA로 쪼개면 위험한 이유
3. 미래에 나눌 수 있는 서비스 후보와 각 책임
4. Spring Boot, Gateway, Config, Discovery가 어디에 쓰이는지
5. 서비스별 데이터 소유권, API/Event 통신, 분산 트랜잭션 회피 원칙
6. `LedgerEvent` 이벤트 스키마를 직접 설계하는 방법

## 2. 60분 아젠다

### 0-5분: 기준 맞추기

- 질문: "Lucas가 생각하는 MSA는 무엇인가?"
- 질문: "LCC Core에서 가장 먼저 분리하고 싶은 기능은 무엇인가?"
- 목표 선언: 오늘은 Spring 기술 목록 암기가 아니라 LCC Core를 기준으로 경계 설계를 배운다.

### 5-15분: MSA 기본 개념

- 모놀리스: 하나의 배포 단위, 하나의 런타임, 내부 호출 중심
- 모듈러 모놀리스: 배포는 하나지만 내부 책임 경계가 명확함
- MSA: 서비스마다 독립 배포, 독립 데이터 소유권, API/Event 통신
- 핵심 메시지: 좋은 MSA는 좋은 모듈 경계에서 출발한다.

### 15-30분: LCC Core 예제로 서비스 경계 잡기

후보 서비스:

- `runtime-service`: 터미널 세션 생성, 종료, PTY streaming, resize, prompt 전송
- `ledger-service`: 작업, 결정, 증거, 리뷰, handoff 기록
- `sync-service`: HQ/branch/team 간 이벤트 동기화
- `auth-service`: 계정, 라이선스, SSO, 권한 정책
- `artifact-service`: 로그, 스크린샷, 리포트, evidence blob 보관

현재 방향:

- 지금은 로컬 모놀리스 유지
- 먼저 domain/application/adapters/providers 경계를 만든다.
- Canvas 저장소를 장기 원장으로 쓰지 않고 Work Ledger를 source of truth로 만든다.
- MSA 전환 시 공유 DB가 아니라 이벤트 스키마를 첫 계약으로 삼는다.

### 30-42분: Spring MSA 구성요소 연결

- Spring Boot: 각 서비스의 기본 실행 단위
- Controller: 외부 요청을 받는 HTTP entrypoint
- Service/Application layer: 유스케이스 실행
- Repository/Port: 데이터 접근 추상화
- Actuator: health, metrics, 운영 확인
- Gateway: 외부 entrypoint, routing, auth handoff, rate/traffic policy
- Config: 여러 서비스의 설정 중복과 환경별 차이가 커질 때 사용
- Discovery: 서비스 인스턴스가 동적으로 늘고 줄 때 사용

주의:

- 처음부터 Gateway, Discovery, Config, Kafka, Kubernetes를 모두 붙이면 학습이 아니라 복잡도만 증가한다.
- LCC Core는 먼저 `ledger-service` 경계와 event contract를 잡는 것이 우선이다.

### 42-52분: 데이터와 트랜잭션

핵심 규칙:

1. 각 서비스는 자기 데이터만 직접 소유한다.
2. 다른 서비스 데이터는 API 또는 Event로만 접근한다.
3. 여러 서비스에 걸친 하나의 DB transaction을 기본으로 설계하지 않는다.

예시:

- `runtime-service`가 터미널 세션 종료 이벤트를 발행한다.
- `ledger-service`는 그 이벤트를 받아 작업 증거로 기록한다.
- `sync-service`는 ledger event를 HQ로 전달한다.
- 실패 시 즉시 일관성보다 재시도, outbox, idempotency로 맞춘다.

### 52-60분: 실습과 확인

- Lucas가 직접 `LedgerEventCreated` 스키마를 말로 설명한다.
- 서비스별 소유 데이터와 금지 접근을 1개씩 적는다.
- 다음 과제를 확정한다.

## 3. 설명 흐름

1. "MSA는 기술 제품 목록이 아니라 책임 분리 방식"이라고 시작한다.
2. "지금 LCC Core는 바로 쪼개기보다 모듈 경계를 먼저 만드는 단계"라고 연결한다.
3. Work Ledger를 예로 들어 domain/application/adapters/providers를 설명한다.
4. 미래 서비스 후보를 보여주되, 각 서비스가 소유할 데이터와 하지 말아야 할 일을 같이 말한다.
5. Spring Boot service shape로 내려와 Controller, Service, Repository, Config, Actuator를 연결한다.
6. Gateway, Config, Discovery는 "필요해지는 조건" 중심으로 설명한다.
7. 데이터 소유권과 이벤트 계약을 강조한다.
8. `LedgerEventCreated` 실습으로 마무리한다.

## 4. LCC Core 예시

### 예시 1: 터미널 세션 종료

- 현재: API가 세션 상태와 preview를 직접 관리한다.
- 미래:
  - `runtime-service` owns: session id, command, cwd, lifecycle, stream
  - `ledger-service` owns: work item, ledger event, evidence reference
  - 이벤트: `TerminalSessionExited`
  - 흐름: runtime emits event -> ledger records evidence -> sync forwards summary

### 예시 2: 작업 완료 보고

- `ledger-service`가 `WorkItemCompleted` 이벤트를 발행한다.
- `sync-service`가 HQ/branch relay로 전달한다.
- `artifact-service`는 첨부 로그와 스크린샷을 보관하고 URI만 ledger에 연결한다.

### 예시 3: 권한 검증

- `auth-service`는 사용자, 토큰, 권한 정책을 소유한다.
- `runtime-service`와 `ledger-service`는 auth DB를 직접 읽지 않는다.
- Gateway 또는 service-to-service auth handoff로 검증한다.

## 5. 실습

### 최소 실습: `LedgerEventCreated` 스키마

필드:

- `event_id`
- `event_type`
- `schema_version`
- `occurred_at`
- `producer`
- `actor`
- `work_item_id`
- `trace_id`
- `payload`

예시:

```json
{
  "event_id": "evt-20260531-2000-001",
  "event_type": "LedgerEventCreated",
  "schema_version": 1,
  "occurred_at": "2026-05-31T20:00:00+09:00",
  "producer": "ledger-service",
  "actor": "chief-min",
  "work_item_id": "spring-msa-study-2000",
  "trace_id": "trace-lcc-study-001",
  "payload": {
    "kind": "study_note",
    "body": "Lucas completed MSA boundary exercise."
  }
}
```

### 확장 실습

1. `runtime-service`가 `TerminalSessionExited`를 발행한다.
2. `ledger-service`가 evidence event로 기록한다.
3. `sync-service`가 HQ에 요약 이벤트를 전송한다.
4. 각 단계에서 직접 DB 접근이 금지되는 지점을 표시한다.

## 6. 확인 질문

1. MSA와 모듈러 모놀리스의 가장 큰 차이는 무엇인가?
2. LCC Core를 지금 바로 MSA로 쪼개지 않는 이유는 무엇인가?
3. `ledger-service`가 직접 `runtime-service` DB를 읽으면 왜 안 되는가?
4. Gateway는 어떤 문제를 해결하는가?
5. Discovery는 언제 필요하고 언제 과한가?
6. REST와 Event는 각각 어떤 상황에 적합한가?
7. cross-service transaction을 피해야 하는 이유는 무엇인가?
8. Outbox pattern이 필요한 상황은 무엇인가?
9. `LedgerEventCreated`에 `trace_id`가 필요한 이유는 무엇인가?
10. LCC Core에서 가장 먼저 안정화해야 할 MSA 계약은 무엇인가?

## 7. Joon MSA와 리서처 지시

Joon MSA:

- 이 수업안 기준으로 20:00 KST 진행 자료를 정리한다.
- HQ/Haneul confirmation이 없으면 local evidence 기반 fallback plan으로 진행한다.
- 수업 후 `spring-msa-study-2000` ledger event에 완료/미완료/blocked와 다음 과제를 남긴다.

Researcher 1:

- Spring Boot service anatomy 예시를 준비한다.
- Controller, Service, Repository, Config, Actuator를 LCC Core `ledger-service` 후보에 매핑한다.

Researcher 2:

- Gateway, Config, Discovery가 필요한 조건과 과한 조건을 비교한다.
- "처음부터 붙이지 말아야 할 것" 목록을 정리한다.

Researcher 3:

- 데이터 소유권, outbox, idempotency, eventual consistency 설명 예시를 준비한다.
- `runtime-service` -> `ledger-service` 이벤트 흐름을 검토한다.

Researcher 4:

- Lucas 확인 질문과 실습 채점 기준을 준비한다.
- 수업 후 과제: `LedgerEventCreated` 스키마와 서비스별 owned data/must-not-access 표를 정리한다.

## 8. 수업 후 REPORT 형식

```text
[Spring MSA Study REPORT][2026-05-31 20:00 KST]
Status:
Completed/Missed/Blocked:
Lucas understanding:
Covered topics:
Practice result:
Open questions:
Next instruction:
Evidence:
```
