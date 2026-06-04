# LCC Storage Optimization Discovery - 2026-06-04

## Summary

- task_id: `lcc-storage-optimization-discovery-20260604`
- current_state: `in_progress`
- permission: `inspect`
- owner: `codex`
- command_mode: `lucas-direct`
- ledger_reference: `disabled`

## Objective

Learn the LCC system structure well enough to identify safe, high-value storage optimization targets for follow-up work.

## Lucas Intent

Act in place of the infrastructure owner for storage optimization, but start by understanding what LCC is, how it is organized, and where disk usage is concentrated before proposing any cleanup or reduction work.

## Current Symptom / Evidence

- Repository contains many build outputs, temporary browser/CDP directories, logs, screenshots, and multiple `target*` trees.
- Ledger reference is suspended by `data/ledger-reference-disabled.json`, so discovery must avoid work-ledger-driven scope.
- Current user instruction provides no `permission=edit`, so this task is inspect-only.

## Why This Matters

Storage work is risky when runtime ownership, protected contracts, and evidence retention rules are not understood first. LCC appears to mix product source, operational evidence, and transient QA artifacts in one tree, so classification is required before any deletion or compaction plan.

## Known Wrong Interpretations

- Do not treat "optimize capacity" as permission to delete files immediately.
- Do not edit product source as part of this discovery pass.
- Do not read or report from suspended ledger sources.
- Do not assume all large directories are disposable; some may be live runtime lanes or required evidence.

## Forbidden Actions

- No source edits under `apps/` during this task.
- No deletion, truncation, or movement of files.
- No restart of `9001`.
- No reads from `data/work-ledger.json`, `data/ceo-command-ledger.json`, `data/execution-board.json`, or 9100 ledger board while ledger suspension is active.

## Source Root / Files

- Source root: `D:\Lucas Core v0.1`
- Startup/policy context:
  - `AGENTS.md`
  - `data/branch-boot-context.md`
  - `docs/command-chain-policy-20260531.md`
  - `docs/agent-state-management-policy-20260531.md`
  - `data/agent-boot-prompts.json`
  - `docs/development-architecture-policy-20260603.md`
  - `docs/developer-source-change-conventions-20260603.md`
  - `docs/lucas-initiative-operating-principles-20260603.md`
- Product/context docs:
  - `README.md`
  - `docs/architecture-roadmap.md`

## Protected Contracts

- Policy ACK boot flow
- Terminal newline/submit injection
- Terminal rendering/replay and scrollback retention
- Commit/QA evidence gates

This discovery task must avoid changing any protected contract.

## Implementation Direction

1. Read mandatory policy/context files and honor ledger suspension.
2. Read high-level LCC architecture/product docs.
3. Map major directory classes: source, build outputs, runtime targets, temp artifacts, logs, evidence, dependencies.
4. Measure large directories/files.
5. Produce a safe optimization shortlist divided into likely-safe cleanup candidates, review-required artifacts, and protected/live-runtime areas.

## Understanding Check

`UNDERSTANDING_CHECK lcc-storage-optimization-discovery-20260604 owner=codex objective=Understand LCC first, then identify storage optimization candidates without changing source or deleting anything lucas_intent=Stand in for infra on capacity work, but begin with system learning and evidence-based classification forbidden=no source edits; no file deletion; no ledger-reference reads; no 9001 restart files=AGENTS.md,data/branch-boot-context.md,docs/command-chain-policy-20260531.md,docs/agent-state-management-policy-20260531.md,data/agent-boot-prompts.json,docs/development-architecture-policy-20260603.md,docs/developer-source-change-conventions-20260603.md,docs/lucas-initiative-operating-principles-20260603.md,README.md,docs/architecture-roadmap.md protected=policy-ack,terminal-submit,terminal-render,qa-gates acceptance=Produce LCC architecture summary plus disk-usage classification and optimization candidates questions=none`

## Acceptance Evidence

- Policy ACK reported with ledger suspension note.
- LCC architecture summary from repo docs.
- Disk usage summary for major directories and large files.
- Risk-classified optimization candidates with rationale.

## Live Progress

- 2026-06-04: Mandatory policy/context files read.
- 2026-06-04: Ledger suspension detected and honored.
- 2026-06-04: Initial repo structure and core docs under review.
- 2026-06-04: LCC identified as a lightweight local multi-agent control plane with Rust API in `apps/api` and React/Vite UI in `apps/web`.
- 2026-06-04: Repository-level size scan completed.
- 2026-06-04: Largest storage buckets identified:
  - `data` about `15181.1 MB`
  - `target-9001` about `1522.9 MB`
  - `tmp-chrome-cdp-9000` about `1167.9 MB`
  - `target-9104` about `976.1 MB`
  - `target-9002` about `944.9 MB`
  - `target-os-agent-runner` about `783.8 MB`
  - `tmp` about `781.2 MB`
- 2026-06-04: `data` breakdown identified:
  - `data/terminal-logs` about `11883.8 MB`
  - `data/system-logs` about `2190.5 MB`
  - `data/os-agents` about `758.5 MB`
  - `data/session-handoff-20260531_130436` about `282.6 MB`
