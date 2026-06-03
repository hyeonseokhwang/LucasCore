# Max Task Card - Terminal Recovery And Manager Monitoring

Issued by: Caesar under Lucas direct order
Mode: emergency recovery
Permission: edit for assigned developer work, verify for Max review
Ledger reference: disabled. Do not read or assign from work-ledger, ceo-command-ledger, execution-board, or 9100 ledger board.

## Situation

Lucas observed that developers are not visibly working after assignment. Max must not assign and disappear. Managers must monitor continuously until the work is reported, blocked, stopped, or handed off.

Current P0 issues:

- Terminal card view shows spinner/cursor fragments such as isolated `W`, `Wo`, `or`, `rk`, `ki`, `in`, `ng` before real terminal content.
- System-injected multiline prompts can remain in composer when submit/newline is missed.
- The submit fallback should use tail detection and a reserved sentinel where possible.
- Preserve 9001. Do not restart 9001.

## Max Required Action

1. ACK in PTY immediately.
2. Assign one developer with `permission=edit` to fix terminal card/static preview sanitization.
3. Assign one developer with `permission=verify` to run CDP/screenshot/DOM/console checks for 9000 card and fullscreen views.
4. Monitor both assignees:
   - ACK due within 30 seconds.
   - HEARTBEAT due at least every 3 minutes.
   - If no visible work appears, reissue, reassign, stop, or escalate.
5. Report using:

```text
MANAGER_CHECK terminal-recovery-20260603 manager=dev-lead assignee=<id> state=<ack|doing|heartbeat-missing|blocked|reported|stopped> evidence=<session|file|test> next=<action>
REPORT terminal-recovery-20260603 state=<reported|blocked|completed> evidence=<files/tests/screenshots> risk=<none|...> next=<Caesar action>
```

## Scope

Allowed source areas for assigned edit work:

- `apps/web/src/terminalReplay.ts`
- `apps/web/src/terminalReplay.test.ts`
- `apps/web/src/main.tsx`
- terminal stuck input watchdog only if explicitly needed for the submit sentinel:
  - `tools/terminal-stuck-input-watchdog.cjs`

Protected contracts:

- terminal rendering/replay
- terminal newline/submit injection

Regression evidence expected:

- targeted web test for terminal replay/sanitization
- watchdog self-test if watchdog is touched
- 9000 CDP screenshot/report after change
- DOM/text and console result from CDP report

Do not commit. Report first.

Tail submit sentinel for injected prompts:

```text
LCC_AUTO_SUBMIT_ON_STABLE_TAIL_V1
```
