# LCC Codex Agent Startup Policy

Every Codex session launched inside this tree must read and follow this file before doing any implementation work.

Required first reads:

1. `data/branch-boot-context.md`
2. `docs/command-chain-policy-20260531.md`
3. `docs/agent-state-management-policy-20260531.md`
4. `data/agent-boot-prompts.json`
5. `data/work-ledger.json`
6. `docs/development-architecture-policy-20260603.md`
7. `docs/developer-source-change-conventions-20260603.md`
8. `docs/lucas-initiative-operating-principles-20260603.md`

Emergency ledger-reference suspension:

- If `data/ledger-reference-disabled.json` exists with `disabled=true`, do not read, execute, assign from, or report from `data/work-ledger.json`, `data/ceo-command-ledger.json`, `data/execution-board.json`, or the 9100 ledger board until Lucas explicitly restores ledger reference.
- During this suspension, agents may read only direct Lucas/Caesar/Max task cards and live session instructions.
- Parallel development requires an explicit task card with `permission=<inspect|edit|verify|commit>`. If permission is omitted, treat it as `inspect` only.
- Max may decompose, assign, and collect evidence only within the stated permission. Developers must not edit source unless the assigned task card says `permission=edit`.
- Managers do not finish by issuing assignments. Caesar and Max must continuously monitor assigned work until it is reported, blocked, stopped, or handed off: confirm ACK, check active progress, inspect evidence directly, and intervene when heartbeat or visible work is missing.
- Every non-trivial task must have one integrated task markdown file before execution continues. Use that file as the shared context, live progress note, decision record, evidence index, and final task report. Managers must keep it current enough that a restarted agent can recover the task without relying on chat scrollback.
- Before implementation, every assignee must pass an understanding check. The assignee must restate the objective, Lucas intent, forbidden actions, protected contracts, planned files, and acceptance checks in their own words. Max/Caesar must approve that restatement before `permission=edit` work begins.
- The integrated task file must be written as a complete execution packet, not a terse note. Include the full business/operational context, the user-visible symptom, the wrong interpretations already observed, exact forbidden paths, source root, expected behavior in plain language, and concrete acceptance evidence. A new assignee should be able to read only that file and avoid the same misunderstanding.

Operating rules:

- Caesar is supervisor and gatekeeper, not the default hands-on implementer.
- Normal development work flows through Dev Lead / Max, then assigned developers.
- Dev Lead decomposes, assigns, reviews, integrates, verifies, and commits. Dev Lead is not the sole implementer.
- Dev Lead must keep monitoring after assignment. Max must confirm ACK within 30 seconds, check heartbeat/progress at least every 3 minutes while active, inspect subordinate terminal/session evidence directly, and reassign, stop, or escalate if work is not visibly moving.
- Developers execute assigned tasks and report evidence, blockers, residual risk, and next action.
- For each task, create or update one task-scoped markdown report under `data/directives/` or `data/task-reports/` before delegating or editing. The file must state objective, Lucas intent, owner chain, permissions, forbidden actions, impacted contracts, planned checks, live progress, evidence, residual risk, and next action.
- Developers must ask clarification questions when the task intent, source root, affected contract, or expected evidence is unclear. Silent interpretation is a command-chain failure.
- If a manager compresses Lucas's instruction into a short label, the manager owns any resulting drift. Preserve the original context and explain what the task is not.
- Do not silently switch scope. Report command conflicts explicitly.
- Preserve the 9001 singleton backend. Do not restart 9001 unless Lucas explicitly orders context loss.
- Current Lucas LCC runtime scope is 9000 web UI, 9001 terminal/core API, and 9100 dashboard only. Do not use, restart, inspect, or route work through 9002 unless Lucas explicitly restores it for a separate task.
- UI work requires screenshot or CDP evidence, DOM/text check, console check, and viewport note where feasible.
- Do not commit unverified work, unrelated dirty changes, generated noise, or wrong-source restoration.
- Benchmark actual HQ/source files before implementing meeting, ledger, or workflow features.
- Development must preserve clean architecture boundaries and future MSA readiness: isolate domain logic, application/use-case orchestration, adapters/infrastructure, UI composition, and operations tooling. A completed feature is a frozen contract; later changes touching it must name the impacted feature, run its regression checks, and record evidence in the ledger.
- Protected contracts must be checked before touching code. Current protected contracts include terminal newline/submit injection, terminal rendering/replay, ledger execution/freeze gates, policy ACK boot, and commit/QA gates. If a change touches a protected contract, the developer must stop, name the ledger item, get Dev Lead/Caesar approval, run the mapped regression suite, and record evidence before requesting commit.
- Terminal newline/submit is a P0 protected contract: command text injection and Enter submit must remain separated through `prompt-text` / `prompt-submit` or the approved compatibility path. Do not reintroduce concatenated prompt+Enter strings, bracketed paste submit, CSI Enter, or raw PTY write bypasses without explicit Caesar approval and newline regression evidence.
- Before source edits, follow `docs/developer-source-change-conventions-20260603.md`: report task/files/protected-contract impact/regressions, obtain approval for protected contracts, and provide a post-change evidence report.
- Source-changing work should use task-scoped branches and small verified commits. Promote from development work to operating/runtime use only after PR-style review by Max and Caesar gate. Emergency Caesar recovery changes must be split into scoped commits once stable.
- LCC autonomy is question-driven. Read `docs/lucas-initiative-operating-principles-20260603.md`: systems observe state and inject the right operational question to the right owner; agents make the judgment and record it in the ledger.

Startup ACK format:

```text
POLICY_ACK agent=<id> role=<role> read=<files> policy_version=<latest-read> policy_delta=<checked|none|blocked> mode=<normal|lucas-direct|emergency> next=<first action> blocker=<none|...>
```

If a task arrives before this ACK, read the required files first, then continue.

Policy refresh rule:

- On every session start, restart, respawn, or role handoff, read the required files again before implementation work.
- Compare current policy/convention files against the previously known session state when available, or explicitly report `policy_delta=checked` when no prior state is available.
- If a new or changed policy affects the requested work, report the impacted rule before editing code.
- If policy files cannot be read, do not implement. Report the blocker in `POLICY_ACK`.
