# Meeting MVP Contract 2026-06-01

## 목적

이 문서는 `meeting-first` P0 MVP 구현을 위한 로컬 API/데이터/UI 계약 초안이다.
기준은 반드시 HQ 실제 코드이며, 로컬 구현은 현재 `Lucas Core v0.1` 구조에 맞게 최소화한다.

## HQ 기준

- Repo: `D:\Lucas-Initiative-HQ`
- Branch: `origin/master`
- Commit: `00e12cb548e82bd08ab693f166b6e8d22c6bd629`

직접 확인한 기준 파일:

- `command-center/server/routes/meetings.ts`
- `command-center/frontend/src/services/meeting-api.ts`
- `command-center/frontend/src/hooks/useMeetingChat.ts`
- `command-center/frontend/src/components/MeetingPanelCompact.tsx`
- `command-center/frontend/src/components/MeetingMessageTimeline.tsx`

## 범위

오늘 P0 MVP 범위:

- 회의 목록 조회
- 회의 생성
- 회의 1개 선택
- 회의 메시지 목록 조회
- 회의 메시지 전송
- 메시지별 thread reply 조회
- thread reply 전송

오늘 제외:

- 멀티패널
- canvas/workspace 연동
- worker 상태
- typing indicator
- participant 관리 UI
- goals/agenda 관리 UI
- close/reopen UI
- HQ의 운영 특화 guard/automation

## 타입 계약

### Meeting

```ts
export type MeetingStatus = "active" | "closed";

export interface MeetingGoal {
  id: string;
  title: string;
  target?: string;
  current?: string;
  status: "pending" | "in_progress" | "achieved";
  createdAt: string;
}

export interface Meeting {
  id: string;
  topic: string;
  agenda?: string;
  status: MeetingStatus;
  channel?: string;
  participants: string[];
  createdBy?: string;
  createdAt?: string;
  closedAt?: string;
  summary?: string;
  decisions?: string[];
  agendaItems?: string[];
  goals?: MeetingGoal[];
  ledgerLabel?: string;
}
```

필드 기준:

- `topic`, `agenda`, `status`, `channel`, `participants`, `createdBy`, `createdAt`, `closedAt`, `decisions`, `agendaItems`, `goals`는 HQ 실제 코드 근거가 있다.
- `ledgerLabel`은 HQ 지정 기준 파일에는 없다.
- `ledgerLabel`은 로컬 원장 연동용 파생 필드로만 허용한다.
- 권장 값은 `meeting:${id}`다.

### MeetingMessage

```ts
export type MeetingMessageType =
  | "message"
  | "proposal"
  | "decision"
  | "action-item";

export interface MeetingAttachment {
  filename: string;
  originalName: string;
  url: string;
  mimeType: string;
}

export interface MeetingMessage {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  type: MeetingMessageType;
  threadId?: string;
  replyCount?: number;
  targets?: string[];
  attachments?: MeetingAttachment[];
  tags?: string[];
}
```

필드 기준:

- `id`, `author`, `content`, `timestamp`, `type`, `threadId`, `replyCount`, `targets`, `attachments`, `tags`는 HQ 실제 코드에서 확인했다.
- 오늘 MVP에서는 `targets`, `attachments`, `tags`를 UI에서 미사용해도 되지만 타입에서는 유지 가능하다.
- 오늘 MVP thread 규칙은 `threadId = parent message id`로 고정한다.

### ThreadGroup

```ts
export interface MeetingThreadGroup {
  threadId: string;
  messageCount: number;
  lastActivity: string;
  lastReplyAt?: string;
  createdAt?: string;
  preview?: string;
  firstAuthor?: string;
  participants?: string[];
}
```

설명:

- HQ `GET /api/meetings/:id/threads?by=threadId` 응답 형태 기준이다.
- 오늘 MVP UI에서는 thread side panel이 이미 열려 있으면 이 타입을 직접 안 써도 된다.
- 다만 reply badge, thread summary, future side list를 위해 유지하는 것이 좋다.

## 데이터 모델 권장안

현재 로컬 repo는 DB가 아니라 파일 기반 store 패턴을 사용한다.
따라서 오늘 P0는 DB 이식이 아니라 아래 메모리/파일 모델로 가는 것이 맞다.

