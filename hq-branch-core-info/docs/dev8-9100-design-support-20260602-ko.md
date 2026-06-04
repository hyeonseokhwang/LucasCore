# 9100 / LCC Design Support Brief

Date: 2026-06-02 KST
Owner: developer-8
Item: `9100-design-support`
Role: `design-support GPT-5.4`
Mode: mockup prompts and implementation briefs only

## 목적

- `9100` CEO/LCC 운영 화면을 한국어 기준으로 더 명확하게 보이도록 ChatGPT GUI용 mockup prompt를 만든다.
- 구현 코드는 시작하지 않고, Max가 구현을 배정할 때 바로 넘길 수 있는 UI brief만 남긴다.
- 기존 사실 소스는 단일 원장과 세션/상태 read-model을 유지한다.

## 현재 9100 컨텍스트

- 현재 `9100`은 `CEO 지시 원장` 화면이다.
- 현재 live summary는 `agents=10`, `blocked=0`, `stale=0`, `active=0`, `idle=10`, `no-heartbeat=10` 이다.
- 현재 에이전트 패널은 `Max(dev-lead)` 와 `Developer 1..8` 가 보이며, 많은 카드가 `idle / task unknown / heartbeat missing / blocker none` 패턴을 보인다.
- 기존 evidence는 CDP screenshot, DOM text, console, responsive capture가 이미 있다.

## Prompt 1

### 이름

`9100-executive-ops-board-desktop`

### ChatGPT GUI Prompt

```text
Lucas LCC Core 9100 화면을 위한 한국어 운영 대시보드 목업을 설계해줘.

목표:
- CEO가 원장 지시, 에이전트 상태, blocker, 의사결정 필요 항목, QA/evidence gate를 한 화면에서 5초 안에 읽게 한다.

사용자:
- Lucas / Caesar / Max 같은 운영 책임자

핵심 제약:
- 원장은 하나만 쓴다.
- 별도 원장이나 별도 진실 소스는 만들지 않는다.
- 실제 데이터 소스는 기존 ledger/session/read-model이라고 가정하고, 화면은 그 사실을 읽기 좋게 재배치한다.
- 한국어 운영 화면이며, machine-facing ID와 enum은 유지한다.

필수 포함:
- 상단 summary strip: Blocked, Stale, Active, Idle, No heartbeat, QA wait, Decision needed
- 좌측 또는 중앙 상단: 진행중 원장 지시 카드 6~10개
- 우측 상단: 에이전트 현황 패널
- 각 agent card에 name, boardState, current item, progress, blocker, next action, updated, heartbeat badge
- 중단 없는 운영을 위한 “지금 개입 필요” 섹션
- 하단 또는 우측: evidence / QA / audit gate visibility
- raw JSON drilldown 버튼은 보조 요소로만 넣고 메인 뷰는 사람 친화적으로 구성

원하는 시각 스타일:
- 차분한 다크 운영 콘솔
- 선명한 상태 색상: blocked=red, stale=amber, active=green, idle=slate
- 숫자보다 행동 우선: “누가 막혔는가”, “누가 heartbeat 없음인가”, “다음 의사결정은 무엇인가”가 바로 보이게
- 카드와 표가 섞인 하이브리드 레이아웃

금지:
- 예쁜데 정보 밀도가 낮은 hero 화면
- JSON을 크게 그대로 노출하는 화면
- KPI만 있고 다음 액션이 안 보이는 대시보드

결과물:
- 16:9 desktop 기준 mockup 1장
- 패널 설명 5개
- 운영자 관점의 핵심 UX 결정 5개
```

### Implementation Brief

- Page purpose:
  `9100`에서 원장 지시와 에이전트 운영 상태를 한 번에 판단하는 executive ops board
- Visible panels:
  summary strip, in-progress directives board, agent status panel, decision-needed panel, QA/evidence gate panel
- Data fields:
  `directive.id`, `directive.title`, `directive.progress`, `directive.owner`, `directive.status`, `agent.name`, `agent.boardState`, `agent.task`, `agent.progress`, `agent.blocker`, `agent.nextAction`, `agent.updated_at`, `agent.hasHeartbeat`
- Korean labels:
  `에이전트 현황`, `지금 개입 필요`, `검수 대기`, `증거 게이트`, `의사결정 필요`, `Heartbeat 없음`, `다음 조치`
- Interactions:
  summary pill click filters directives/agents, urgent panel click scrolls to source card, raw JSON drilldown opens side drawer
- Acceptance criteria:
  Lucas가 5초 안에 `누가 막혔는지`, `누가 heartbeat가 없는지`, `어떤 지시가 decision-needed인지`를 읽을 수 있어야 한다.
- Evidence required before implementation done:
  CDP screenshot, DOM text check, console check, viewport note, `9001` preservation note

## Prompt 2

### 이름

`9100-agent-status-panel-focus`

### ChatGPT GUI Prompt

