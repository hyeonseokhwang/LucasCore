# Work Ledger Reminder Ops

Date scope: 2026-05-31 KST.

This document defines today's reminder behavior for the work ledger. It is an operations/design note only; app source changes are out of scope.

## Branch Manager Daily Page Spec

Goal: provide a separate, always-visible work ledger page for a branch manager to track daily objectives, reminders, progress, and status without competing with the terminal-first developer UI.

Placement:

- Run as a separate page or port from the main terminal control plane.
- Support standalone URL modes: `?view=ledger` and `#/ledger`.
- Keep it visible on a second monitor or separate browser window.
- Do not hide it behind Canvas, terminal grid, or transient modals.
- Keep future HQ/branch coordination hooks explicit but non-blocking for the first version.

Primary sections:

- `Today`: daily objectives, owner, priority, due time, and current status.
- `Hourly Reminder`: next reminder time, last fired time, acknowledgement state, snooze, blocked, complete.
- `Progress Timeline`: append-only chronological events for objective changes, reminders, evidence, reviews, and handoffs.
- `Status Board`: compact counts for active, due, blocked, waiting, completed, and missed items.
- `Execution Board`: leader/team-lead status checks, child-session preview/log evidence, and abnormal response tracking.
- `Coordination Later`: reserved area for HQ and branch messages, approvals, and cross-branch sync once the protocol is stable.

Daily objective fields:

- title
- branch or workstream
- owner
- target outcome
- priority
- due time or cadence
- status: `planned`, `active`, `due`, `blocked`, `waiting`, `completed`, or `missed`
- next action
- evidence/reference

Interaction rules:

- Every action appends a ledger event; no silent overwrites.
- Acknowledging a reminder does not mark the objective complete.
- Completing or blocking an objective requires a note.
- Evidence is optional for simple reminders but required for completion of deliverables.
- Hourly reminders continue until the item is completed, blocked, or explicitly snoozed.

Execution board status-check criteria:

- Each team lead must directly inspect subordinate session preview and log evidence before reporting status.
- A session is `normal` only when the latest preview/log shows active work, a clear final report, or a clear blocker with owner/next action.
- A session is `abnormal` when it does not respond after an order, waits in composer, waits in plan mode, waits for Enter, or otherwise appears idle without an explicit handoff.
- Abnormal entries must record session id, observed state, last preview/log check time, command/order issued, and next owner/action.
- Team leads must not infer health from session existence alone; preview/log confirmation is required.

Enterprise communication policy:

- PTY-visible terminal output is the source of truth for operational reports. Files, markdown, and ledger entries are secondary audit artifacts only.
- Every task report must print first in the owner pty before being counted as reported.
- First line prefix is mandatory: `ACK`, `HEARTBEAT`, or `REPORT`.
- ACK is due within 30 seconds of assignment, REPORT is due on completion or block, and HEARTBEAT is due every 3 minutes while work is active.
- Task state progression is fixed as `assigned -> acknowledged -> doing -> heartbeat* -> reported -> completed|blocked|stopped`.
- Work Ledger event kinds must use the controlled vocabulary in `docs/agent-state-management-policy-20260531.md`; ad hoc event kind strings are invalid.
- `blocked` and `stopped` reports must include reason, last evidence, and next owner/action.
- Reports that exist only in terminal logs, files, markdown, or ledger but are not routed to Chief Min/HQ visible report are communication gaps.
- All reports to Lucas, Branch Director, or HQ leadership must use highest Korean honorifics in the body text.
- Before approved product-code work begins, leads must separately check and record product-code-change risk.

Current execution board P0 items:

