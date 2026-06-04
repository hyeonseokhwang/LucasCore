# Lucas Ledger 원장 관리 시스템 요건 정의 v0.1

작성일: 2026-06-02 KST

## 한 줄 정의

Lucas Ledger는 Lucas Initiative의 모든 AI 직원 업무를 지시, 배정, 실행, 증거, 검수, 감사 단위로 기록하고 통제하는 중앙 업무 원장 시스템이다.

핵심 원칙:

```text
원장에 없으면 업무가 아니고, 증거가 없으면 완료가 아니다.
```

제품 관점:

```text
Lucas Initiative의 본질은 AI 모델 자체가 아니라, AI 노동력을 조직화하는 원장 기반 운영체계다.
```

## 1. 시스템 목적

원장 관리 시스템은 Lucas Initiative의 AI 직원, 에이전트, Codex Worker, Claude, GPT 계열 전략 에이전트가 수행하는 모든 업무를 하나의 기준 기록으로 관리하는 시스템이다.

목적:

1. 모든 업무 지시를 원장에 등록한다.
2. 업무별 담당자, 상태, 산출물, 증거, 검수 결과를 추적한다.
3. AI 에이전트의 장기 기억을 모델 내부가 아니라 외부 원장으로 분리한다.
4. Codex, Claude, GPT 등 서로 다른 AI 도구가 같은 기준으로 일하게 한다.
5. 완료 보고 남발, 맥락 손실, 중복 작업, 증거 없는 DONE을 방지한다.
6. CEO가 전체 업무 흐름을 감사하고 승인할 수 있게 한다.

즉, 원장은 AI 직원들의 업무 DB이자 감사 로그이자 실행 지시서다.

## 2. 핵심 개념

| 개념 | 정의 |
| --- | --- |
| Ledger | Lucas Initiative의 기준 업무 기록 |
| Task | 실제 수행해야 하는 최소 작업 단위 |
| Directive | CEO 또는 PM 에이전트가 내린 상위 명령 |
| Subledger | 프로젝트별 하위 원장 |
| Evidence | 완료를 증명하는 파일, 커밋, PR, 로그, 스크린샷, 문서 |
| Review | Codex Lead, Auditor, CEO 등이 수행하는 검수 |
| Agent | 업무를 수행하는 AI 직원 또는 인간 작업자 |
| Context Pack | 특정 에이전트에게 전달할 압축된 업무 맥락 |
| Audit Trail | 누가, 언제, 무엇을, 왜 변경했는지에 대한 변경 이력 |

## 3. 주요 사용자

| 사용자 | 역할 |
| --- | --- |
| CEO / Lucas | 최종 승인자, 방향 결정자, 우선순위 결정자 |
| Ledger Clerk | 원장 정리자, 상태 점검자, 누락 감지자 |
| CTO / PM Agent | 작업 분해, 설계, 우선순위 제안 |
| Codex Worker | 원장 ID 단위 코드 구현 |
| Codex Lead | 코드 검수, PR 리뷰, 완료 판정 |
| Claude / Planner | 기획, 구조화, UI/UX, 문서화 지원 |
| Auditor Agent | 원장 조작, 증거 누락, 상태 불일치 감시 |

## 4. 기능 요건

### FR-001. 업무 등록

시스템은 새로운 업무를 원장에 등록할 수 있어야 한다.

최소 항목:

| 항목 | 설명 |
| --- | --- |
| TaskId | 업무 고유 ID |
| Title | 업무 제목 |
| Description | 업무 설명 |
| Project | 소속 프로젝트 |
| Priority | 우선순위 |
| RequestedBy | 요청자 |
| OwnerAgent | 담당 에이전트 |
| Status | 현재 상태 |
| DueDate | 목표 기한 |
| DoneCriteria | 완료 조건 |
| CreatedAt | 생성일시 |

예시:

