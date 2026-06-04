# Terminal QA Audit Trail - 2026-06-02

Purpose: record missed or overstated terminal QA claims, hourly-report drift, evidence ownership, and the minimum evaluation criteria before any future "fixed" or "ready" report.

## Scope

- `terminal-buffer-instant-render-20260602`
- `terminal-input-text-loss-20260602`
- `caesar-hourly-reporting`
- Related visible-progress reporting for `ops-progress-space-20260602` and `ceo-9100-board-cleanup-20260602`

## Audit Summary

Several terminal reports claimed readiness or PASS-level evidence before Lucas-visible acceptance was actually met. The failure mode was consistent:

1. source changed
2. tests/build/CDP artifacts existed
3. report language escalated to "ready", "PASS", or equivalent
4. Lucas-visible acceptance still failed

This means the reporting chain must distinguish:

- source-level completion
- QA artifact presence
- user-visible acceptance
- commit readiness

These are not interchangeable.

## Incident Trail

### 1. Earlier terminal PASS claims existed before Lucas-visible acceptance

Evidence in [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:500>) and [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:521>) shows PASS-level claims for:

- `p0-screen-live-preview`
- `P0 terminal front-buffer PASS`

Those entries recorded:

- source change in `apps/web/src/main.tsx`
- web test/build pass
- CDP screenshots
- `9001` preserved

But those older PASS claims did not guarantee later Lucas-visible acceptance for current terminal UX.

### 2. 2026-06-02 terminal "ready" report was later invalidated by Lucas-visible failure

Evidence in [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:710>) and [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:717>) records:

`[Max -> Caesar][terminal-1400] Visible terminal result is ready`

Claimed evidence included:

- input-loss CDP `ok=true/status=fixed`
- terminal UX CDP `ok=true`
- `npm` test/build passed
- `9000` restarted
- `9001` preserved at PID `1656`
- `developer-7` untouched

That readiness claim was later explicitly reopened as blocked by Lucas-visible regression:

- [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:723>)
- [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:731>)
- [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:738>)
- [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:752>)
- [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:759>)
- [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:773>)

### 3. Lucas-visible acceptance failure was specific and user-facing

The later blocked entries narrowed the actual failed acceptance:

- terminal still replayed or flowed large backlog visually
- grid still showed unacceptable live/replay behavior
- Korean IME input could swallow characters such as `가나다라`
- dashboard/terminal visual quality remained insufficient despite prior "ready" reporting

This is a QA miss, not only a product miss.

### 4. Hourly-report drift was already visible before the regression closure issue

Evidence in [data/work-ledger.json](</D:/Lucas Core v0.1/data/work-ledger.json:612>) shows a Caesar hourly report with:

- `state=needs_attention`
- `idleLikeAgents=10`
- `progress100NotDone=qa-cdp-policy`

This demonstrates drift between:

- reported executive status
- actual user-visible progress
- real QA closure

The hourly report correctly signaled concern, but later readiness language for terminal work still overstated visible completion.

## Owner And Evidence Mapping

### Reporting / ownership chain

- Caesar: supervision, escalation, hourly reporting, policy visibility
- Max: implementation owner/report owner for terminal readiness claims
- developer-1 / developer-8: current implementation lanes for terminal replay/input mitigation
- developer-4 / QA Gate: QA evidence owner
- Audit Officer: commit-boundary and acceptance-audit gate

### Evidence directories already created

- [data/system-logs/terminal-buffer-instant-render-20260602](</D:/Lucas Core v0.1/data/system-logs/terminal-buffer-instant-render-20260602>)
- [data/system-logs/terminal-tail-ux-10min-20260602](</D:/Lucas Core v0.1/data/system-logs/terminal-tail-ux-10min-20260602>)
- [data/system-logs/terminal-input-text-loss-20260602](</D:/Lucas Core v0.1/data/system-logs/terminal-input-text-loss-20260602>)
- [data/system-logs/terminal-tail-ux-1400-20260602](</D:/Lucas Core v0.1/data/system-logs/terminal-tail-ux-1400-20260602>)
- [data/system-logs/terminal-1400-ux-20260602](</D:/Lucas Core v0.1/data/system-logs/terminal-1400-ux-20260602>)
- [data/system-logs/terminal-buffer-regression-20260602](</D:/Lucas Core v0.1/data/system-logs/terminal-buffer-regression-20260602>)
- [data/system-logs/terminal-input-loss-korean-20260602](</D:/Lucas Core v0.1/data/system-logs/terminal-input-loss-korean-20260602>)
- [data/system-logs/terminal-hard-reset-20260602](</D:/Lucas Core v0.1/data/system-logs/terminal-hard-reset-20260602>)