- 2026-06-04: `apps/api` source tree itself is small, but embedded build output `apps/api/target-9001` is about `532.0 MB`.
- 2026-06-04: `data/system-logs/terminal-9000-cdp` is mostly screenshots: about `3334` `.png` files totaling about `1086.7 MB`.
- 2026-06-04: `data/terminal-logs/archive` alone holds about `11296.5 MB`; the biggest rotated logs are multi-hundred-MB to multi-GB artifacts.

## Open Decisions / Blockers

- No blocker for inspect-only discovery.
- Any actual cleanup or source-level storage optimization will require an explicit follow-up task with `permission=edit`.

## Discovery Outcome

### LCC Overview

- LCC is a local/on-prem multi-agent control plane, not just a single app build.
- `apps/api` is the Rust Axum control plane for session lifecycle, terminal streaming, and local JSON persistence.
- `apps/web` is the React/Vite operator UI for terminal fleet control and canvas workflows.
- The repository also stores operational evidence, terminal histories, CDP QA screenshots, cloned build targets, and agent workspaces in the same tree.

### Storage Classification

- Likely live/runtime-sensitive:
  - `target-9001`
  - `target-9002`
  - active `data/terminal-logs/*.ansi.log`
  - active `workspaces/*`
- Likely rebuildable:
  - `target`
  - `target-9104`
  - `target-9015`
  - `target-9092`
  - `target-commit-check`
  - most temporary `tmp-chrome-cdp-*`
  - `tmp`
- Review-required evidence:
  - `data/system-logs/*`
  - `data/session-handoff-*`
  - archived `data/terminal-logs/archive/*`
  - screenshots and standalone QA PNGs in repo root
- Mixed/runtime tooling:
  - `data/os-agents/api-restart-target`
  - `target-os-agent-runner`

### Initial Optimization Candidates

1. Introduce retention/archival policy for `data/terminal-logs/archive`, the single largest bucket.
2. Prune or externalize CDP screenshot evidence under `data/system-logs/terminal-9000-cdp`.
3. Consolidate duplicated Rust build directories and separate live targets from disposable verification targets.
4. Classify `tmp-chrome-cdp-*` directories by recency and owner, then remove stale QA browser profiles.
5. Review whether `workspaces/developer-2` and `workspaces/developer-4` contain retained clones or generated artifacts that should live outside the product repo.

### Live Runtime Check

- Port `9001` is currently served by `D:\Lucas Core v0.1\target-9001\debug\lcc-core-api.exe`.
- Port `9000`, `9002`, and `9100` are currently served by `node.exe`.
- Ports `9003`, `9004`, and `9104` were not listening during inspection.
- Result: `target-9001` is live and must not be deleted in cleanup work.

### Caesar / Areum Contact Result

- A direct `ceo` / Caesar session was not present on the `9002` session list during inspection.
- `chief-min` existed only as a non-interactive log-backed attached OS session, so direct questioning was not available.
- `areum` was interactive and received an inspect-only cleanup triage prompt.
- At inspection close, `areum` had not yet returned the requested two-line storage triage result; the tail showed it still gathering local policy/context.

### Safe Delete Triage

#### Immediate Delete Candidates

- `target-9104` about `976.1 MB`
- `target` about `227.0 MB`
- `target-commit-check` about `211.8 MB`
- `target-9015` about `73.2 MB`
- `target-9092` about `71.8 MB`
- root QA screenshots and one-off root logs such as `lcc-9000-*.png`, `lcc-terminal-*.png`, `p0-overlay-audit-*.png`, and small `*.log` / `*.json` debug leftovers

Reason:

- These are rebuildable verification targets or one-off evidence files.
- No listening port was backed by these targets during inspection.
- They are not current active workspace or protected live runtime paths.

#### Delete After Process Check / Operator Approval

- all `tmp-chrome-cdp-*` directories, `49` directories totaling several GB
- `data/system-logs/terminal-9000-cdp` about `1171.9 MB`, mostly `3651` PNG/JSON evidence files
- `data/system-logs/dev8-chatgpt-web-operator-20260602` about `934.4 MB`
- `target-os-agent-runner` about `783.8 MB`
- `data/os-agents/api-restart-target` about `758.5 MB`
- `tmp/memory-qa` about `781.2 MB`

Reason:

- These look rebuildable or temporary, but they are larger operational/QA artifacts and may be referenced by recent verification work.
- They should be removed only after confirming no current browser/debug helper is using them and no operator still needs the evidence.

#### Review Retention Before Delete

- `data/terminal-logs/archive` about `11032.0 MB` across `526` rotated files
- biggest owners:
  - `ceo` about `3237.4 MB`
  - `dev-lead` about `2635.2 MB`
  - `chief-min` about `1278.9 MB`
  - `developer-4` about `644.4 MB`

Reason:

- This is the single biggest reclaim path, but the files are named as audit/runtime history rather than pure scratch output.
- Retention reduction is high value, but full deletion should follow an explicit evidence-retention decision, not ad hoc cleanup.

#### Do Not Delete

- `target-9001`
- active `workspaces/*`
- active `data/terminal-logs/*.ansi.log`
- policy/docs/task-report files
- any live `9000` / `9001` / `9002` / `9100` runtime-owned path
