# LCC v0.1 Migration Checklist

Date: 2026-05-31 KST

Scope: define the migration target for LCC Core v0.1 based on the HQ operating method, with emphasis on terminal-first UX, lighter grid rendering, and log retention boundaries.

## Why This Direction

The HQ method works well because it separates three concerns that should not compete in one viewport:

- `Fleet awareness`: which agents are alive, blocked, detached, or need review.
- `Focused execution`: one active terminal or chat surface at a time.
- `Evidence retrieval`: original logs kept outside the browser surface and fetched by tail.

This separation reduces browser load, lowers visual noise, and gives the operator one obvious place to type, inspect, and recover.

## Current v0.1 Baseline

Current code behavior:

- The terminal grid mounts live xterm previews directly in each card.
- Fullscreen reuses the same session id and websocket attach flow.
- Card preview, fullscreen replay, and log modal all render tailed output rather than the full file.
- Raw ANSI logs are written to disk under `data/terminal-logs/*.ansi.log`.

Relevant implementation anchors:

- `apps/web/src/main.tsx`
- `apps/web/src/terminalReplay.ts`
- `apps/api/src/main.rs`

## Target User Flow

The expected operator flow after migration is:

1. Open the terminal view and see a lightweight grid of agent status cards.
2. Use the grid to scan health only: name, role, team, status, last update, and short preview if needed.
3. Click one card to enter the single active chat or terminal surface for that session.
4. Type, inspect output, and route commands only in that active surface.
5. Open raw logs only when evidence, postmortem review, or runaway-output diagnosis is needed.
6. Read original logs from file or API tail, not from an in-browser unlimited scrollback.

## UX Migration Rules

### 1. Grid Must Be Lightweight

Acceptance target:

- The default grid is a status board, not a wall of active terminals.
- A card may show a tiny textual preview, but it must not behave like the primary typing surface.
- A card must expose clear actions for `open`, `log`, `stop`, and `delete/detach`.
- Grid scanning should remain useful with many sessions without requiring all xterm instances to stay mounted.

Checklist:

- [ ] Remove the requirement that every grid card render a live terminal viewport.
- [ ] Treat the grid as fleet awareness, not primary execution.
- [ ] Keep status color, owner/name, team, and session state visible at a glance.
- [ ] Keep destructive or recovery actions reachable from the card.

### 2. Single Active Terminal or Chat

Acceptance target:

- Exactly one session is the primary active terminal/chat surface at a time.
- Opening a session should feel like entering a focused workspace, not enlarging one cell in a crowded wall.
- Keyboard attention must belong to the active session, not to multiple concurrent card inputs.

Checklist:

- [ ] Define one active-session state in UI behavior and QA.
- [ ] Make click-to-open the default execution path from the grid.
- [ ] Keep composer semantics identical between card-triggered open and fullscreen/active view.
- [ ] Preserve same-session continuity when entering/leaving the focused view.

### 3. Original Logs Must Stay Outside Browser Memory

Acceptance target:

- Browser surfaces show a tail only.
- API returns a bounded tail only.
- Full original logs remain append-only files on disk.
- Evidence review and postmortem use file or API tail access, not full browser replay.

Checklist:

- [ ] Keep preview bounded in memory.
- [ ] Keep API log retrieval bounded by tail size.
- [ ] Keep browser log rendering bounded by line count.
- [ ] Keep original ANSI logs persisted on disk.
- [ ] Document that GB-class output is supported operationally by file retention, not by loading full output into the UI.

## Migration Work Items

### Product/UX

- [ ] Rename the mental model from `terminal grid` to `fleet status grid`.
- [ ] Define the focused session view as the default place for command input.
- [ ] Make log inspection explicitly secondary to active execution.
- [ ] Keep Canvas and Work Ledger secondary to terminal-focused execution in the main lane.

### API/Runtime

- [ ] Preserve tail-based preview semantics for session lists.
- [ ] Preserve bounded `/api/sessions/:id/log` responses.
- [ ] Preserve append-only file logs for internal PTY sessions.
- [ ] Preserve OS-agent log-tail parity with internal sessions.

### QA

- [ ] Validate that grid browsing does not require loading every session as a full terminal.
- [ ] Validate that opening one session does not break attach/replay continuity.
- [ ] Validate that large-output sessions remain inspectable by file/API tail.
- [ ] Validate that ANSI-heavy logs remain retrievable even when browser rendering is intentionally bounded.

## Non-Goals For This Migration

- Do not turn the browser into the primary audit store.
- Do not promise full-log browser replay for GB-class sessions.
- Do not rely on fullscreen scrollback as evidence retention.
- Do not revert existing user changes while documenting or implementing migration steps.

## Exit Criteria

The migration is complete when all of these are true:

- The operator can scan many sessions from a lightweight status grid.
- One click opens one active terminal/chat surface for focused work.
- Browser output remains bounded and responsive under large-output sessions.
- Original logs remain recoverable from file and API tail.
- QA smoke steps for focused-view open, status-grid scan, and large-log inspection pass.