## Evaluation Criteria For Future Terminal Reports

No future terminal report may claim `fixed`, `ready`, `PASS`, or equivalent unless all four categories below are answered separately.

### 1. Source Changed

Required:

- exact changed files
- owner of the patch
- whether the patch contains unrelated diffs
- whether Caesar-authored emergency code is still present or has been superseded

Minimum record:

- file list
- diff scope summary
- owner name

### 2. QA Evidence

Required:

- `npm --prefix apps/web test`
- `npm --prefix apps/web run build`
- CDP screenshot path
- DOM/text verification result
- console result
- `9000` PID before/after if restarted
- `9001` PID before/after, with explicit confirmation that `9001` was not restarted
- explicit `developer-7` untouched confirmation

Terminal-specific required checks:

- grid xterm count
- whether backlog replay/flow is visually absent
- whether selected/fullscreen/popout interactivity works
- Korean `가나다라` exact DOM value before submit
- longer Korean sentence exact DOM value before submit
- submitted text reaches PTY/log fully

### 3. User-Visible Result

Required:

- Lucas-visible acceptance phrased in operator terms, not implementation terms
- clear answer to "what does Lucas see now?"

Terminal-specific minimum acceptance:

- grid cards show static bounded tail/status only, no live xterm, no replay flow
- selected/fullscreen/popout path is the only interactive path
- no large animated backlog replay when opening any visible surface
- Korean IME typing no longer loses characters

If this category is not directly proven, status must remain `blocked` or `needs-verification`.

### 4. Rollback / Commit Boundary

Required:

- what files belong to the fix
- what files are unrelated dirty changes
- whether commit is blocked
- whether a rollback or supersede path exists

Commit must stay blocked when:

- source changes are mixed across unrelated lanes
- Caesar emergency diff is still unratified
- QA evidence is partial
- Lucas-visible acceptance failed once and has not been rerun

## Required Status Vocabulary

Use these separately:

- `source-changed`
- `qa-evidence-present`
- `visible-acceptance-pass`
- `commit-ready`

Do not collapse them into one word like `ready`.

## Immediate Policy Correction

For terminal issues, any future report that claims `fixed`, `done`, `ready`, or `PASS` but later fails Lucas-visible acceptance must append a follow-up note containing:

- original report owner
- exact overstated claim
- evidence path that supported the claim
- acceptance point that failed
- whether source is still kept, superseded, or rollback-requested

## Pause-With-Context Gate

Task switching, reassignment, pause, or stop is not valid unless context is handed off explicitly.

### Required handoff event

Any agent reassignment or stop must leave a handoff event containing:

- task id
- current state
- dirty files
- evidence path
- blocker
- next action
- resume criteria

Recommended shape:

```text
REPORT <task-id> state=<reported|blocked|stopped|handoff>
owner=<agent-id>
dirty_files=<path1,path2,...|none>
evidence=<file|test|screenshot|json|commit|none>
blocker=<none|...>
next=<next owner/action>
resume_criteria=<exact condition to resume>
```

### Ops-loop failure condition

The ops loop must be treated as failed for that task switch when any of the following is missing:

- no task id
- no state
- no dirty file disclosure
- no evidence pointer
- no blocker or explicit `none`
- no next action
- no resume criteria

### Audit rule

If an agent changes task, pauses work, is reassigned, or is stopped without the handoff contract above, the task must be classified as context-loss risk and not as clean progress.

### Evaluation criteria for pause-with-context

Before accepting any reassignment/stop as valid, verify all four:

1. Source changed:
   changed files are named or `none`
2. Evidence preserved:
   path or artifact is named
3. Recovery path preserved:
   next action and resume criteria are explicit
4. Ownership preserved:
   current owner and next owner/action are explicit

## Current Dirty Worktree Note

At the time of this audit, the worktree is mixed. Relevant modified files include:

- [apps/web/src/main.tsx](</D:/Lucas Core v0.1/apps/web/src/main.tsx>)
- [apps/web/src/terminalTileFooter.ts](</D:/Lucas Core v0.1/apps/web/src/terminalTileFooter.ts>)
- [apps/web/src/terminalTileFooter.test.ts](</D:/Lucas Core v0.1/apps/web/src/terminalTileFooter.test.ts>)
- [tools/ceo-ledger-board-server.cjs](</D:/Lucas Core v0.1/tools/ceo-ledger-board-server.cjs>)
- [.gitignore](</D:/Lucas Core v0.1/.gitignore>)
- [docs/portable-release-plan-20260602.md](</D:/Lucas Core v0.1/docs/portable-release-plan-20260602.md>)

This is another reason commit readiness must remain distinct from visible QA status.
