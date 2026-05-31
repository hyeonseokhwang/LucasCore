# Work Ledger Reminder Ops

Date scope: 2026-05-31 KST.

This document defines today's reminder behavior for the work ledger. It is an operations/design note only; app source changes are out of scope.

## Reminder Set For Today

### Year-End Tax

- Cadence: hourly reminder.
- Active window: from the first ledger check today until the user acknowledges completion or snoozes the item.
- UI label: `Year-end tax follow-up`.
- UI detail: show the next due time, last reminder time, and acknowledgement state.
- Default next action text: `Review pending year-end tax work and update ledger status.`

### Spring MSA

- Cadence: fixed reminder at 20:00 KST today.
- UI label: `Spring MSA check`.
- UI detail: show `Due today 20:00 KST` until acknowledged.
- Default next action text: `Check Spring MSA progress and record blocker/next step.`

### Heungkuk Android Final Package

- Cadence: tracking reminder, not hourly by default.
- Trigger today: show as active until final package status is logged.
- UI label: `Heungkuk Android final package`.
- UI detail: show current package state if known: `pending`, `built`, `verified`, `delivered`, or `blocked`.
- Default next action text: `Track final APK/package status, verification result, owner, and delivery path.`

## UI Behavior

The work ledger UI should show a reminder strip or panel with:

- reminder title
- due time or cadence
- current state: `due`, `snoozed`, `acknowledged`, `blocked`, or `completed`
- last fired time
- next fire time, when applicable
- owner or responsible workspace, when known
- one short next action

Priority order:

1. Due or overdue reminders.
2. Blocked reminders.
3. Tracking reminders without a logged status.
4. Future reminders.
5. Acknowledged/completed reminders.

For 2026-05-31, if multiple reminders are due at once, show Spring MSA 20:00 first at or after 20:00 KST, then Heungkuk Android final package tracking, then year-end tax hourly reminder.

## Acknowledgement

Each reminder must support:

- `Acknowledge`: records that the user saw the reminder. It does not mark the work complete.
- `Snooze`: delays the next reminder. For year-end tax, the default snooze is 1 hour. For Spring MSA, snooze should be 30 minutes after 20:00 unless the user chooses another time.
- `Mark blocked`: requires a blocker note and next owner/action.
- `Mark complete`: requires a completion note and evidence/reference when available.

Acknowledgement should be per reminder item, not global. Acknowledging the year-end tax reminder should not silence Spring MSA or Heungkuk Android tracking.

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

Heungkuk Android final package tracking must additionally log:

- package filename or artifact id
- SHA256, if available
- verification result
- delivery target
- owner
- blocker, if not delivered

Spring MSA 20:00 must additionally log whether the 20:00 check was completed, missed, or snoozed.

Year-end tax hourly reminders must additionally log each fired hour and whether it was acknowledged before the next hourly reminder.

## Fastest Operational Path

For today, operators can run the ledger with three manual entries if automation is not implemented yet:

1. Create the year-end tax hourly item and append a `fired` entry each hour until acknowledged, blocked, or completed.
2. Create the Spring MSA item with due time `2026-05-31 20:00 KST`.
3. Create the Heungkuk Android final package item as `tracking` and update it whenever package build, SHA256, verification, or delivery status changes.
