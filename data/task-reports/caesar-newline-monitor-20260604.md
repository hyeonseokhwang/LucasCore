# Caesar Newline Monitor - 2026-06-04

## Summary

- task_id: `caesar-newline-monitor-20260604`
- owner: `han-ops`
- command_mode: `lucas-direct`
- permission: `edit`
- current_state: `doing`

## Objective

Run a nonstop monitor that watches active agent terminal tails for the specific newline/submit failure where command text is visibly injected but Enter submit did not complete, then report each detection to Caesar for handling.

## Lucas Intent

Lucas instructed that this lane must keep watching agent terminal tails continuously, identify newline issues, and report them to Caesar repeatedly so Caesar can handle them.

## Current Symptom / Evidence

- `areum` showed an injected command prompt but did not return the requested exact-line ACK.
- `dev-lead` showed an injected correction prompt still sitting in the tail without a completed visible reply.
- Existing watchdog logic focuses on autosubmit and tail anomalies, not explicit Caesar reporting for each injected-but-not-submitted case.

## Known Wrong Interpretations

- Do not treat ordinary idle prompts such as `Write tests for @filename` as the newline issue.
- Do not auto-submit other agents from this monitor; this task is report-to-Caesar, not self-heal.
- Do not confuse spinner noise or ordinary work-in-progress with the injected-command-without-Enter failure.

## Forbidden Actions

- No source edits outside the monitor implementation and its report files.
- Do not restart `9001`.
- Do not alter protected prompt-text / prompt-submit product behavior.
- Do not send corrective commands into the affected worker sessions from this monitor.

## Source Root / Files

- Source root: `D:\Lucas Core v0.1`
- Planned files:
  - `tools/caesar-newline-monitor.cjs`
  - `data/task-reports/caesar-newline-monitor-20260604.md`
  - monitor runtime state/log files under `data/`

## Protected Contracts

- Terminal newline/submit injection contract
- Terminal rendering/replay evidence interpretation

The monitor must observe and report only. It must not change protected contract behavior.

## Implementation Direction

1. Read live `9001 /api/sessions` tails on an interval.
2. Detect the specific failure signature:
   - injected command visible in terminal tail
   - expected reply/ACK format visible in instruction
   - no matching visible response after the injected command
   - state persists past threshold
3. Report each new/persisting detection to `ceo`/Caesar through the supported session prompt path.
4. Keep local state to avoid noisy duplicate spam while still repeating reports on persistence.
5. Run until local midnight KST on 2026-06-05.

## Understanding Check

`UNDERSTANDING_CHECK caesar-newline-monitor-20260604 owner=han-ops objective=Continuously watch live terminal tails for injected-command-without-Enter failures and report them to Caesar until 2026-06-05 00:00 KST lucas_intent=Do nonstop monitoring and escalation rather than manual spot checks or self-healing forbidden=no 9001 restart; no product contract changes; no auto-submit into worker sessions; no ordinary idle false positives files=tools/caesar-newline-monitor.cjs,data/task-reports/caesar-newline-monitor-20260604.md protected=terminal_newline_submit,terminal_render_replay acceptance=background monitor runs, detects affected sessions like areum/dev-lead, sends Caesar reports, and records local evidence questions=none`

## Acceptance Evidence

- Monitor script exists and passes a syntax check.
- Background process is started with a clear stop time at `2026-06-05 00:00 KST`.
- Runtime state/events file shows polling and detections.
- Caesar receives monitor reports for detected newline issue sessions.

## Live Progress

- 2026-06-04: User clarified exact definition of the newline issue: command text injected into terminal but Enter not submitted, leaving the agent idle.
- 2026-06-04: Confirmed live interactive sessions include `ceo`, `areum`, `dev-lead`, manual TF sessions, and verifier sessions.
- 2026-06-04: Confirmed `areum` is a real positive case by the user-provided definition.
- 2026-06-04: Implemented `tools/caesar-newline-monitor.cjs`.
- 2026-06-04: Syntax check passed with `node --check`.
- 2026-06-04: One-shot detection confirmed live positives:
  - `areum`
  - `dev-lead`
- 2026-06-04: Caesar received direct instruction that:
  - detected cases must be treated as newline/submit failures
  - monitor will report each case and immediately submit Enter
  - systemic prevention must stay contract-compliant as `prompt-text` + `prompt-submit`, not raw concatenated command+newline
- 2026-06-04: Background monitor started for nonstop execution until `2026-06-05 00:00 KST`.
- 2026-06-04: Current monitor runtime/log paths:
  - PID: `39408` node under hidden launcher
  - stdout: `data/system-logs/caesar-newline-monitor/stdout.log`
  - stderr: `data/system-logs/caesar-newline-monitor/stderr.log`
  - state: `data/caesar-newline-monitor-state.json`
  - events: `data/caesar-newline-monitor-events.jsonl`
  - runtime: `data/caesar-newline-monitor-runtime.json`
- 2026-06-04: Latest runtime shows active polling with `trackedIssueCount=0`, meaning the previously visible stuck injected prompts are not currently persisting.

## Open Decisions / Blockers

- None at implementation start.