- `p0-terminalcard-chat-input`: TerminalCard bottom chat input cannot attach images and has unstable newline/submit behavior. Owner: Dev Alpha. Subowners: Dev Bravo, Dev Charlie, Dev Delta, Dev Echo, Dev Foxtrot. Existing newline/submit checks are recorded only as `terminal internal/modal path partial PASS`; the TerminalCard footer composer remains unresolved.
- `p0-ui-overlay-occlusion`: Local disconnect/status overlay occludes Grid/Canvas controls, and ledger floating badge occludes terminal/card footer. Owner: Dev Alpha. Acceptance: overlays removed/repositioned or draggable/dockable, no occlusion of primary controls/input/footer, and position persistence if feasible.
- `p0-newline-audit-1410`: Enterprise newline/submit audit due `2026-05-31 14:10 KST`. Scope: bottom chat input, terminal internal composer, fullscreen/modal composer, Shift+Enter newline, Enter submit, IME composing Enter, image attach/delivery path, command no-response, plan wait, and Enter wait. Required pty lines: `ACK newline-audit <role>` then `REPORT newline-audit status=<ok|affected|fixed|blocked> evidence=<exact terminal/session/file/test>`.

First implementation should stay local-first: JSONL ledger storage, browser page polling or WebSocket updates, and no dependency on HQ sync. HQ/branch coordination can consume the same ledger events later.

## Branch Manager Terminal Fullscreen

The branch manager should be able to switch the terminal control plane into fullscreen or near-fullscreen mode for focused developer monitoring.

Fullscreen behavior:

- Use the same session id and existing terminal connection.
- Do not create a second terminal session for fullscreen.
- Render fullscreen as an overlay above the current terminal grid.
- Close fullscreen with `Esc` and return to the same terminal card state.
- Hide nonessential chrome: topbar, toolbar, sidebars, and secondary panels.
- Keep recovery controls visible for restoring panels, leaving fullscreen, stopping sessions, and opening logs.
- Prioritize active developer terminals over the dev-lead terminal because dev-lead coordinates and reviews.
- Preserve terminal input/output priority over ledger or coordination UI.
- Do not embed the Work Ledger inside terminal fullscreen.

Standalone ledger coexistence:

- The Work Ledger remains a separate always-visible page or port.
- Terminal fullscreen is for live execution monitoring; the ledger page is for objectives, reminders, status, and audit timeline.
- Terminal events may append ledger entries, but fullscreen mode must not replace the ledger page.

## Reminder Set For Today

Today's objectives:

- `spring-msa-study-start-1400`: Spring MSA study starts at 14:00 KST and is the top schedule priority.
- `p0-terminalcard-chat-input`: TerminalCard bottom chat input image attach and newline/submit instability.
- `p0-ui-overlay-occlusion`: UI overlays occluding Grid/Canvas controls and terminal/card footer.
- `p0-newline-audit-1410`: Enterprise newline/submit audit due at 14:10 KST.
- `communication-gap-pty-visible-reporting`: Dev Alpha terminal-log-only report must be routed to Chief Min/HQ visible pty report.
- `tax-hourly`: year-end tax hourly reminder.
- `spring-msa-whitepaper-1330`: Spring MSA whitepaper at 13:30 KST.
- `android-final-1400`: Heungkuk Android final work at 14:00 KST.
- `spring-msa-study-2000`: Spring MSA study at 20:00 KST.
- `hq-comms`: HQ communications and inbound/outbound handoff clarity.
- `staffing-6p`: 6-person staffing status.

## Ledger Page Today Snapshot

Call sign owner: Mira Ledger.

The ledger page should show these rows for 2026-05-31 KST. Use the ASCII-safe `display_key` if Korean text rendering is unreliable.

