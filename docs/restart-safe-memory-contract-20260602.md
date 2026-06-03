# Restart-Safe Memory Contract

Date: 2026-06-02 KST
Owner: `developer-3`
Related items:

- `memory-system-hq`
- `portable-release-20260603`
- `decision-blocker-portal-20260602`

## Goal

Define the restart-safe contract Max can use for memory recovery after reboot:

- what durable files and API data are loaded
- what stays local or private
- how blockers and decisions are recovered
- what implementation boundary is safe for the next change set

This is a proposal and contract artifact only. No commit, no 9001 restart, no developer-7 involvement.

## Current Recovery Sources

### Durable Files To Load After Reboot

Load these first because they are the branch source of truth for restart recovery:

1. `data/branch-boot-context.md`
2. `docs/command-chain-policy-20260531.md`
3. `data/ceo-command-ledger.json`
4. `data/work-ledger.json`
5. `data/agent-boot-prompts.json`
6. `data/branch-decisions.jsonl`
7. `data/branch-session-restart-plan.json`
8. `data/branch-org.json`
9. `data/memory-ledger.jsonl` when present

### Runtime API Data To Load After 9001 Is Available

These are restart readers, not mandatory writers:

- `GET /api/memory/recover/:agent_id`
- `GET /api/memory`
- `GET /api/work-ledger`

Current API recovery already returns:

- personal memories
- shared/team memories
- active work-ledger tasks
- recent work-ledger events

Source:

- [main.rs](D:\Lucas Core v0.1\apps\api\src\main.rs:1875)

## Durable Vs Local

### Durable And Portable

These should survive reboot and may be copied to a second PC when portable context is intended:

- `data/work-ledger.json`
- `data/ceo-command-ledger.json`
- `data/memory-ledger.jsonl`
- `data/branch-boot-context.md`
- `data/agent-boot-prompts.json`
- `data/branch-decisions.jsonl`
- `data/branch-session-restart-plan.json`
- `data/branch-org.json`

### Durable But Optional To Copy

- `data/peer-bridge.jsonl`
  - Copy only if HQ/branch message continuity matters.
- selected `data/system-logs/` artifacts
  - Copy only when referenced by active ledger items, blocker reports, decision evidence, or release QA.

### Local Or Private

These are not restart memory and should stay local unless an explicit audit bundle is requested:

- `data/terminal-logs/`
- `tmp-chrome-cdp*/`
- `target*/`
- `*.pid`
- `*.log`
- `*.err.log`
- `*.out.log`
- machine-local secret files or `.env`
- unreviewed screenshots and QA scratch output

## Recovery Semantics

### Minimum Recovery Contract

If `data/memory-ledger.jsonl` is absent, recovery still proceeds from:

- policy/context files
- command ledger
- work ledger
- branch decisions

This is lower-context recovery but still valid.

### Full Recovery Contract

If memory is present, recovery merges:

1. personal memory
2. shared/team memory
3. active tasks
4. recent events
5. policy/role boot instructions

This matches the first-cut HQ-style memory direction already documented in:

- [hq-memory-system-benchmark-20260601.md](D:\Lucas Core v0.1\docs\hq-memory-system-benchmark-20260601.md:1)

## Blocker And Decision Recovery

### Current Durable Sources

Right now blockers and decisions are recovered from these places:

- `data/work-ledger.json`
  - event kinds such as `blocked`, `decision`, `risk`, `risk-check`, `handoff`, `qa-fail`, `dev-request`
- `data/ceo-command-ledger.json`
  - current owner, directive, next action, evidence requirements
- `data/branch-decisions.jsonl`
  - branch-level command-mode and staffing decisions
- `data/memory-ledger.jsonl`
  - operator memory and future auto-memory summaries when present

### Current Gap

There is no single durable “decision window” yet that cleanly separates:

- open blockers
- decisions needed from Lucas
- recommended choice
- linked evidence
- next owner/action

That gap is exactly why `decision-blocker-portal-20260602` exists.

### Contract For Portal Recovery

Until a dedicated portal implementation exists, blocker and decision recovery should use this order:

1. open `data/work-ledger.json`
2. filter latest events for:
   - `blocked`
   - `decision`
   - `risk`
   - `risk-check`
   - `qa-fail`
   - `handoff`
   - `dev-request`
3. cross-check active directives in `data/ceo-command-ledger.json`
4. load `GET /api/memory/recover/:agent_id` for Caesar and Max
5. open selected evidence paths from `data/system-logs/` when referenced

## Durable Schema Contract

### Work Ledger

Authority file:

- `data/work-ledger.json`

Contract:

- authoritative task and event history
- must remain readable without 9001
- should not be rewritten into a machine-specific format

### Memory Ledger

Authority file:

- `data/memory-ledger.jsonl`

Contract:

- append-only JSONL
- durable across reboot
- optional but recommended for second-PC portability
- preserve ids and `source_id` values during copy

### Important Rule

`work-ledger` is authoritative. `memory-ledger` is a derived recovery index.

If future auto-memory write fails, ledger success should still stand. Memory can be replayed or backfilled later.

## Proposed Implementation Boundary

### Safe Next Implementation Under Max

1. Keep this contract as doc-only guidance.
2. Keep manual memory API and recovery stable.
3. If implementation proceeds, make the next code change one of these small boundaries only:
   - boundary A: auto-memory from selected work-ledger events
   - boundary B: recovered-context read panel
   - boundary C: decision-blocker portal read model

Do not combine A, B, and C in one patch.

### Recommended First Boundary

Boundary C should start as a read model, not a new source of truth.

Meaning:

- read from `work-ledger`, `ceo-command-ledger`, and `memory`
- present blockers/decisions in a focused view
- do not create a separate authoritative storage format first

That keeps restart safety simple and avoids another state divergence problem.

### Explicit Non-Goals For The Next Cut

- no DB migration
- no vector/embedding memory
- no terminal-log-based memory import
- no broad runtime restart
- no developer-7 lane crossover

## Max Handoff Summary

Max can treat the restart-safe memory contract as:

- durable sources:
  - `work-ledger`
  - `ceo-command-ledger`
  - policy/context files
  - branch decisions
  - optional but preferred `memory-ledger`
- local/private exclusions:
  - terminal logs
  - Chrome temp profiles
  - build/runtime artifacts
  - secrets
- blocker/decision recovery:
  - latest work-ledger blocker/decision/risk events
  - cross-check with CEO ledger directives
  - enrich with memory recovery and linked evidence
- safe implementation boundary:
  - next patch should be one narrow read-model or auto-memory step, not a combined memory/portal/UI rewrite

## Evidence

- [work-ledger.json](D:\Lucas Core v0.1\data\work-ledger.json:191)
- [work-ledger.json](D:\Lucas Core v0.1\data\work-ledger.json:268)
- [work-ledger.json](D:\Lucas Core v0.1\data\work-ledger.json:603)
- [portable-memory-ledger-migration-map-20260602.md](D:\Lucas Core v0.1\docs\portable-memory-ledger-migration-map-20260602.md:1)
- [hq-memory-system-benchmark-20260601.md](D:\Lucas Core v0.1\docs\hq-memory-system-benchmark-20260601.md:1)
- [branch-boot-context.md](D:\Lucas Core v0.1\data\branch-boot-context.md:28)
- [main.rs](D:\Lucas Core v0.1\apps\api\src\main.rs:603)
- [main.rs](D:\Lucas Core v0.1\apps\api\src\main.rs:605)
- [main.rs](D:\Lucas Core v0.1\apps\api\src\main.rs:607)
- [main.rs](D:\Lucas Core v0.1\apps\api\src\main.rs:1875)