```ts
export interface MeetingStoreRecord {
  meetings: Meeting[];
}
```

권장 저장:

- `data/meetings.json`

메시지 저장 방식:

- 간단히 `Meeting.messages` 내부 배열로 유지해도 오늘 MVP는 충분하다.
- 분리형 저장은 후순위다.

권장 내부 구조:

```ts
export interface StoredMeeting extends Meeting {
  messages: MeetingMessage[];
}
```

## Route 계약

### 1. GET /api/meetings

목적:

- 회의 목록 조회

쿼리:

- `status?: "active" | "closed"`
- `channel?: string`

응답:

```json
{
  "meetings": [
    {
      "id": "mtg-001",
      "topic": "Meeting MVP",
      "status": "active",
      "channel": "general",
      "participants": ["lucas", "developer-5"],
      "createdBy": "lucas",
      "createdAt": "2026-06-01T10:00:00.000Z",
      "ledgerLabel": "meeting:mtg-001"
    }
  ]
}
```

주의:

- 메시지 전체는 포함하지 않는다.
- HQ도 상세와 메시지 목록을 분리하는 방향이다.

### 2. POST /api/meetings

목적:

- 회의 생성

요청:

```json
{
  "topic": "Meeting MVP",
  "agenda": "P0 scope lock",
  "participants": ["lucas", "developer-5"],
  "createdBy": "lucas",
  "channel": "general"
}
```

응답:

```json
{
  "meeting": {
    "id": "mtg-001",
    "topic": "Meeting MVP",
    "agenda": "P0 scope lock",
    "status": "active",
    "channel": "general",
    "participants": ["lucas", "developer-5"],
    "createdBy": "lucas",
    "createdAt": "2026-06-01T10:00:00.000Z",
    "ledgerLabel": "meeting:mtg-001"
  }
}
```

### 3. GET /api/meetings/:id

목적:

- 회의 메타 단건 조회

응답:

```json
{
  "meeting": {
    "id": "mtg-001",
    "topic": "Meeting MVP",
    "agenda": "P0 scope lock",
    "status": "active",
    "channel": "general",
    "participants": ["lucas", "developer-5"],
    "createdBy": "lucas",
    "createdAt": "2026-06-01T10:00:00.000Z",
    "decisions": [],
    "agendaItems": [],
    "goals": [],
    "ledgerLabel": "meeting:mtg-001"
  }
}
```

주의:

- 메시지 배열은 기본 제외한다.
- HQ의 OOM-safe 분리 패턴을 따른다.

### 4. GET /api/meetings/:id/messages

목적:

- 메인 타임라인 또는 특정 thread 메시지 조회

쿼리:

- `limit?: number`
- `page?: number`
- `threadId?: string`

규칙:

- `threadId`가 없으면 메인 타임라인을 반환한다.
- 메인 타임라인은 `threadId`가 없는 메시지와 parent 메시지만 보여준다.
- `threadId`가 있으면 해당 parent의 replies만 반환한다.

응답:

```json
{
  "messages": [
    {
      "id": "msg-001",
      "author": "lucas",
      "content": "P0 범위를 고정합니다.",
      "timestamp": "2026-06-01T10:05:00.000Z",
      "type": "message",
      "replyCount": 2
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 30,
    "count": 1,
    "hasMore": false
  }
}
```

### 5. POST /api/meetings/:id/speak

목적:

- 메인 메시지 또는 thread reply 전송

요청:

```json
{
  "speaker": "lucas",
  "content": "이건 메인 메시지입니다.",
  "type": "message"
}
```

thread reply 요청:

```json
{
  "speaker": "developer-5",
  "content": "UI는 제가 맡겠습니다.",
  "type": "message",
  "threadId": "msg-001"
}
```

응답:

```json
{
  "message": {
    "id": "msg-002",
    "author": "developer-5",
    "content": "UI는 제가 맡겠습니다.",
    "timestamp": "2026-06-01T10:06:00.000Z",
    "type": "message",
    "threadId": "msg-001"
  }
}
```

서버 규칙:

