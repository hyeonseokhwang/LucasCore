# Task Ticket - Terminal Card View Snapshot Recovery

Task id: terminal-cardview-snapshot-recovery-20260603
Status: developer-understanding-check
Priority: P0
Created: 2026-06-03 KST
Updated: 2026-06-03 KST
Mode: emergency recovery
Owner chain: Lucas -> Caesar -> Max -> assigned developers
Current owner: Caesar
Writer lock: owner=Caesar since=2026-06-03 reason=file-based-jira-transition
Reviewer: Lucas
Permission: inspect by default; edit only after explicit live task card and understanding approval
Ledger reference: disabled by Lucas. Do not read work-ledger, ceo-command-ledger, execution-board, or 9100 ledger board until Lucas restores ledger reference.
Event fragments: `data/task-reports/events/terminal-cardview-snapshot-recovery-20260603-*.md`

## Ticket Rules

- This file is the JIRA-like task ticket, live context, progress log, evidence index, and final report.
- Only the current owner edits this main file while the writer lock is active.
- Max/developers write event fragments under `data/task-reports/events/` unless Caesar explicitly grants main-file write.
- Each event fragment must include `task_id`, `author`, `state`, `understanding`, `evidence`, `risk`, and `next`.
- No implementation work starts from a short label or chat memory. Work starts from this file plus an approved understanding check.

## Workflow State

Current state: `developer-understanding-check`

Allowed state path:

```text
draft -> assigned -> understanding-check -> understanding-approved -> doing -> qa -> reported -> accepted
```

Current gate:

- Max must prove he understands Lucas's intent before assigning more edits.
- Developers must not edit until their own understanding check is approved.
- If Max does not answer clearly, Caesar proceeds directly under Lucas's fallback order.

## Lucas Intent

The terminal source is one current terminal text source from the running 9001 terminal session.

Card view, fullscreen, popout, and tab views are display surfaces. They must independently print the same current terminal text snapshot. Opening, refreshing, resizing, or changing a view must not create a new replay, reattach, or replay-from-start behavior.

This is not a styling problem. This is not an xterm replay assignment. This is a source-of-truth problem.

## Current Failure

- Terminal card/fullscreen can show fragments such as `ki`, `in`, `Wng`, `Wog`, `or`, `rk`, or `w20`.
- Fullscreen/card view can look like it rerenders or replays when another view opens or refreshes.
- Previous instructions drifted because Caesar framed the work as terminal replay/xterm work instead of simple snapshot display.
- Max assigned work but did not monitor tightly enough after assignment.
- Direct PTY injection worked better because the instruction was visible in-place and interpretation distance was short. The ledger/task-file route became worse when the task was compressed into labels like "terminal replay" or "static preview fix"; agents filled missing context with their own model.

## Why This Matters

This is not only a terminal UI defect. It is a command-chain defect.

If the written task packet is too terse, parallel development will amplify misunderstanding: Caesar compresses Lucas intent, Max decomposes the compressed version, developers implement the wrong abstraction, and QA verifies local symptoms instead of the original intent.

For company operation, every task file must preserve the full context, the human-visible problem, the expected behavior, and known wrong paths. Otherwise the written system becomes a source of drift instead of memory.

## Correct Technical Direction

- Preserve 9001 singleton. Do not restart 9001 without Lucas approval.
- Keep raw PTY stream/log handling separate from card display source.
- Add or use a backend current display snapshot for each session.
- `SessionView.preview_text` for card/fullscreen display must come from that current display snapshot, not from raw PTY stream tail after ANSI stripping.
- Card/fullscreen/popout should display the snapshot as plain terminal text unless Lucas separately requests an interactive terminal mode.

## Known Wrong Interpretations

- "Fix terminal replay" is wrong if it leads to replaying output into every new view.
- "Use xterm for fullscreen" is wrong if it attaches to the PTY or requests replay on view creation.
- "Use static preview" is wrong if it makes the terminal look dead and stops live monitoring.
- "Add sanitizer filters" is wrong if it hides fragments instead of fixing the source.
- "Tests pass" is insufficient if the tests do not prove Lucas's behavior contract.