| Time | display_key | Korean label | Status | Reminder | Next action |
|---|---|---|---|---|---|
| 14:00 | `spring-msa-study-start-1400` | Spring MSA study start | top-priority scheduled | fixed at 14:00 KST | Start Spring MSA learning before lower-priority work; record owner, evidence, blocker, and next step. |
| Immediate | `p0-terminalcard-chat-input` | TerminalCard footer composer P0 | active P0 | continuous until fixed/blocked | Dev Alpha leads Bravo/Charlie/Delta/Echo/Foxtrot to confirm permanent fix plan and approval/emergency path. |
| Immediate | `p0-ui-overlay-occlusion` | UI overlay occlusion P0 | active P0 | continuous until fixed/blocked | Dev Alpha removes/repositions or makes overlays draggable/dockable without occluding controls/input/footer. |
| 14:10 | `p0-newline-audit-1410` | Enterprise newline audit | active P0 | fixed at 14:10 KST | All leads print ACK/REPORT in pty using required newline-audit format and exact evidence. |
| Continuous | `communication-gap-pty-visible-reporting` | PTY visible reporting gap | active | 30s ACK, 3m HEARTBEAT, REPORT on done/block | Treat file-only or log-only reporting as unreported; route Dev Alpha report to Chief Min/HQ visible pty. |
| Hourly | `tax-hourly` | 연말정산 시간별 확인 | active | hourly until done/blocked/snoozed | Check status, record acknowledgement, update blocker or completion note. |
| 13:30 | `spring-msa-whitepaper-1330` | Spring MSA 백서 | scheduled | fixed at 13:30 KST | Open whitepaper task, record study/output note. |
| 14:00 | `android-final-1400` | 흥국 Android 최종 작업 | scheduled | fixed at 14:00 KST | Track final package, verification, SHA, delivery path, and owner. |
| 20:00 | `spring-msa-study-2000` | Spring MSA 학습 | scheduled | fixed at 20:00 KST | Record study progress, blocker, and next step. |
| Continuous | `hq-comms` | HQ 통신 | active | event-driven | Keep LIVE PASS, token rotation, inbound 9102, and encoding status clear. |
| Continuous | `staffing-6p` | 6인 체제 | active | event-driven | Show dev-lead plus five developers, roles, active/blocked state, and handoff owner. |

Minimum visible fields:

- `display_key`
- Korean label when readable
- due time or cadence
- status
- owner
- last event time
- next reminder time
- next action
- evidence/reference
- blocker note, if any

### Year-End Tax

- Cadence: hourly reminder.
- Active window: from the first ledger check today until the user acknowledges completion or snoozes the item.
- UI label: `Year-end tax follow-up`.
- Display key: `tax-hourly`.
- UI detail: show the next due time, last reminder time, and acknowledgement state.
- Default next action text: `Review pending year-end tax work and update ledger status.`

### Spring MSA Whitepaper

- Cadence: fixed reminder at 13:30 KST today.
- UI label: `Spring MSA whitepaper`.
- Display key: `spring-msa-whitepaper-1330`.
- UI detail: show `Due today 13:30 KST` until acknowledged.
- Default next action text: `Read or draft Spring MSA whitepaper notes and record evidence.`

### Heungkuk Android Final Work

- Cadence: fixed reminder at 14:00 KST today.
- UI label: `Heungkuk Android final work`.
- Display key: `android-final-1400`.
- UI detail: show `Due today 14:00 KST` until acknowledged.
- Default next action text: `Complete final Android package work, verification, SHA, owner, and delivery status.`

### Spring MSA Study

- Cadence: fixed reminder at 20:00 KST today.
- UI label: `Spring MSA study`.
- Display key: `spring-msa-study-2000`.
- UI detail: show `Due today 20:00 KST` until acknowledged.
- Default next action text: `Check Spring MSA progress and record blocker/next step.`

### Spring MSA Study Start

- Cadence: fixed start at 14:00 KST today.
- UI label: `Spring MSA study start`.
- Display key: `spring-msa-study-start-1400`.
- UI detail: show `Top priority due today 14:00 KST` until acknowledged.
- Default next action text: `Start Spring MSA learning now, then log progress, blocker, and evidence.`

### HQ Communications

- Cadence: event-driven tracking.
- UI label: `HQ communications`.
- Display key: `hq-comms`.
- UI detail: show latest outbound/inbound status, LIVE PASS status, token rotation request, and `9102` inbound readiness.
- Default next action text: `Keep HQ handoff readable, token-safe, and linked to evidence.`

### Six-Person Staffing

- Cadence: event-driven tracking.
- UI label: `6-person staffing`.
- Display key: `staffing-6p`.
- UI detail: show dev-lead plus five developers, role assignment, active/blocked state, and latest handoff.
- Default next action text: `Confirm staffing coverage and record blockers or reassignment needs.`

## UI Behavior

The work ledger UI should show a reminder strip or panel with:

