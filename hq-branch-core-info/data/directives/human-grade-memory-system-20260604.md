# Human-Grade Memory System - 2026-06-04

## State

- task_id: `human-grade-memory-system-20260604`
- mode: `ledger-driven implementation`
- owner_chain: Lucas -> Caesar -> Max -> assigned developers -> Max -> Areum/Lux review -> Caesar -> Lucas
- source_root: `D:\Lucas Core v0.1`
- branch: `feature/human-grade-memory-20260604`
- status: `task-context`
- permission: `edit` for Max-assigned developers after understanding approval
- current terminal safety baseline: `5c937fd Stop terminal views resizing source PTY`

## Lucas Intent

Lucas wants LCC to have a memory system stronger than a human operator's ordinary memory, not a thin log dump.

The immediate pain is restart/context loss: after Caesar or agents restart, they should recover the day's work, standing priorities, recent decisions, blockers, and human-style daily memory without depending on chat scrollback or terminal preview fragments.

The target behavior is:

- one primary daily memory surface that reads like a person's working memory for the day
- durable append-only structured memory for API recovery and future search/RAG
- restart recovery that loads memory automatically and tells the agent what it was doing, why, next action, blockers, and evidence
- manager-readable reports that double as operational memory
- no terminal-log scraping as the primary memory source

## Existing Evidence And HQ Benchmark

Known implemented local baseline:

- `apps/api/src/main.rs`
  - `LCC_MEMORY_PATH`, default `data/memory-ledger.jsonl`
  - `GET /api/memory`
  - `POST /api/memory`
  - `GET /api/memory/recover/:agent_id`
- `docs/hq-memory-system-benchmark-20260601.md`
  - HQ has richer DB/vector/auto-memory/compaction/review patterns.
  - LCC first cut intentionally avoided DB/vector migration.
  - Missing acceptance includes UTF-8 QA, recovery samples, invalid input rejection, restart-risk notes.
- `docs/restart-safe-memory-contract-20260602.md`
  - recovery sources and durable/local boundaries are already defined.
  - `work-ledger` is authoritative; `memory-ledger` is a derived recovery index.
- `data/memory-system-hq-web-contract-dev2.md`
  - web recovered-context panel contract exists, but some Korean labels in that file are mojibake and must not be copied blindly.
- `data/memory-ledger.jsonl`
  - currently has only a tiny QA baseline and has mojibake risk in PowerShell output; UTF-8 preservation must be tested directly.

## Memory Layer Model

This task uses four different memory/report layers. They must not be confused.

1. `Directive packet`
   - path: `data/directives/human-grade-memory-system-20260604.md`
   - purpose: complete execution context for this task
   - contains: Lucas intent, scope, non-goals, owner chain, acceptance criteria, live task progress, review returns
   - not for: every small daily observation after this task closes

2. `Daily memory`
   - path: `data/daily-memory/2026-06-04.md`
   - purpose: the day's human-readable working memory
   - contains: current priorities, decisions, blockers, owner map, restart instructions, "must not repeat" lessons
   - not for: raw test output, long event bodies, or every heartbeat

3. `Structured memory`
   - path/API: `data/memory-ledger.jsonl`, `GET/POST /api/memory`, `GET /api/memory/recover/:agent_id`
   - purpose: durable append-only recovery index for agent-specific/team/global memory
   - contains: high-value accepted decisions, blockers, handoffs, restart checkpoints, QA/commit gate memories
   - not for: noisy terminal fragments, spinner output, or unreviewed speculation

4. `Final task report`
   - path: `data/task-reports/human-grade-memory-system-20260604.md`
   - purpose: final evidence report and closure packet
   - contains: implemented changes, tests, API evidence, restart drill result, Areum/Lux signoff, residual risks, rollback note
   - not for: replacing the daily memory or directive packet

## Write Placement Rules