```text
LCC-TASK-0001
제목: LCC Core v0.1 원장 CRUD API 작성
담당: Codex Worker 01
상태: ASSIGNED
완료조건: Task 생성, 조회, 수정, 상태변경 API 구현 및 테스트 통과
```

### FR-002. 업무 상태 관리

권장 상태:

| 상태 | 의미 |
| --- | --- |
| DRAFT | 초안 |
| PROPOSED | 제안됨 |
| APPROVED | 승인됨 |
| ASSIGNED | 담당자 배정됨 |
| IN_PROGRESS | 진행 중 |
| BLOCKED | 차단됨 |
| REVIEW_REQUESTED | 검수 요청됨 |
| REVISION_REQUIRED | 수정 필요 |
| DONE | 완료 |
| CANCELLED | 취소 |
| ARCHIVED | 보관됨 |

규칙:

```text
DONE 상태는 Evidence 없이는 불가능하다.
APPROVED 되지 않은 업무는 실행 지시로 내려가지 않는다.
BLOCKED 상태는 차단 사유가 반드시 있어야 한다.
상태 변경은 모두 Audit Trail에 남아야 한다.
```

### FR-003. 담당자 배정

업무는 하나 이상의 담당자에게 배정될 수 있어야 한다. 단, 최종 책임자는 1명으로 명확히 지정한다.

담당자 유형:

| 유형 | 설명 |
| --- | --- |
| Human | 실제 사람 |
| GPT Agent | GPT 기반 전략/판단 에이전트 |
| Codex Worker | 코드 구현 담당 |
| Claude Worker | 기획/문서/설계 담당 |
| Local Agent | 로컬 LLM 기반 에이전트 |
| Reviewer | 검수 담당 |
| Auditor | 감사 담당 |

### FR-004. 완료 조건 관리

각 업무는 반드시 완료 조건을 가져야 한다.

예시:

```text
- API 코드 작성 완료
- 단위 테스트 통과
- README 반영
- PR 생성
- Codex Lead 검수 통과
- 실행 로그 첨부
```

완료 조건이 비어 있는 업무는 경고해야 한다.

### FR-005. 증거 관리

업무 완료 시 Evidence를 반드시 등록해야 한다.

Evidence 유형:

| 유형 | 예시 |
| --- | --- |
| Commit | Git commit hash |
| PR | GitHub Pull Request URL |
| File | 산출 문서, 코드 파일 |
| Log | 실행 로그 |
| Screenshot | 화면 증거 |
| TestResult | 테스트 결과 |
| ReviewComment | 검수 의견 |

규칙:

```text
증거 없는 DONE은 불가능하다.
증거는 업무 ID와 연결되어야 한다.
증거가 삭제되거나 변경되면 이력에 남아야 한다.
```

### FR-006. 검수 프로세스

기본 흐름:

```text
IN_PROGRESS -> REVIEW_REQUESTED -> DONE 또는 REVISION_REQUIRED
```

검수자는 다음을 확인한다.

1. 완료 조건을 만족했는가?
2. 증거가 충분한가?
3. 코드나 문서 품질이 기준에 맞는가?
4. 원래 지시사항을 벗어나지 않았는가?
5. 부작용이나 누락이 있는가?

### FR-007. 감사 로그

모든 원장 변경은 감사 로그에 기록되어야 한다.

감사 로그 필드:

```text
AuditId
EntityType
EntityId
Action
BeforeValue
AfterValue
ChangedBy
ChangedAt
Reason
```

### FR-008. Context Pack 생성

시스템은 특정 AI 에이전트에게 전달할 업무 맥락을 자동 생성해야 한다.

Context Pack 포함 항목:

```text
- 업무 ID
- 목표
- 현재 상태
- 관련 파일
- 이전 결정사항
- 완료 조건
- 금지사항
- 참고 로그
- 예상 산출물
```

이 기능은 핵심이다. Codex Worker는 원장 ID 하나와 Context Pack만 받아서 구현할 수 있어야 한다.

