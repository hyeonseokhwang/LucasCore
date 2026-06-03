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
- Make terminal popout match the card view exactly, with only the window size differing.
- Assign Areum to organize/optimize ledger page/file structure and Audit Officer to supervise the full process.

## Interpretation

- Do not resume the old JSON ledger workflow for this task.
- Use this MD file as the task source, progress record, QA evidence, and approval trail.
- Treat the task as incomplete until Lucas approves the visible result.

## Plan

- [x] Remove automatic `WorkLedgerDock` render from the normal shell.
- [x] Add repeated automatic xterm `fit()` attempts on mount, font readiness, replay, socket attach, ResizeObserver, and browser resize.
- [x] Align popout with card view terminal/composer/attachment behavior.
- [x] Send ledger organization task to Areum and governance/audit task to Audit Officer.
- [x] Run web tests.
- [x] Run web build.
- [x] Restart only 9000 if needed; preserve 9001.
- [x] Capture 9000 screenshot evidence.
- [ ] Ask Lucas for OK or return-for-fix.

## Changes

- `apps/web/src/main.tsx`
  - Removed normal shell render of `WorkLedgerDock`.
  - Strengthened `HqTerminalPreview` automatic fit handling.
  - Updated popout to use the same attachment, paste, footer, and terminal behavior as card view.
- `apps/web/src/styles.css`
  - Added popout attachment row layout.

## Evidence

- Web tests: `npm --prefix apps/web test -- terminalReplay` passed, 48 tests.
- Web build: `npm --prefix apps/web run build` passed.
- 9000 restarted only; latest observed listener PID: 31360.
- 9001 preserved.
- Card screenshot evidence: `data/system-logs/terminal-9000-cdp/terminal-after-hq-preview-20260603.png`.
- Popout screenshot evidence: `data/system-logs/terminal-9000-cdp/terminal-popout-card-parity-20260603.png`.
- Popout CDP metrics: `isPopout=true`, `popoutFooterVisible=true`, `popoutTextareaVisible=true`.
- Areum/Audit Officer model alignment: both recreated on 9001 as `gpt-5.4`; Audit Officer active after second recreation.
- Areum/Audit task cards sent for ledger organization and governance supervision.

## Review Result

- Pending Lucas OK.