- reminder title
- due time or cadence
- current state: `scheduled`, `active`, `due`, `snoozed`, `acknowledged`, `blocked`, `completed`, or `missed`
- last fired time
- next fire time, when applicable
- owner or responsible workspace, when known
- one short next action

Priority order:

1. Top-priority 14:00 KST Spring MSA study start.
2. P0 TerminalCard footer composer image attach and newline/submit instability.
3. P0 UI overlay occlusion.
4. P0 enterprise newline/submit audit due 14:10 KST.
5. Communication gaps where pty-visible reports were not routed to Chief Min/HQ.
6. Due or overdue reminders.
7. Abnormal execution-board session checks.
8. Blocked reminders.
9. Tracking reminders without a logged status.
10. Future reminders.
11. Acknowledged/completed reminders.

For 2026-05-31, if multiple reminders are due at once, show `spring-msa-study-start-1400` first, then P0 execution board rows, then overdue fixed-time items in time order: `spring-msa-whitepaper-1330`, `android-final-1400`, then `spring-msa-study-2000`. Keep `tax-hourly`, `hq-comms`, `staffing-6p`, and execution-board abnormal checks visible as active tracking rows.

## Acknowledgement

Each reminder must support:

- `Acknowledge`: records that the user saw the reminder. It does not mark the work complete.
- `Snooze`: delays the next reminder. For year-end tax, the default snooze is 1 hour. For fixed-time items, the default snooze is 30 minutes unless the user chooses another time.
- `Mark blocked`: requires a blocker note and next owner/action.
- `Mark complete`: requires a completion note and evidence/reference when available.

Acknowledgement should be per reminder item, not global. Acknowledging one row must not silence the other daily objectives.

## Logging Requirements

Every reminder event must append a ledger entry with:

- timestamp in KST
- reminder id
- reminder title
- event type: `created`, `fired`, `acknowledged`, `snoozed`, `blocked`, `completed`, or `status_updated`
- actor, if known
- previous state
- new state
- due time
- next fire time, if any
- note text, if supplied
- evidence/reference path or URL, if supplied

`android-final-1400` must additionally log:

- package filename or artifact id
- SHA256, if available
- verification result
- delivery target
- owner
- blocker, if not delivered

`spring-msa-whitepaper-1330` must additionally log whether the 13:30 whitepaper check was completed, missed, or snoozed.

`spring-msa-study-2000` must additionally log whether the 20:00 study check was completed, missed, or snoozed.

`spring-msa-study-start-1400` must additionally log whether the 14:00 study start began, was missed, or was blocked, plus owner, evidence/reference, and next step.

`hq-comms` must additionally log latest HQ message id, LIVE PASS status, token rotation state, and inbound `9102` readiness.

`staffing-6p` must additionally log the six seats, current owner per seat, active/blocked state, and handoff owner.

Execution-board abnormal checks must additionally log subordinate session id, preview/log source, observed waiting state, issued command/order, response status, and owner for recovery.

Year-end tax hourly reminders must additionally log each fired hour and whether it was acknowledged before the next hourly reminder.

## Fastest Operational Path

For today, operators can run the ledger with manual entries if automation is not implemented yet:

1. Create the Spring MSA study start item with due time `2026-05-31 14:00 KST` as top priority.
2. Create the year-end tax hourly item and append a `fired` entry each hour until acknowledged, blocked, or completed.
3. Create the Spring MSA whitepaper item with due time `2026-05-31 13:30 KST`.
4. Create the Heungkuk Android final work item with due time `2026-05-31 14:00 KST`.
5. Create the Spring MSA study item with due time `2026-05-31 20:00 KST`.
6. Create the HQ communications item as event-driven tracking and link LIVE PASS, encoding, token rotation, and inbound `9102` notes.
7. Create the 6-person staffing item as event-driven tracking and update active/blocked seats during the day.
8. For each team lead status check, inspect subordinate session preview/log directly and append any command-no-response, composer-wait, plan-wait, or Enter-wait case as abnormal.

## Port Operations

- Port `9002` is live and must not be killed during branch work.
- If cleanup or verification needs a test server, use only ports `9003` or `9004`.
- Do not stop or replace the live `9002` process unless HQ explicitly authorizes it.