## Forbidden Actions

- Do not replace card view with `XtermPreview`.
- Do not make fullscreen/popout opening trigger replay or attach.
- Do not solve the bug with random UI fragment filters.
- Do not read ledger files while ledger reference is disabled.
- Do not commit before Lucas/Caesar review.

## Protected Contracts

- Terminal rendering/replay: touched.
- Terminal newline/submit injection: may be affected only if watchdog or prompt injection is changed. Do not change it without explicit approval and regression evidence.
- Policy ACK/QA gates: touched by operating-policy updates.

## Source Root

Use the real source root:

```text
D:\Lucas Core v0.1
```

Do not assume `workspaces\...\repo` contains the real source files.

## Likely Files

```text
apps/api/src/main.rs
apps/web/src/main.tsx
apps/web/src/terminalReplay.ts
tools/terminal-stuck-input-watchdog.cjs
```

## Active Assignment

Max must read this file and first prove his own understanding before briefing developers.

Required Max visible reports:

```text
ACK terminal-cardview-snapshot-recovery manager=dev-lead permission=edit
UNDERSTANDING_CHECK terminal-cardview-snapshot-recovery owner=dev-lead objective=<own words> lucas_intent=<own words> forbidden=<list> files=<paths> protected=terminal-rendering/replay acceptance=<checks> questions=<none|...>
MANAGER_CHECK terminal-cardview-snapshot-recovery manager=dev-lead assignee=<id> state=<ack|doing|heartbeat-missing|blocked|reported> evidence=<session|file|test> next=<action>
REPORT terminal-cardview-snapshot-recovery state=<reported|blocked|completed> changed=<files> evidence=<tests/screenshots> risk=<none|...> next=<Caesar action>
```

## Acceptance Checks

- Source diff confirms card/fullscreen do not mount `XtermPreview` for passive display and do not request replay on view creation.
- API evidence confirms card source is current display snapshot, not raw PTY stream tail stripped of ANSI.
- 9000 screenshot shows card view without fragment-only output.
- Fullscreen open/refresh does not replay from start.
- Console check has no relevant errors.
- Build/tests pass for touched web/API modules.

## Live Progress

