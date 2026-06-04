# meeting-mvp-contract-dev2

## item

- Lane A
- Meeting MVP HQ benchmark -> local API/data contract lock

## HQ evidence

- HQ repo: `D:\Lucas-Initiative-HQ`
- HQ branch: `origin/master`
- HQ commit: `00e12cb548e82bd08ab693f166b6e8d22c6bd629`

직접 확인한 파일:

- `command-center/server/routes/meetings.ts`
- `command-center/frontend/src/services/meeting-api.ts`
- `command-center/frontend/src/hooks/useMeetingChat.ts`
- `command-center/frontend/src/components/MeetingPanelCompact.tsx`
- `command-center/frontend/src/components/MeetingMessageTimeline.tsx`

## files inspected

HQ:

- `D:\Lucas-Initiative-HQ\command-center\server\routes\meetings.ts`
- `D:\Lucas-Initiative-HQ\command-center\frontend\src\services\meeting-api.ts`
- `D:\Lucas-Initiative-HQ\command-center\frontend\src\hooks\useMeetingChat.ts`
- `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\MeetingPanelCompact.tsx`
- `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\MeetingMessageTimeline.tsx`

local target:

- `D:\Lucas Core v0.1\apps\api\src\main.rs`
- `D:\Lucas Core v0.1\apps\web\src\main.tsx`

## minimal API

로컬 P0에서 고정할 route:

- `GET /api/meetings`
- `POST /api/meetings`
- `GET /api/meetings/:id`
- `GET /api/meetings/:id/messages`
- `POST /api/meetings/:id/speak`
- `GET /api/meetings/:id/threads`

P0 제외 route:

- `PATCH /api/meetings/:id/participants`
- `POST /api/meetings/:id/close`
- `PATCH /api/meetings/:id/agenda-items`
- `POST /api/meetings/:id/goals`
- typing / stream / design / canvas / reopen

## minimal data shape

### Meeting

```ts
type MeetingStatus = "active" | "closed";

interface Meeting {
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
  goals?: {
    id: string;
    title: string;
    target?: string;
    current?: string;
    status: "pending" | "in_progress" | "achieved";
    createdAt: string;
  }[];
  ledgerLabel?: string;
}
```

메모:

- `ledgerLabel`은 HQ 원본 필드가 아니다.
- 로컬 원장 연동용 파생 필드로만 허용한다.
- 권장값: `meeting:${id}`

### MeetingMessage

```ts
type MeetingMessageType =
  | "message"
  | "proposal"
  | "decision"
  | "action-item";

interface MeetingMessage {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  type: MeetingMessageType;
  threadId?: string;
  replyCount?: number;
  targets?: string[];
  attachments?: {
    filename: string;
    originalName: string;
    url: string;
    mimeType: string;
  }[];
  tags?: string[];
}
```

thread 규칙:

- 메인 메시지: `threadId` 없음
- 답글: `threadId = parent message id`

### ThreadGroup

```ts
interface MeetingThreadGroup {
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

## local patch plan

백엔드 시작점:

- `apps/api/src/main.rs`

백엔드 분리 권장:

- `apps/api/src/meeting_types.rs`
- `apps/api/src/meeting_store.rs`
- `apps/api/src/meetings.rs`

프론트 시작점:

- `apps/web/src/main.tsx`

프론트 분리 권장:

- `apps/web/src/meetings/types.ts`
- `apps/web/src/meetings/meetingApi.ts`
- `apps/web/src/meetings/MeetingsPage.tsx`
- `apps/web/src/meetings/MeetingPanel.tsx`
- `apps/web/src/meetings/ThreadPanel.tsx`

## developer-5 UI contract

구현 범위:

- `MeetingsPage.tsx`
  - 좌측 회의 목록
  - 선택 상태
- `MeetingPanel.tsx`
  - 회의 메타
  - 메인 메시지 목록
  - 메시지 입력
  - 메시지 클릭 -> thread open
- `ThreadPanel.tsx`
  - parent message
  - replies
  - reply 입력
- `meetingApi.ts`
  - 최소 4개 호출 연결
  - `GET /api/meetings`
  - `GET /api/meetings/:id/messages`
  - `POST /api/meetings/:id/speak`
  - `GET /api/meetings/:id/threads`

오늘 UI 제외:

- 멀티패널
- canvas
- worker 상태
- typing indicator
- participant 관리
- goals/agenda 편집
- close/reopen
- tag/order 고급 모드

## reuse

- `server/routes/meetings.ts`
  - `meetings`, `messages`, `threads`, `speak` route 구조
- `meeting-api.ts`
  - meeting/meta fetch와 messages fetch 분리
- `useMeetingChat.ts`
  - 실제 `MeetingMessage` shape
- `MeetingPanelCompact.tsx`
  - message timeline + thread open 구조
- `MeetingMessageTimeline.tsx`
  - reply count와 thread 중심 흐름

## reject

- Lucas 운영 특화 broadcast/targets 규칙 전체
- mojibake guard
- participant patch UI
- typing/stream/batch orchestration
- canvas/workspace 연동
- worker status strip
- thread member/name 관리
- goals/agenda/decision side widgets 전체
- 멀티패널/팝아웃/TTS/CSV

## blocker

- 구현 blocker는 없음
- 현재 제약:
  - broad coding은 Max 통합 전까지 보류
  - UI 완료 처리에는 CDP/스크린샷 증거 필요
  - `9001` singleton backend는 건드리지 않음

## summary

오늘 P0는 `meetings + messages + thread replies`까지만 고정하는 것이 맞다.
`decisions`는 메타 배열과 `decision` 메시지 타입 둘 다 허용한다.
`actionItems`는 별도 top-level 배열 대신 `action-item` 메시지 타입으로 처리한다.
