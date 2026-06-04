# memory-system-hq-web-contract-dev2

## item

- memory-system-hq
- recovered-context web panel contract for `GET /api/memory/recover/:agent_id`

## startup and ledger context

- command mode: `normal`
- assignment source: `data/work-ledger.json` task `memory-system-hq`
- paired lane: developer-2 contract plus developer-5 UI patch candidate
- constraints:
  - do not restart `9001`
  - do not commit from this lane
  - keep developer-7 reserved for Lucas direct work

## source benchmark

- local web shell:
  - `D:\Lucas Core v0.1\apps\web\src\main.tsx`
  - `D:\Lucas Core v0.1\apps\web\src\styles.css`
- local API:
  - `D:\Lucas Core v0.1\apps\api\src\main.rs`
- local benchmark note:
  - `D:\Lucas Core v0.1\docs\hq-memory-system-benchmark-20260601.md`
- current root:
  - `D:\Lucas Core v0.1`

## existing web patterns to preserve

- `apps/web` is still a single-file React shell with local `type` declarations and a shared `api.get<T>()` helper in `src/main.tsx`.
- New operator surfaces are currently added as shell views or right-side panels, not as a separate router tree.
- Loading/error empty states are simple cards or `.empty` blocks, not a global toast system.
- Meetings already use a three-column workspace pattern that is the closest reusable layout for recovered context:
  - left list
  - center primary timeline/detail
  - right summary cards

## actual API contract

From `apps/api/src/main.rs`:

```ts
type MemoryEntry = {
  id: string;
  at: string;
  agent_id: string;
  layer: "working" | "short_term" | "long_term" | string;
  scope: "personal" | "team" | "global" | string;
  kind: string;
  topic?: string | null;
  content: string;
  importance: number;
  source: string;
  source_id?: string | null;
  ledger_item?: string | null;
  evidence_path?: string | null;
  tags: string[];
  archived_at?: string | null;
};

type WorkTask = {
  id: string;
  title: string;
  status: "todo" | "doing" | "done" | "blocked";
  priority: number;
  due_at?: string | null;
  reminder_minutes?: number | null;
  last_reminded_at?: string | null;
  notes?: string | null;
  updated_at: string;
};

type WorkTaskEvent = {
  id: string;
  task_id: string;
  at: string;
  kind: string;
  body: string;
};

type RecoverAgentContextResponse = {
  ok: true;
  agent_id: string;
  recovered_context: {
    personal_memories: MemoryEntry[];
    shared_memories: MemoryEntry[];
    active_tasks: WorkTask[];
    recent_work_events: WorkTaskEvent[];
  };
  report_contract: string;
};
```

Query params:

- `search?: string`
- `limit?: number` with server clamp `1..50`, default `8`

## proposed API client shape

Keep it inside `apps/web/src/main.tsx` for the first patch because the app is not yet split into feature folders.

```ts
type RecoverAgentContextResponse = { ... };

async function getRecoveredContext(agentId: string, options?: { search?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (options?.search?.trim()) params.set("search", options.search.trim());
  if (typeof options?.limit === "number") params.set("limit", String(options.limit));
  const query = params.toString();
  return api.get<RecoverAgentContextResponse>(
    `/api/memory/recover/${encodeURIComponent(agentId)}${query ? `?${query}` : ""}`
  );
}
```

Why this shape:

- matches the existing local `api.get<T>()` helper
- avoids adding a new client module before the shell is modularized
- keeps developer-5 patch scope small

## proposed UI location

First patch candidate for developer-5:

- state/types/helper functions in `apps/web/src/main.tsx`
- styles in `apps/web/src/styles.css`
- render surface as a new right-side summary card inside the current `MeetingWorkspace`

Concrete placement:

- append a fourth summary card under [main.tsx](</D:/Lucas Core v0.1/apps/web/src/main.tsx:1957>) `meeting-summary-panel`
- panel title: `복구 컨텍스트`
- use selected meeting participants or a temporary agent selector defaulting to `developer-2`

Reasoning:

- this task explicitly asks to coordinate with developer-5 for a UI patch candidate
- `MeetingWorkspace` is already the active collaboration surface
- recovered context is operator/supporting data, so right-side summary placement is lower risk than a new top-level route

Second-step location after the shell is split:

- `apps/web/src/memory/RecoveredContextPanel.tsx`
- `apps/web/src/memory/memoryApi.ts`

Do not do that split in the first patch unless Max asks for broader refactor.