- 2026-06-03: Lucas ordered integrated task markdown to be used as the shared context, live progress note, report, and ledger-like memory for each task.
- 2026-06-03: Caesar created this task report and updated command-chain/state/source-change policies to require one integrated markdown task file per non-trivial task.
- 2026-06-03: Caesar captured current 9000 evidence at `data/system-logs/terminal-9000-cdp/terminal-fullscreen-current-broken-20260603.png` with report `data/system-logs/terminal-9000-cdp/terminal-fullscreen-current-broken-20260603-report.json`.
- 2026-06-03: Diagnosis: the plain white terminal appearance is partly a style/rendering regression. Card/fullscreen/popout were changed to `<pre class="static-terminal-preview">`, which strips the xterm terminal cell/color renderer. The deeper fragment/flow issue is still source/model related: UI work drifted into sanitizer/static preview work while the API/runtime source was still raw PTY tail or an unapplied backend snapshot change.
- 2026-06-03: Corrective implementation direction: replace passive `<pre>` terminal display with a passive xterm snapshot renderer. It must render the same session snapshot text with terminal colors/cell behavior, but it must not open a websocket, attach, request replay, or send resize/input merely because a card/fullscreen/popout view opens.
- 2026-06-03: Follow-up diagnosis from Lucas: Caesar terminal still visually flowed downward. Cause: the passive xterm snapshot renderer still called `term.reset()` and `term.write(snapshot)` whenever polling delivered changed preview text. That removed websocket replay, but still replayed the snapshot into xterm on each update. This is also against Lucas intent.
- 2026-06-03: Immediate correction: stop using xterm write for passive card/fullscreen/popout snapshot display. Render the latest snapshot as a direct DOM text replacement so there is no animated write/replay path. Keep the backend display-snapshot direction for the real source-of-truth fix.
- 2026-06-03: Command-chain correction: wrong work must be interrogated at the actor level before more implementation. Developer 1 reported a `terminalReplay.ts` fragment sanitizer fix; that was the wrong implementation model because it treats symptoms rather than the source contract. Developer 8 reported static/xterm DOM observations but did not stop the mismatch against Lucas intent. Max must ask why each actor chose that interpretation, then block repeat patterns before assigning more edits.
- 2026-06-03: File-based JIRA transition completed for this task. Main ticket now has status, writer lock, owner, workflow, event fragment path, and understanding gate.
- 2026-06-03: Caesar injected Max understanding-check prompts, but no `UNDERSTANDING_CHECK terminal-cardview-snapshot-recovery` response was observed. Current operational conclusion: Max is not usable as the next execution gate for this issue until he responds clearly.
- 2026-06-03: After Lucas directly asked why Max had not answered, Max produced a visible `UNDERSTANDING_CHECK terminal-cardview-snapshot-recovery`. Caesar observed the Max terminal screenshot and accepted that Max now understands: passive display surfaces, one current terminal snapshot source, no view-created replay/attach, no raw-tail fragment source, no sanitizer workaround.
- 2026-06-03: Lucas ordered Max to propagate the exact intent to practitioners, collect proof that they understand, report the understanding result, then start development immediately.
- 2026-06-03: Caesar expanded `tools/extract-9000-terminal-tail-cdp.cjs` into a screen-reading evidence tool. It now opens 9000 through Chrome/CDP, captures card screenshot, optionally opens a target session fullscreen, captures fullscreen screenshot, and writes DOM tail plus console events into one JSON report.
- 2026-06-03: Evidence capture `screen-watch-dev-lead-20260603` succeeded for `dev-lead`. Outputs: `data/system-logs/terminal-9000-cdp/screen-watch-dev-lead-20260603-card.png`, `data/system-logs/terminal-9000-cdp/screen-watch-dev-lead-20260603-fullscreen.png`, and `data/system-logs/terminal-9000-cdp/screen-watch-dev-lead-20260603-tail.json`.
- 2026-06-03: CDP tail evidence shows the card still contains meaningful Max progress followed by fragment rows such as `in`, `ng`, `g`, `2`; fullscreen opened successfully but its tail is dominated by fragments such as `W`, `Wo`, `or`, `rk`, `ki`, `in`, `Wng`, `Wog`. This confirms the manager screen-reading path works and the current fullscreen display source remains polluted.
- 2026-06-03: Caesar added a web runtime fallback display snapshot builder in `apps/web/src/terminalReplay.ts`. `TerminalSnapshotPreview` now computes a cursor-aware current screen from raw `session.preview` before falling back to stripped `preview_text`. This preserves 9001 while avoiding raw-tail fragment accumulation in 9000.
- 2026-06-03: Verification passed: `npm --prefix apps/web test -- terminalReplay`, `npm --prefix apps/web run build`, `cargo test --manifest-path apps/api/Cargo.toml terminal_display_snapshot_tracks_current_visible_text -- --nocapture`, and `cargo test --manifest-path apps/api/Cargo.toml --quiet`.
- 2026-06-03: CDP evidence after web fallback shows card and fullscreen for `dev-lead` both use `terminal-snapshot-preview`, have 51 visible lines, 0 spinner fragments, and show the same Max report tail. Report: `data/system-logs/terminal-9000-cdp/terminal-snapshot-preview-after-web-fallback-20260603-tail.json`.
- 2026-06-03: CDP evidence for popout `?popout=dev-lead` also uses `terminal-snapshot-preview fullscreen`, has 51 visible lines, 0 spinner fragments, and shows the same Max report tail. Report: `data/system-logs/terminal-9000-cdp/terminal-snapshot-popout-after-web-fallback-20260603-tail.json`.
- 2026-06-03: Stability recheck after active Max work exposed a one-line fullscreen spinner snapshot. Caesar added `terminalPreviewTextForSnapshot`, which chooses between raw ANSI cursor snapshot and stripped `preview_text` by meaningful-line score. This prevents active spinner redraw tails from collapsing fullscreen to a single `Working` line.
- 2026-06-03: Stability recheck after the fallback patch passed. `terminal-snapshot-stability-recheck-3-20260603-tail.json` showed card 54 lines / 0 fragments and fullscreen 58 lines / 0 fragments. `terminal-snapshot-popout-stability-recheck-2-20260603-tail.json` showed popout 60 lines / 0 fragments.
- 2026-06-03: The `lcc-terminal-screen-reader` skill was corrected to classify from the same cursor-aware snapshot model and to use raw marker scanning only for queued/pasted input detection. Current reads: Max pending=none meaningfulLineCount=53, Developer 1 pending=none, Developer 8 pending=none.
- 2026-06-03: Final current-state audit after reconnect: 9001 PID remains 14540, Max pending=none meaningfulLineCount=73, Developer 1 pending=none, Developer 8 pending=none. Latest 9000 CDP evidence shows card/fullscreen/popout all have 54 visible lines, 0 spinner fragments, and the same Max tail. Reports: `terminal-snapshot-final-audit-card-fullscreen-20260603-tail.json`, `terminal-snapshot-final-audit-popout-20260603-tail.json`.

