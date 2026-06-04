# portable-release-terminal-status-benchmark-dev2-20260602

## item

- `portable-release-20260603`
- lane: HQ terminal status and low-resolution card behavior
- owner: `developer-2`

## scope

Benchmark HQ terminal status and active-standby patterns, then recommend how LCC terminal cards should show `active`, `standby`, and `blocked` on low-resolution screens for the portable release.

## files inspected

HQ:

- `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\SessionCard.tsx`
- `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\SessionStatusDot.tsx`
- `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\TerminalGrid.tsx`
- `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\TerminalPanel.tsx`
- `D:\Lucas-Initiative-HQ\command-center\frontend\src\lib\agentStatus.ts`

LCC current:

- `D:\Lucas Core v0.1\apps\web\src\main.tsx`
- `D:\Lucas Core v0.1\apps\web\src\styles.css`
- `D:\Lucas Core v0.1\docs\portable-release-plan-20260602.md`
- `D:\Lucas Core v0.1\data\work-ledger.json`

## HQ patterns confirmed

### 1. Dense cards are status-first, not interaction-first

HQ `SessionCard.tsx` and `TerminalGrid.tsx` reduce each card to:

- status dot
- short status label
- session name
- one short work/preview line
- optional tiny secondary metric

HQ does not try to expose the full terminal interaction model inside every low-density card.

### 2. Focused interaction is moved to the main panel/window

HQ `TerminalPanel.tsx` keeps:

- prompt input
- search
- toolbar actions
- full terminal

That means the grid view remains readable when many sessions are visible.

### 3. Status is color + text, not color alone

HQ `agentStatus.ts` and `SessionStatusDot.tsx` map states to visible semantics:

- working: green
- idle: yellow or muted neutral
- stopped/error: red or gray

HQ also adds a short text label like `IDLE` or `STOPPED`, which matters on small screens where a dot alone is too weak.

### 4. Active work is represented by one short line

HQ grid cards show one primary line:

- current note
- current queue title
- fallback idle text

This is the most reusable pattern for LCC portable release.

## LCC current behavior

Current LCC terminal card behavior in `apps/web/src/main.tsx`:

- card header has a generic `status-dot`
- selected cards get live xterm
- non-selected cards get a static 20-line preview
- footer still shows input controls on every card

Current limitations for low resolution:

- `status-dot` is visually tied to `.active .status-dot`, which means the green signal is driven by selection/active CSS state, not a distinct operator state model
- card header does not show a short readable status word like `활성`, `대기`, `막힘`
- static preview still spends space on terminal text instead of one concise work/status summary
- footer input consumes valuable vertical space on small screens

## recommended portable-release mapping

For low-resolution card mode, LCC should use a portable three-state model:

### `active`

Meaning:

- session alive
- currently processing, streaming, or recently producing work

Signal:

- green dot
- label: `활성`
- one-line tail: latest meaningful preview tail or current operator note

### `standby`

Meaning:

- session alive
- no current active work signal
- ready to receive or waiting

Signal:

- slate/yellow muted dot
- label: `대기`
- one-line tail: `최근 출력 없음` or last short preview tail

### `blocked`

Meaning:

- stopped, exited, error, or explicit blocker state inferred from API/preview

Signal:

- red dot
- label: `막힘`
- one-line tail: exit/error text if available, else `입력 또는 확인 필요`

## exact LCC state mapping proposal

Current `SessionStatus` in LCC:

- `active`
- `exited`
- `error`
- `stopped`

Portable release recommendation:

```ts
type PortableCardState = "active" | "standby" | "blocked";

function getPortableCardState(session: Session): PortableCardState {
  if (session.status === "error" || session.status === "exited" || session.status === "stopped") {
    return "blocked";
  }
  return hasRecentUsefulPreview(session) ? "active" : "standby";
}
```

Recommended `hasRecentUsefulPreview(session)` heuristic for first cut:

- `preview_text` or sanitized `preview` contains non-empty recent output
- if no useful preview is available, fall back to `standby`

Do not overfit this to exact terminal protocol semantics in the portable release patch. The release goal is legibility, not perfect orchestration truth.

## recommended low-resolution card layout

At low resolution, each LCC card should show only:

1. left status dot
2. agent/session name
3. short status pill
4. one-line tail summary
5. optional tiny metadata row:
   - team
   - model
   - updated/exit badge

Hide from low-resolution card mode:

- per-card textarea input
- per-card target select
- dense footer controls
- long terminal preview body

Keep available elsewhere:

- selected card
- fullscreen
- popout

This matches the portable release plan: status and access matter more than full interaction in every card.

## concrete UI recommendation for developer-5/developer-8

If a portable-release patch is opened, the safest first step is:

- keep current full terminal behavior for selected/fullscreen/popout
- add a low-resolution compact-card mode for non-selected cards
- compact-card mode should replace the 20-line static preview with:
  - status pill
  - one-line summary
  - optional team/model chip row
- compact-card mode should collapse or hide the footer input on non-selected cards only

This is reversible and aligned with the release-plan constraint that input removal must be cautious.

## proposed labels

- `활성`
- `대기`
- `막힘`
- fallback summary texts:
  - `최근 출력 없음`
  - `입력 또는 확인 필요`
  - `오류 또는 종료 상태`

## what to reuse from HQ

- dot plus short text label
- one-line work/tail summary
- dense grid card with minimal chrome
- full interaction moved to focused terminal panel

## what not to copy from HQ

- HQ floating window manager complexity
- HQ worker queue/context/token bars for the first portable release pass
- HQ-specific org/team rendering rules

LCC should borrow the status-density rule, not the whole UI architecture.

## release recommendation

For `portable-release-20260603`, LCC cards should prioritize:

- readable state
- one-line latest context
- quick access to full terminal

They should not prioritize:

- full per-card interaction controls
- multi-line terminal readability in every card

That is the best tradeoff for low-resolution portability.
