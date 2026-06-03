# Terminal UI Cleanup And Fit - 2026-06-03

## Status

- State: doing
- Owner: Caesar
- Lucas approval: pending
- Ledger JSON reference: off

## Request

Lucas confirmed the terminal card view mostly returned to normal and requested:

- Hide the visible ledger dock badge (`원장 0/3`) because it is distracting.
- Make terminal xterm views automatically fit when resolution/layout changes.
- Use the work-ledger style process for this task.

## Interpretation

- Do not resume the old JSON ledger workflow for this task.
- Use this MD file as the task source, progress record, QA evidence, and approval trail.
- Treat the task as incomplete until Lucas approves the visible result.

## Plan

- [x] Remove automatic `WorkLedgerDock` render from the normal shell.
- [x] Add repeated automatic xterm `fit()` attempts on mount, font readiness, replay, socket attach, ResizeObserver, and browser resize.
- [ ] Run web tests.
- [ ] Run web build.
- [ ] Restart only 9000 if needed; preserve 9001.
- [ ] Capture 9000 screenshot evidence.
- [ ] Ask Lucas for OK or return-for-fix.

## Changes

- `apps/web/src/main.tsx`
  - Removed normal shell render of `WorkLedgerDock`.
  - Strengthened `HqTerminalPreview` automatic fit handling.

## Evidence

- Pending.

## Review Result

- Pending Lucas OK.