## Active Stop Rules

- Developer 1 must not edit `terminalReplay.ts` or add fragment filters for this task unless Caesar explicitly reopens that lane.
- Developer 8 must not report DOM state as acceptable unless it is checked against Lucas intent: one source, no view-created replay, no xterm attach for passive display, no raw-tail fragment source.
- Max must not accept reports that say "tests pass" unless the report also explains whether the implementation preserves Lucas intent.
- Any future assignment must quote this task report path and the exact forbidden implementation patterns.
- No developer may edit this task until they pass an understanding check in PTY and Max/Caesar approves it.
- ACK is not enough. The required pre-edit line is:

```text
UNDERSTANDING_CHECK terminal-cardview-snapshot-recovery owner=<session-id> objective=<own words> lucas_intent=<own words> forbidden=<list> files=<paths> protected=terminal-rendering/replay acceptance=<checks> questions=<none|...>
```

- Manager approval line:

```text
UNDERSTANDING_APPROVED terminal-cardview-snapshot-recovery manager=<session-id> assignee=<session-id> permission=edit
```

- If the assignee says "snapshot", "replay", "xterm", "static", or "sanitizer" ambiguously, Max must ask a clarification question before edit approval.

## Evidence

- Policy files updated:
  - `AGENTS.md`
  - `docs/command-chain-policy-20260531.md`
  - `docs/agent-state-management-policy-20260531.md`
  - `docs/developer-source-change-conventions-20260603.md`
- JIRA-like file workflow initialized:
  - `data/task-reports/terminal-cardview-snapshot-recovery-20260603.md`
  - `data/task-reports/events/`
- Screen-reading evidence:
  - `tools/extract-9000-terminal-tail-cdp.cjs`
  - `data/system-logs/terminal-9000-cdp/screen-watch-dev-lead-20260603-card.png`
  - `data/system-logs/terminal-9000-cdp/screen-watch-dev-lead-20260603-fullscreen.png`
  - `data/system-logs/terminal-9000-cdp/screen-watch-dev-lead-20260603-tail.json`
- Recovery evidence:
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-preview-after-web-fallback-20260603-card.png`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-preview-after-web-fallback-20260603-fullscreen.png`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-preview-after-web-fallback-20260603-tail.json`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-popout-after-web-fallback-20260603-card.png`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-popout-after-web-fallback-20260603-tail.json`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-stability-recheck-3-20260603-card.png`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-stability-recheck-3-20260603-fullscreen.png`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-stability-recheck-3-20260603-tail.json`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-popout-stability-recheck-2-20260603-card.png`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-popout-stability-recheck-2-20260603-tail.json`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-final-audit-card-fullscreen-20260603-card.png`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-final-audit-card-fullscreen-20260603-fullscreen.png`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-final-audit-card-fullscreen-20260603-tail.json`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-final-audit-popout-20260603-card.png`
  - `data/system-logs/terminal-9000-cdp/terminal-snapshot-final-audit-popout-20260603-tail.json`

## Next Action

Max must now collect practitioner understanding checks and report them. After valid understanding checks are accepted, development should start immediately.