### FR-009. GitHub Issue / PR 연동

연동 방향:

```text
원장 Task -> GitHub Issue 생성
GitHub PR -> 원장 Evidence 자동 등록
```

규칙:

```text
원장 TaskId를 Issue 제목 또는 본문에 포함한다.
PR 본문에도 TaskId를 포함한다.
Merge 여부는 원장 상태에 자동 반영할 수 있다.
```

### FR-010. 명령 진입점

단일 명령 진입점 예시:

```text
p "LCC Core 원장 CRUD API 만들어"
```

초기 동작:

1. 지시 분석
2. 원장 업무 생성
3. 완료 조건 생성
4. 담당 에이전트 추천
5. CEO 승인 요청
6. 승인 시 실행자에게 Context Pack 전달

초기 버전에서는 완전 자동 실행보다 원장 등록과 실행 지시 초안 생성까지를 목표로 한다.

## 5. 화면 요건

### 5.1 대시보드

필수 항목:

```text
- 전체 업무 수
- 진행 중 업무
- 검수 대기 업무
- 차단된 업무
- 증거 없는 완료 시도
- 오래 방치된 IN_PROGRESS
- 담당자 없는 업무
- 오늘 처리해야 할 업무
```

### 5.2 업무 원장 목록

필터 조건:

```text
- 프로젝트
- 상태
- 담당자
- 우선순위
- 기한
- 증거 유무
- 검수 상태
```

표시 컬럼:

```text
TaskId
Title
Project
Status
Owner
Priority
DueDate
UpdatedAt
EvidenceCount
ReviewStatus
```

### 5.3 업무 상세 화면

필수 항목:

```text
- 기본 정보
- 상세 설명
- 완료 조건
- 담당자
- 상태 변경 이력
- 관련 Evidence
- 관련 Decision Log
- 검수 결과
- Context Pack 생성 버튼
- GitHub Issue/PR 링크
```

### 5.4 검수 대기 화면

필수 기능:

```text
- 검수 대기 업무 목록
- 완료 조건 체크
- 증거 확인
- 승인
- 반려
- 수정 요청 코멘트 작성
```

### 5.5 감사 로그 화면

필수 조회 조건:

```text
- 업무 ID
- 변경자
- 변경일시
- 변경 유형
- 이전 값
- 변경 값
```

## 6. 데이터 모델 초안

### LedgerTask

```text
TaskId
ProjectId
Title
Description
Status
Priority
RequestedBy
OwnerAgentId
ReviewerAgentId
DoneCriteria
BlockedReason
DueDate
CreatedAt
UpdatedAt
```

### Agent

```text
AgentId
Name
AgentType
Role
ModelName
Capability
IsActive
CreatedAt
```

### Evidence

```text
EvidenceId
TaskId
EvidenceType
Title
Url
FilePath
Description
CreatedBy
CreatedAt
```

### ReviewRecord

```text
ReviewId
TaskId
ReviewerAgentId
ReviewStatus
Comment
ReviewedAt
```

### AuditLog

```text
AuditId
EntityType
EntityId
Action
BeforeValue
AfterValue
ChangedBy
ChangedAt
Reason
```

### DecisionLog

```text
DecisionId
ProjectId
TaskId
Title
DecisionBody
DecidedBy
DecidedAt
Reason
```

### ContextSnapshot

```text
SnapshotId
TaskId
Content
GeneratedForAgentId
GeneratedAt
TokenEstimate
```

## 7. 권한 요건

| 역할 | 권한 |
| --- | --- |
| CEO | 전체 생성, 수정, 승인, 삭제, 강제 상태 변경 |
| Ledger Clerk | 업무 정리, 상태 점검, 누락 감지, 제안 생성 |
| CTO/PM Agent | 업무 분해, 설계안 작성, 담당자 추천 |
| Codex Worker | 배정된 업무 조회, 실행 로그 작성, Evidence 등록 |
| Codex Lead | 코드 검수, DONE 승인 또는 반려 |
| Auditor | 전체 조회, 이상 징후 플래그 |