## UI boundary

- API responsibility:
  - fetch and return recovered context only
  - no derived grouping beyond what the endpoint already returns
- web client responsibility:
  - choose active `agent_id`
  - trigger fetch
  - format timestamps
  - group memories visually by personal/shared/tasks/events
  - expose `report_contract` text for operator use

## fields to show

Top meta row:

- `agent_id`
- `report_contract`
- fetch status timestamp if developer-5 wants it

Personal memories section:

- `content`
- `topic`
- `kind`
- `layer`
- `importance`
- `ledger_item`
- `evidence_path`
- `at`

Shared memories section:

- same fields as personal memories
- visually show `scope` badge as `team` or `global`

Active tasks section:

- `title`
- `status`
- `priority`
- `due_at`
- `notes`
- `updated_at`

Recent work events section:

- `kind`
- `body`
- `task_id`
- `at`

## fields to hide for first patch

- raw `source_id` unless needed for debugging
- raw `archived_at` because archived entries are already filtered out by the endpoint
- full tag inspector beyond a simple chip row
- edit/create controls
- memory append UI

## loading, empty, error states

Loading:

- card body text: `복구 컨텍스트를 불러오는 중입니다.`
- keep the rest of the meeting UI interactive

Error:

- inline error block in the card
- title: `복구 컨텍스트를 불러오지 못했습니다`
- body: server text or `요청에 실패했습니다. 잠시 후 다시 시도해 주세요.`
- button label: `다시 시도`

Empty success:

- if all four arrays are empty
- title: `표시할 복구 컨텍스트가 없습니다`
- body: `현재 에이전트에 대한 메모리, 작업, 최근 이벤트가 아직 없습니다.`

Partial empty:

- personal memories empty: `개인 메모리가 없습니다.`
- shared memories empty: `공유 메모리가 없습니다.`
- active tasks empty: `진행 중 작업이 없습니다.`
- recent events empty: `최근 작업 이벤트가 없습니다.`

## Korean-safe labels

Use these labels verbatim in the UI patch:

- panel title: `복구 컨텍스트`
- agent label: `에이전트`
- search placeholder: `메모리 또는 작업 검색`
- personal section: `개인 메모리`
- shared section: `공유 메모리`
- task section: `진행 중 작업`
- event section: `최근 작업 이벤트`
- report contract: `보고 형식`
- importance: `중요도`
- layer: `레이어`
- scope: `범위`
- topic: `주제`
- evidence: `증거 경로`
- ledger item: `원장 항목`
- retry button: `다시 시도`
- load button: `불러오기`

Avoid:

- mixed mojibake-prone transliterations
- long English-first labels like `Recovered Context`

## developer-5 patch candidate

Minimal patch sequence for developer-5:

1. Add `MemoryEntry`, `WorkTask`, `WorkTaskEvent`, and `RecoverAgentContextResponse` types near other `type` declarations in `apps/web/src/main.tsx`.
2. Add `getRecoveredContext()` beside the existing `api` helper.
3. Add local state in `ShellApp` or `MeetingWorkspace`:
   - `selectedRecoveryAgentId`
   - `recoveredContext`
   - `recoveryLoading`
   - `recoveryError`
   - optional `recoverySearch`
4. Trigger fetch on selected agent change and on explicit retry.
5. Render one new summary card in `meeting-summary-panel`.
6. Add CSS only for the new card/list rows; avoid broad layout refactor.

Suggested first target agent:

- `developer-2`

Suggested follow-up selector values:

- current meeting participants from `activeChannel.participants`

## what must not be copied from HQ

- HQ DB/vector-memory features
- HQ auto-capture/reconsolidation logic
- HQ broad memory platform assumptions
- HQ component/file structure if it forces a large refactor of the current single-file shell

The reusable pattern is the operator-facing summary surface and typed fetch boundary, not the whole HQ memory system.

## residual risk

- Current web shell is large and single-file, so local state placement can become noisy.
- If developer-5 adds a new top-level route instead of a meeting-side panel, that increases verification scope and should be re-cleared with Max.
- No UI verification was run from this lane because this task is a contract/handoff only.

## handoff summary

- API route confirmed: `GET /api/memory/recover/:agent_id`
- response fields confirmed from Rust source
- first UI patch should live in `apps/web/src/main.tsx` + `apps/web/src/styles.css`
- best near-term placement is the right-side `MeetingWorkspace` summary panel
- developer-5 should implement a single recovered-context card, not a broad memory workspace
