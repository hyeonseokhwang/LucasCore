# Developer Source Change Conventions - 2026-06-03

This convention is mandatory before any agent changes source code.

## Pre-Change Checklist

Before editing source, the developer must report:

- task id and owner
- integrated task markdown path
- understanding check approved by Max/Caesar
- files or modules expected to change
- protected contract impact, if any
- regression checks that will be run
- whether the change is implementation, QA, refactor, or emergency recovery

If the impacted area is unclear, stop and ask Dev Lead/Caesar before editing.

## Understanding Check Before Edits

ACK only means the task was received. It does not mean the task was understood.

The assignee must read the integrated task file as the complete context packet. If that file is too terse to explain Lucas intent, visible symptoms, forbidden paths, and acceptance evidence, the assignee must request a better task file instead of filling gaps from assumption.

Before source edits, the assignee must restate:

- the objective in their own words
- Lucas's intent and non-negotiable behavior
- forbidden implementation paths
- files/modules they believe are in scope
- protected contracts touched
- acceptance checks they will use
- clarification questions, or `questions=none`

The manager must approve or correct that restatement before edits begin. If the manager is unavailable, the assignee remains in inspect mode.

Do not implement from a short ledger label. Implementation starts only from a task file that explains both what to do and what not to do.

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
DEV_CHANGE_CHECK agent=<id> task=<task-id> task_md=<path> understanding=<approved-by|pending> files=<paths> protected=<none|contract> approval=<who|pending> regressions=<planned>
DEV_CHANGE_REPORT agent=<id> task=<task-id> task_md=<path> changed=<paths> regressions=<pass/fail> evidence=<ledger/file> risk=<none|...> next=<...>
```

The task markdown file is the durable task report. Keep it updated as the work changes so a restarted owner can continue from the latest verified state without reinterpreting chat history.

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

## Final Review OK Or Return Gate

Reported work is not accepted work.

Every task that reaches `reported`, `qa-pass`, or "ready" state must go through a final reviewer before it can be treated as complete, restored to the ledger, committed, promoted, or reported upward as done.

The final reviewer must choose exactly one outcome:

- `OK_SIGN`: the reviewer inspected the report, evidence, and acceptance criteria and explicitly accepts the work.
- `RETURN_FOR_FIX`: the reviewer rejects the report as incomplete, incorrect, unverified, unclear, or off-intent and sends it back with concrete required fixes.

If the reviewer cannot tell whether the work is correct, the outcome is `RETURN_FOR_FIX`, not silent acceptance.

Required final review line:

```text
FINAL_REVIEW task=<task-id> reviewer=<id> outcome=<OK_SIGN|RETURN_FOR_FIX> evidence=<file/test/screenshot/session> reason=<why> required_fix=<none|items>
```

Ledger/status implication:

- Worker `reported` means "please review."
- `qa-pass` means QA evidence passed, but closure still needs the authorized final reviewer when the task has a protected, policy, UI, runtime, or commit gate.
- `completed` is valid only after `OK_SIGN` by the authorized reviewer.
- `RETURN_FOR_FIX` moves the task back to `doing` or `blocked` with a named owner and required fix list.

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