```text
Lucas LCC 9100의 에이전트 상태 패널만 집중적으로 재설계해줘.

목표:
- dev-lead와 developer-1..8의 상태를 현재보다 더 빠르고 명확하게 읽게 한다.
- idle, blocked, stale, no-heartbeat, qa-wait, decision-needed를 한눈에 구분하게 한다.

필수 포함:
- Dev Lead / Developer 1..8 카드가 한 화면에서 그룹으로 읽힘
- 각 카드에 상태 색상, 현재 item, blocker, next action, 마지막 업데이트, heartbeat badge
- 정렬 우선순위: blocked -> stale -> no-heartbeat -> qa-wait -> active -> idle
- “developer-7 protected lane” 같은 운영 규칙은 subtle note로만 표현
- 사람이 읽는 한국어 설명 + machine ID 작은 보조 라벨

레이아웃:
- desktop 1600x1200 기준 2~3열 카드
- mobile 390x844 기준 세로 스택
- sticky summary strip

스타일:
- 정보 밀도 높음
- 카드 헤더는 짧고 강하게
- blocker와 next action은 카드에서 가장 먼저 읽히게
- heartbeat 없음은 상태 pill과 아이콘 둘 다로 강조

결과물:
- desktop 카드 패널 mockup
- mobile 카드 패널 mockup
- 카드 컴포넌트 spec 1세트
```

### Implementation Brief

- Page purpose:
  `9100` 내 에이전트 현황 패널의 판독성을 높여 Max와 Lucas의 개입 속도를 높인다.
- Visible panels:
  sticky state counters, agent card grid, sort/filter controls, protected-lane note
- Data fields:
  `id`, `name`, `team`, `boardState`, `task`, `progress`, `blocker`, `nextAction`, `updated_at`, `hasHeartbeat`, optional `model`
- Korean labels:
  `차단`, `정체`, `Heartbeat 없음`, `검수 대기`, `다음 조치`, `보호 레인`, `최근 갱신`
- Interactions:
  state filter, owner filter, sort by urgency, click card for side detail
- Acceptance criteria:
  `Max` 와 `Developer 1..8` 가 desktop/mobile 모두에서 이름 잘림 없이 식별되고, card만 봐도 current blocker/next action을 읽을 수 있어야 한다.
- Evidence required before implementation done:
  desktop/mobile screenshot pair, DOM text check for `Max` and `Developer 1..8`, console check, viewport note

## Prompt 3

### 이름

`lcc-linked-9000-9100-ops-flow`

### ChatGPT GUI Prompt

```text
Lucas LCC 제품의 9000 작업 화면과 9100 운영 원장 화면이 어떻게 연결되어야 하는지 한국어 목업으로 제안해줘.

목표:
- 9000은 작업/실행/세션 조작 공간
- 9100은 원장/상태/의사결정/감사 공간
- 두 화면의 역할 분리를 시각적으로 분명하게 만든다.

필수 포함:
- 9000과 9100의 역할 비교 패널
- 9100에서 선택한 원장 item이 9000의 관련 세션/작업으로 이어지는 흐름
- evidence gate, QA wait, decision-needed가 9100에서 먼저 보이고, 9000은 실행 상세를 담당
- 운영자가 “어디서 보고 어디서 행동하는지” 헷갈리지 않는 구조

원하는 산출:
- dual-screen concept board 한 장
- 좌측 9100, 우측 9000 관계도
- 상단에 운영 원칙 4개
- 하단에 handoff flow 4단계

주의:
- 9100을 터미널 그리드처럼 만들지 말 것
- 9000을 또 다른 원장처럼 만들지 말 것
- single source of truth는 유지할 것
```

### Implementation Brief

- Page purpose:
  `9000`과 `9100`의 운영 역할 경계를 제품 수준에서 명확하게 한다.
- Visible panels:
  role split panel, ledger-to-session handoff flow, evidence gate markers, action ownership map
- Data fields:
  existing ledger IDs, session IDs, owner labels, QA/evidence status, decision-needed flag
- Korean labels:
  `원장 판단`, `실행 작업`, `증거 확인`, `검수 대기`, `의사결정 필요`, `세션 이동`, `담당자`
- Interactions:
  `9100`에서 item 선택 -> 관련 `9000` session/filter deep link, `9000`에서 done/report -> `9100` evidence state update
- Acceptance criteria:
  운영자가 “판단은 9100, 실행은 9000” 구조를 한 번에 이해해야 한다.
- Evidence required before implementation done:
  linked screenshot set, DOM text check for role labels, console check, `9001` untouched note

## Max 전달용 요약

- 이 문서는 구현 요청이 아니라 디자인 지원 산출물이다.
- 구현 배정 시 우선순위는 `Prompt 2 -> Prompt 1 -> Prompt 3` 순서가 효율적이다.
- 이유:
  현재 운영 pain point는 전체 보드 미관보다 `agent status` 판독성 저하와 `heartbeat missing` 가시성 부족이 더 크기 때문이다.

## Evidence

- `C:\Users\hysra\.codex\skills\chatgpt-gui-designer\SKILL.md`
- `docs/dev8-9100-status-panel-qa-handoff-20260601.md`
- `data/system-logs/dev8-9100-proof-20260601/verification-note.txt`
- `data/system-logs/ceo-ledger-9100-cdp/ceo-ledger-9100-report.json`