제한:

```text
AI 에이전트는 원장을 직접 삭제할 수 없다.
대량 상태 변경은 CEO 승인 없이는 불가능하다.
DONE 처리는 검수자 또는 CEO 승인 후 가능하다.
```

## 8. 비기능 요건

### 추적성

모든 업무는 생성부터 완료까지 추적 가능해야 한다.

```text
누가 지시했는가?
누가 수행했는가?
무엇을 근거로 완료했는가?
누가 검수했는가?
어떤 결정 때문에 방향이 바뀌었는가?
```

### 신뢰성

필요 기능:

```text
- 변경 이력 보존
- 백업
- 원장 스냅샷
- 삭제 대신 Archive 처리
```

### 로컬 우선

권장 초기 구성:

```text
Frontend: React
Backend: Web API
Storage: SQLite 또는 LiteDB
Agent Interface: CLI / PTY / 파일 기반 명령
```

### 확장성

처음부터 물리적으로 MSA로 쪼갤 필요는 없다. Clean Architecture 기반 모듈러 모놀리스로 시작하고, 나중에 필요한 부분만 분리한다.

모듈 후보:

```text
Ledger Core
Task Management
Agent Management
Evidence Management
Review Management
Audit Management
Context Pack Generator
Integration Adapter
```

## 9. 핵심 업무 흐름

### 9.1 지시 등록 흐름

```text
CEO 지시
-> Ledger Clerk 또는 PM Agent가 업무 초안 생성
-> 완료 조건 생성
-> 담당자 추천
-> CEO 승인
-> 원장 등록 확정
-> 실행자에게 Context Pack 전달
```

### 9.2 실행 흐름

```text
업무 배정
-> Codex Worker가 Context Pack 수신
-> 구현 또는 산출물 작성
-> 실행 로그 기록
-> Evidence 등록
-> 검수 요청
```

### 9.3 검수 흐름

```text
Codex Lead 검수
-> 완료 조건 확인
-> 증거 확인
-> 문제 없으면 DONE
-> 문제 있으면 REVISION_REQUIRED
```

### 9.4 감사 흐름

```text
Auditor가 원장 스캔
-> 담당자 없는 업무 탐지
-> 오래된 IN_PROGRESS 탐지
-> 증거 없는 DONE 탐지
-> 차단 사유 없는 BLOCKED 탐지
-> CEO 보고
```

## 10. MVP 범위

### v0.1 필수 기능

```text
1. Task 등록/조회/수정
2. 상태 변경
3. 담당자 지정
4. 완료 조건 관리
5. Evidence 등록
6. AuditLog 자동 기록
7. Context Pack Markdown 생성
8. 검수 요청/승인/반려
9. 기본 대시보드
```

### v0.2 확장 기능

```text
1. GitHub Issue/PR 연동
2. CLI 명령 p 연동
3. Agent별 작업 큐
4. 오래된 업무 자동 감지
5. 증거 없는 완료 자동 차단
6. 프로젝트별 Subledger
```

### v0.3 확장 기능

```text
1. Codex/Claude PTY Worker 연동
2. 자동 작업 분해
3. RAG 지식화
4. Agent 성과 지표
5. CEO 승인 워크플로우
6. 멀티 에이전트 회의 기록 원장화
```

## 11. 수용 기준