- Write to the directive packet when the task scope, ownership, acceptance, review return, or implementation plan changes.
- Write to daily memory when the fact matters to Caesar/Max after a restart today.
- Write to structured memory when the fact should be queryable/recoverable by agent id or shared scope after today.
- Write to the final task report when evidence proves a check, implementation step, QA result, or closure decision.
- If the same decision appears in multiple layers, use one sentence in daily memory and link to the directive/report for details.
- Do not duplicate raw logs into daily memory. Store raw evidence under `data/system-logs/...` and link it.

## Restart Read Order By Role

For Caesar:

1. `AGENTS.md` and required policy files
2. `data/daily-memory/2026-06-04.md`
3. this directive packet
4. `GET /api/memory/recover/ceo`
5. final task report if present
6. live session state

For Max:

1. `AGENTS.md` and required policy files
2. `data/daily-memory/2026-06-04.md`
3. this directive packet
4. `GET /api/memory/recover/dev-lead`
5. assigned developer reports and live session state

For Areum:

1. policy files
2. this directive packet
3. daily memory
4. final task report if present
5. check whether hierarchy/dedupe/owner chain remain clear

For Lux:

1. policy files
2. daily memory
3. this directive packet
4. final task report and evidence paths
5. reject if a restarted human supervisor would still be confused

For developers:

1. assigned task card
2. this directive packet
3. source files named by Max
4. evidence/report path
5. do not infer from chat scrollback

## Problem To Solve Now

The current local memory system exists but is not yet a complete operating memory:

1. It is not populated enough to recover Caesar/Max's day.
2. It lacks a primary daily human-readable memory file.
3. It lacks a disciplined daily summarization and checkpoint convention.
4. It lacks an obvious 9100/operator-facing memory status.
5. It has no proven auto-memory writer from selected operating events.
6. It has no end-to-end restart drill proving that an agent can recover from memory without chat scrollback.

## Non-Negotiable Principles

- Do not depend on terminal scrollback as the source of truth.
- Do not scrape all terminal output into memory.
- Do not mix terminal rendering fixes with memory-system implementation.
- Do not rewrite all ledger architecture in one patch.
- Preserve `work-ledger` as authoritative operational state.
- Treat `memory-ledger` as derived durable recovery memory.
- Keep source changes scoped and reversible.
- Keep Korean UTF-8 intact.
- Every implementation step needs evidence and a rollback note.

## Proposed Implementation Boundaries

Phase 1 - inspect and design confirmation:

- Max assigns developers to inspect current API, docs, data, and HQ benchmark.
- Developers must restate understanding before editing.
- Areum checks ledger/memory information architecture.
- Lux checks human-audit gaps: what would a restarted Caesar still fail to know?

Phase 2 - minimal human-grade memory baseline:

- Add or formalize a primary daily memory file path, proposed:
  - `data/daily-memory/YYYY-MM-DD.md`
- The daily file should be human-readable and include:
  - day objective
  - current active lanes
  - decisions made
  - blockers
  - who owns what
  - latest evidence
  - next action
  - restart recovery notes
  - Lucas preferences/instructions discovered that day
- Add a small helper or API/tooling path only if needed to append/checkpoint the daily memory safely.

Phase 3 - structured memory integration:

- Add selected memory writes for high-value events only:
  - Lucas direct instruction
  - accepted decision
  - blocker
  - task handoff
  - completed QA/commit gate
  - restart recovery checkpoint
- Avoid writing noisy heartbeat/spinner/terminal fragments.

Phase 4 - recovery proof:

- Call `GET /api/memory/recover/ceo` and `GET /api/memory/recover/dev-lead`.
- Confirm the daily memory file is enough for Caesar/Max to answer:
  - what was I doing?
  - why was I doing it?
  - what should happen next?
  - what must not be repeated?
  - what evidence backs this?
- Record a restart drill report under `data/task-reports/`.

## Suggested Developer Split

- Max:
  - own decomposition, understanding approval, integration, and commit gate.
- developer-8:
  - inspect memory API/docs and propose minimal source boundary.
- developer-1:
  - implement source change only after Max approval if a helper/API/tool is needed.
- developer-4:
  - QA owner: API smoke, UTF-8, invalid input, recovery sample, restart-drill evidence.
- Areum:
  - ledger/daily-memory information architecture and dedupe review.