- `speaker`는 저장 시 `author`로 매핑한다.
- `threadId`가 있으면 parent message의 `replyCount`를 증가시킨다.
- 오늘 MVP에서는 `targets`와 첨부파일은 생략 가능하다.

### 6. GET /api/meetings/:id/threads

목적:

- thread 요약 목록 조회

쿼리:

- `by=threadId`

응답:

```json
{
  "threads": [
    {
      "threadId": "msg-001",
      "messageCount": 2,
      "lastActivity": "2026-06-01T10:06:00.000Z",
      "lastReplyAt": "2026-06-01T10:06:00.000Z",
      "createdAt": "2026-06-01T10:05:00.000Z",
      "preview": "UI는 제가 맡겠습니다.",
      "firstAuthor": "developer-5",
      "participants": ["developer-5"]
    }
  ]
}
```

## developer-5 UI 계약

developer-5는 아래 계약만 보고 UI를 만들 수 있어야 한다.

### MeetingsPage

책임:

- 회의 목록 조회
- 회의 선택 상태 관리

필요 props / state:

```ts
type MeetingsPageState = {
  meetings: Meeting[];
  selectedMeetingId: string | null;
};
```

### MeetingPanel

책임:

- 선택된 회의의 메타 표시
- 메인 메시지 타임라인 표시
- 메시지 전송
- 메시지 클릭 시 thread open

필요 props:

```ts
interface MeetingPanelProps {
  meeting: Meeting;
  messages: MeetingMessage[];
  onSendMessage(input: {
    content: string;
    type: MeetingMessageType;
    threadId?: string;
  }): Promise<void>;
  onOpenThread(message: MeetingMessage): void;
}
```

UI 규칙:

- `type === "decision"`이면 decision 스타일
- `type === "action-item"`이면 action 스타일
- `replyCount > 0`이면 답글 수 노출

### ThreadPanel

책임:

- parent message 표시
- reply 목록 표시
- reply 입력/전송

필요 props:

```ts
interface ThreadPanelProps {
  parentMessage: MeetingMessage;
  replies: MeetingMessage[];
  onSendReply(content: string): Promise<void>;
  onClose(): void;
}
```

조회 방식:

- parent 선택 시 `GET /api/meetings/:id/messages?threadId=:parentId`
- 전송 시 `POST /api/meetings/:id/speak` with `threadId`

## HQ 패턴 중 오늘 재사용 / 제외

오늘 재사용:

- `MeetingPanelCompact.tsx`의 메시지 + thread open 구조
- `useMeetingChat.ts`의 `MeetingMessage` 타입
- `MeetingMessageTimeline.tsx`의 reply count / thread 중심 흐름
- `meeting-api.ts`의 분리형 meeting/message fetch 패턴
- `server/routes/meetings.ts`의 `messages`, `threads`, `speak` 라우트 구조

오늘 제외:

- 멀티패널
- canvas
- worker 상태
- typing
- thread member 관리
- tag/order custom thread modes
- goals/agenda 편집 UI
- close/reopen UI

## 로컬 파일 권장안

백엔드 시작점:

- `apps/api/src/main.rs`

백엔드 분리 파일:

- `apps/api/src/meeting_types.rs`
- `apps/api/src/meeting_store.rs`
- `apps/api/src/meetings.rs`

프론트 시작점:

- `apps/web/src/main.tsx`

프론트 분리 파일:

- `apps/web/src/meetings/types.ts`
- `apps/web/src/meetings/meetingApi.ts`
- `apps/web/src/meetings/MeetingsPage.tsx`
- `apps/web/src/meetings/MeetingPanel.tsx`
- `apps/web/src/meetings/ThreadPanel.tsx`

## 구현 원칙

- HQ 실제 필드만 기본 계약으로 사용한다.
- HQ에 없는 `ledgerLabel`은 로컬 통합 필드임을 명시한다.
- 오늘 P0는 `meetings + messages + thread replies`까지만 고정한다.
- `decisions`는 메타 배열과 `decision` 메시지 타입의 이중 표현을 허용한다.
- `actionItems`는 별도 top-level 배열 대신 `action-item` 메시지 타입으로 처리한다.