```text
1. 원장에 등록되지 않은 업무는 실행되지 않는다.
2. 모든 업무는 담당자와 완료 조건을 가진다.
3. DONE 상태 업무는 반드시 Evidence를 가진다.
4. 상태 변경은 모두 AuditLog에 기록된다.
5. Codex Worker는 TaskId 하나만 받아도 필요한 Context Pack을 받을 수 있다.
6. CEO는 현재 진행 중, 차단, 검수 대기, 완료 업무를 한 화면에서 볼 수 있다.
7. 오래 방치된 IN_PROGRESS 업무를 시스템이 탐지한다.
8. 검수자가 반려한 업무는 자동으로 REVISION_REQUIRED 상태가 된다.
9. GitHub PR 또는 산출물 링크가 Evidence로 연결된다.
10. 원장은 특정 모델의 기억에 의존하지 않고 독립적으로 유지된다.
```

## 12. UI/UX 브레인스토밍 기준

현재 LCC Core 운영 우선순위:

```text
1. 자율운영 보장
2. 화면 전환 및 의사결정 UI 고도화
```

즉, 화면을 예쁘게 만들기 전에 원장이 에이전트를 계속 움직이게 해야 한다. 그 다음 사람이 보기 좋은 화면으로 전환한다.

### 12.1 9100의 역할

9100은 raw ledger viewer가 아니라 회장/CEO용 운영판이다.

요건:

```text
- JSON 원장과 같은 정보를 보여준다.
- JSON에 없는 사실을 UI에서 만들어내지 않는다.
- UI에 보이는 사실은 JSON에도 있어야 한다.
- 메인 화면은 한국어 요약과 카드/보드 중심이다.
- raw JSON, terminal transcript, debug log는 drill-down으로만 둔다.
```

### 12.2 화면 계층 제안

1. Executive Board
   - 오늘의 P0
   - 진행/차단/검수/결정 필요
   - CEO가 바로 판단해야 하는 항목

2. Operations Board
   - 에이전트별 current item / doing / next / blocker / evidence
   - stale, paused-with-context, owner/interim owner 표시

3. Ledger Board
   - Task 목록
   - 상태, 담당자, 기한, 증거, 검수 상태

4. Review Board
   - 검수 대기
   - 완료 조건 체크
   - 증거 확인
   - 승인/반려

5. Audit Board
   - 변경 이력
   - 증거 없는 완료 시도
   - 오래된 IN_PROGRESS
   - 담당자 없는 업무

6. Context Pack Board
   - 특정 TaskId 기준 작업 맥락 생성
   - 에이전트 재기동/재배정 시 복구 자료

### 12.3 카드 표시 원칙

각 업무 카드는 최소 다음을 보여준다.

```text
TaskId
Title
Status
Priority
Owner
InterimOwner
DueDate
DoneCriteria count
Evidence count
Review status
Blocker
Decision needed
Next action
Last update
```

### 12.4 자율운영 보장 조건

다음 조건이 충족되어야 화면 전환을 해도 회사가 멈추지 않는다.

```text
- CEO/Ops wake loop가 원장을 주기적으로 읽는다.
- stale owner를 감지한다.
- pause-with-context를 남기고 재배정할 수 있다.
- developer-7 같은 Lucas-direct 보호 규칙을 지킨다.
- DONE은 Evidence 없이는 불가능하다.
- QA/Audit gate가 완료 판정을 통제한다.
- Context Pack으로 재기동 후 업무를 복구할 수 있다.
```

### 12.5 다음 UI 결정 질문

UI/UX 결정 전에 정해야 할 질문:

```text
1. 9100 첫 화면은 Executive Board인가, Operations Board인가?
2. Task 중심으로 볼 것인가, Agent 중심으로 볼 것인가?
3. CEO가 직접 승인/반려 버튼을 누를 것인가, 초기에는 보기 전용인가?
4. 원장 상태 머신은 기존 doing/todo/done 계열을 유지할 것인가, DRAFT/APPROVED/IN_PROGRESS 계열로 확장할 것인가?
5. raw JSON drill-down은 카드 안 accordion인가, 별도 detail drawer인가?
6. paused-with-context와 interim owner를 어떤 형태로 표시할 것인가?
7. 9000 Terminal Fleet와 9100 Ledger Board의 역할 경계를 어디까지 분리할 것인가?
```