- Lux:
  - hard audit: reject if a human restarted from the memory file would still be confused.

## Required Understanding Check

Before edits, every assignee must report:

```text
ACK human-grade-memory-system-20260604 state=acknowledged owner=<session-id>
UNDERSTANDING human-grade-memory-system-20260604 objective=<...> lucas_intent=<...> forbidden=<...> files=<...> protected=<...> checks=<...> questions=<none|...>
```

Max must approve or correct the understanding before any `permission=edit` work begins.

## Acceptance Criteria

- A daily memory file exists for `2026-06-04` with enough context for restart recovery.
- Structured memory API still passes baseline checks.
- Korean UTF-8 round trip is proven with raw file and API output evidence.
- Recovery endpoint returns useful context for `ceo` and `dev-lead`.
- A restart drill report proves what Caesar/Max would load first.
- Areum signs off on information architecture or lists concrete fixes.
- Lux signs off from human audit perspective or returns the task.
- Source changes, if any, are scoped and tested.
- No terminal rendering/replay files are touched for this task.

## Planned Evidence

- `data/daily-memory/2026-06-04.md`
- `data/task-reports/human-grade-memory-system-20260604.md`
- API evidence files under `data/system-logs/human-grade-memory-system-20260604/`
  - `memory-recover-ceo.json`
  - `memory-recover-dev-lead.json`
  - `memory-post-utf8.json`
  - `memory-get-utf8.json`
  - `memory-invalid-input.json`
- test command output for API/web/tooling changes if any
- git diff summary before commit

## Daily Memory Closure Rule

Daily memory is considered restart-safe for this task only when it contains:

- current branch and stable terminal baseline
- active owner chain and current owner
- latest accepted decision
- latest blocker or `blocker=none`
- next action for Caesar and Max
- evidence links for API recovery samples once produced
- explicit "must not repeat" notes for the failure mode seen today

Until those are present, Areum may return this task even if source code works.

## Current Caesar Notes

- 2026-06-04 KST: Lucas ordered memory system first after terminal rollback.
- 2026-06-04 KST: Lucas explicitly wants this run through ledger discipline.
- 2026-06-04 KST: Lucas will work with the Heungkuk manual TF separately.
- Current branch was created from terminal stable baseline after rollback.
- 2026-06-04 15:30 KST: Caesar dispatched task cards to `dev-lead`, `areum`, `audit-officer` as Lux, `manual-tf-lead`, `manual-tf-1`, and `manual-tf-2` through 9001 prompt-text/prompt-submit.
- 2026-06-04 15:31 KST: 9001 API tail confirms dispatch attempts and working state for Max/Areum/Lux, but latest visible semantic lines still include prior OS-agent task context. Caesar must re-check for ACK before treating this as understood.
- 2026-06-04 15:32 KST: Caesar found the first WS prompt attempt used the wrong payload field (`text` instead of `prompt`/REST `data`). REST `prompt-text` + `prompt-submit` succeeded with ACKs for all six target sessions. This is a command-chain lesson: transport ACK is not semantic ACK.
- 2026-06-04 15:34 KST: Areum returned fixes. Caesar accepted the return and expanded layer model, write placement rules, restart read order, evidence paths, and daily-memory closure rule.

## Live Progress Log

| Time KST | Owner | State | Evidence | Next |
| --- | --- | --- | --- | --- |
| 15:30 | Caesar | task packet created | this file | dispatch Max/Areum/Lux |
| 15:30 | Caesar | daily memory initialized | `data/daily-memory/2026-06-04.md` | use as restart memory seed |
| 15:31 | Caesar | task cards sent | 9001 WebSocket send result `ok=true` for 6 sessions | wait for visible ACK/understanding |
| 15:31 | Max/Areum/Lux | pending verification | terminal tail state=`working`, sentinel visible | re-read tails for ACK |
| 15:32 | Caesar | dispatch correction | REST `prompt-text`/`prompt-submit` ACKs for 6 sessions | semantic ACK check |
| 15:34 | Areum | return_fixes | 9001 tail: missing layer model/dedupe/restart/evidence rules | Caesar patched directive |
