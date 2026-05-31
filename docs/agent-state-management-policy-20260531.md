# Agent State Management Policy

Date: 2026-05-31 KST

Scope: branch operating state for 9002 live agents, Work Ledger events, and PTY-visible reporting.

## Required State Flow

Every assigned task follows this flow:

1. `assigned`: Chief Min or owner issues the task.
2. `acknowledged`: assignee confirms receipt with `ACK`.
3. `doing`: assignee starts work or states the concrete first action.
4. `heartbeat`: assignee reports progress at least every 3 minutes while active.
5. `reported`: assignee reports outcome with evidence.
6. Terminal states:
   - `completed`: work is done and evidence is sufficient.
   - `blocked`: assignee cannot progress without named external input or state change.
   - `stopped`: work was intentionally halted, reassigned, or session was closed.

## PTY Reporting Contract

The first visible line in the owner terminal must use one of these prefixes:

```text
ACK <task-id> state=acknowledged owner=<session-id>
HEARTBEAT <task-id> state=heartbeat progress=<short evidence>
REPORT <task-id> state=<reported|completed|blocked|stopped> evidence=<file|test|session|commit> next=<next owner/action>
```

Rules:

- ACK is due within 30 seconds of assignment.
- HEARTBEAT is due every 3 minutes while work is active.
- REPORT is mandatory on completion, block, stop, or handoff.
- Blocked/stopped reports must include `reason`, `last_evidence`, and `next`.
- File-only, markdown-only, or log-only status is not counted until it is visible in PTY or routed to Chief Min/HQ.
- Secrets must never appear in PTY, ledger body, docs, screenshots, or commit messages.

## Work Ledger Event Kinds

`/api/work-ledger/tasks/:id/events` only accepts these event kinds:

```text
assigned
acknowledged
doing
heartbeat
reported
blocked
stopped
completed
qa
qa-pass
qa-fail
evidence
handoff
decision
risk
note
ledger-update
execution-board-update
communication-policy
enterprise-p0-order
organization
dev-request
risk-check
```

Unknown event kinds must be rejected. This prevents ad hoc status strings from fragmenting operational state.

## Abnormal State Criteria

A session is abnormal when any of these are observed:

- no ACK within 30 seconds
- no HEARTBEAT for more than 3 minutes while active
- waits in composer, plan prompt, Enter prompt, or no-response state
- reports only to a file/log without visible PTY report
- lacks owner, evidence, blocker, or next action
- target session mismatch or evidence appears in the wrong terminal

Abnormal entries must record:

```text
session_id
observed_state
last_preview_or_log_check_time
issued_order
owner
next_action
evidence
```

## QA Gate

Before committing state-management changes:

- API unit tests must pass for accepted and rejected event kinds.
- Existing prompt/newline tests must still pass.
- 9002 health must remain `ok=true`.
- 9002 must remain the only active LCC API process unless Lucas explicitly authorizes another port.
- Git commit must include policy, implementation, and QA evidence together.
