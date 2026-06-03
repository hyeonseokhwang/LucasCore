# Developer Source Change Conventions - 2026-06-03

This convention is mandatory before any agent changes source code.

## Pre-Change Checklist

Before editing source, the developer must report:

- task id and owner
- files or modules expected to change
- protected contract impact, if any
- regression checks that will be run
- whether the change is implementation, QA, refactor, or emergency recovery

If the impacted area is unclear, stop and ask Dev Lead/Caesar before editing.

## Protected Contract Check

Always check whether the change touches:

- terminal newline/submit injection
- terminal rendering, replay, scrollback, or xterm control handling
- ledger freeze, approval, event dispatch, or polling watchdog logic
- policy ACK boot flow
- commit, QA, or screenshot evidence gates
- persisted ledger/task schema
- agent staffing, respawn, or startup scripts

Touching a protected contract requires:

- Dev Lead/Caesar approval
- named ledger item
- mapped regression checks
- evidence recorded in the work ledger
- scoped commit after verification

## Terminal Newline/Submit Rules

The terminal instruction path is P0 protected.

Do not:

- concatenate command text and Enter submit into one raw string path
- append `\r` or `\n` to prompt text in automation scripts
- use bracketed paste submit
- use CSI Enter sequences for submit
- bypass `prompt-text` / `prompt-submit` contracts through raw PTY writes
- change Shift+Enter or IME Enter behavior without explicit regression coverage

Required:

- command text injection and Enter submit stay separate
- text ACK and submit ACK are both required before success
- internal LF is preserved
- trailing newlines are trimmed before submit
- `repeat=2` submit is emergency/manual only

## Architecture Boundary Rule

Do not mix domain rules, transport details, UI behavior, operations automation, and persistence in the same change unless the task explicitly requires integration work.

Prefer feature-owned helpers and tests. A later MSA extraction should be possible without rewriting unrelated features.

## Reporting Format

Use this report shape before and after implementation:

```text
DEV_CHANGE_CHECK agent=<id> task=<ledger-id> files=<paths> protected=<none|contract> approval=<who|pending> regressions=<planned>
DEV_CHANGE_REPORT agent=<id> task=<ledger-id> changed=<paths> regressions=<pass/fail> evidence=<ledger/file> risk=<none|...> next=<...>
```

## Completion Reporting Chain

When work is finished, the worker must do both:

- record the official report/evidence in the work ledger
- directly notify the team lead that the report is ready

This mirrors a human workflow: the ledger entry is the formal written report, and the direct team-lead notification is the verbal "I sent the report" handoff.

The team lead then:

- reviews the report and evidence
- accepts, requests fixes, or escalates a blocker
- updates ledger status
- escalates to Caesar only for commit, QA, promotion, policy, staffing, or unresolved decision gates

Workers should not mark a task completed merely because they finished local work. Completion requires team-lead acceptance and the relevant QA/commit gate.

## Ledger Authority And Approval Line

Workers may write ledger updates, but their updates are review requests and evidence reports unless they have explicit approval authority for that item.

Allowed worker ledger actions:

- add evidence
- report doing/blocked/risk
- submit review request
- propose status change
- propose acceptance criteria or follow-up items

Worker reports do not close the task.

Closure authority follows the approval line:

- Worker submits report and evidence.
- Team lead reviews and accepts or returns fixes.
- QA owner verifies when QA is required.
- Max integrates and approves development completion for development tasks.
- Caesar approves protected-contract closure, commit gate, policy gate, staffing gate, and operating/runtime promotion.

Use ledger status and events to distinguish these states:

- `reported`: worker says the work is ready for review
- `lead-review`: team lead is reviewing
- `qa`: QA/evidence verification is in progress
- `qa-pass` or `qa-fail`: QA result
- `completed`: authorized lead/Caesar closure only

If the ledger schema does not yet support a desired status directly, use an allowed event kind such as `reported`, `qa`, `qa-pass`, `qa-fail`, `decision`, or `ledger-update` and keep the task status as `doing` until the approval line closes it.

## Branch, Commit, And Promotion Rule

Treat every source-changing task as a small promotable unit.

Required flow:

- Create or use a task-scoped branch before source edits when the task is not emergency hotfix work.
- Keep each commit scoped to one verified task or one clear subtask.
- Commit after verification, not after a large mixed batch.
- Do not mix unrelated ledger, UI, API, policy, and generated data changes in the same commit.
- Developers submit a PR-style report to Dev Lead/Max with changed files, tests, evidence, residual risk, and rollback note.
- Max reviews/integrates and Caesar gates promotion to operating/runtime use.
- Operational promotion requires evidence that the development branch passed its checks and that any protected contract gate is satisfied.

Emergency Caesar changes are allowed only for Lucas-approved recovery, and must be split into scoped commits as soon as the system is stable enough to do so.
