# Portable Memory And Ledger Migration Map

Date: 2026-06-02 KST
Item: `portable-release-20260603`
Owner: `developer-3`

## Goal

Define which durable data files must move to a second Windows PC for portable LCC Core release, which files stay local/private, and how recovered context is bootstrapped without relying on live terminal scrollback from the original machine.

## Source Constraints

- `apps/api/src/main.rs` defaults:
  - `LCC_WORK_LEDGER_PATH` -> `data/work-ledger.json`
  - `LCC_MEMORY_PATH` -> `data/memory-ledger.jsonl`
  - `LCC_PEER_STORAGE_PATH` -> `data/peer-bridge.jsonl`
- Restart recovery contract uses:
  - personal memories
  - shared memories
  - active work-ledger tasks
  - recent work-ledger events
- Branch boot policy requires recovery from:
  - `data/ceo-command-ledger.json`
  - `data/work-ledger.json`
  - `data/branch-decisions.jsonl`
  - `data/system-logs/` evidence
  - live `/api/sessions` only when available on the current machine

## Copy To Second PC

These files are durable state and should be copied or committed if they are intended to define portable operator context.

### Required

- `data/work-ledger.json`
  - Source of active tasks and event history.
  - Required by `/api/work-ledger` and recovery context.
- `data/ceo-command-ledger.json`
  - Required directive board for Caesar/Max startup.
  - Needed to reconstruct active priorities and owners.
- `data/branch-boot-context.md`
  - Startup policy and restart-memory rules.
- `data/agent-boot-prompts.json`
  - Role-specific boot prompts.

### Strongly Recommended

- `data/memory-ledger.jsonl`
  - Durable memory baseline for `/api/memory` and `/api/memory/recover/:agent_id`.
  - Copy when the goal is to preserve learned context across PCs.
- `data/branch-decisions.jsonl`
  - Required for reconstructing command-mode and staffing decisions after restart.
- `data/branch-session-restart-plan.json`
  - Useful for expected roster and restart order.
- `data/branch-org.json`
  - Useful for team structure and role recovery.

### Optional, Only If Intentionally Sharing Context

- `data/peer-bridge.jsonl`
  - Cross-peer message history.
  - Copy only if branch/HQ message continuity matters on the second PC.
- `data/system-logs/`
  - Copy only selected evidence artifacts that are still referenced by ledgers or release QA.
  - Do not bulk-copy the whole directory unless packaging an audit bundle.

## Keep Local Or Private

These should not be part of the portable release package by default.

- `data/terminal-logs/`
  - Large, machine-local, and not the source of truth.
  - Policy says terminal scrollback is not restart memory.
- `tmp-chrome-cdp*/`
  - Machine-local QA runtime state.
- `target*/`
  - Build outputs, not durable context.
- `*.log`, `*.err.log`, `*.out.log`, `*.pid`
  - Runtime artifacts only.
- `.env` or any machine-local secret file
  - Must be recreated locally, not copied in release package.
- `data/peer-bridge-inbound.jsonl`
  - Local inbound transport history unless explicitly needed for audit.
- Large screenshot caches not linked from active ledger items
  - Keep only referenced release evidence if needed.

## Privacy And Scope Rules

- Copy `memory-ledger.jsonl` only after reviewing for secrets, local usernames, tokens, absolute private paths, or machine-specific notes.
- Team/global memories are portable by default.
- Personal memories are portable only when they describe branch work context rather than one operator's private local setup.
- If future auto-memory is added from work-ledger events, keep `source` and `source_id` fields intact during copy so dedupe still works on the second PC.

## Bootstrap On Second PC

### Minimum Portable Bootstrap

1. Clone repo.
2. Restore required durable files into `data/`.
3. Set local environment for API/web start.
4. Start 9001 and 9000 from scripts without copying old runtime artifacts.
5. Verify:
   - `GET /api/health`
   - `GET /api/work-ledger`
   - `GET /api/memory`
   - `GET /api/memory/recover/<agent>`
6. Boot Caesar and Max only after the durable files are in place.

### Recovered Context Order

1. Read `data/branch-boot-context.md`.
2. Read `docs/command-chain-policy-20260531.md`.
3. Read `data/ceo-command-ledger.json`.
4. Read `data/work-ledger.json`.
5. Read `data/agent-boot-prompts.json`.
6. Read `data/branch-decisions.jsonl` and `data/branch-session-restart-plan.json` when available.
7. Call `GET /api/memory/recover/:agent_id` for Caesar and Max first.
8. Compare recovered memories with active work-ledger tasks and recent events.
9. Spawn only the agents needed for active ledger items.

## Recovery Behavior If Memory File Is Missing

- `data/memory-ledger.jsonl` can be absent on a fresh machine.
- API should create it automatically on first use.
- Recovery can still proceed from:
  - boot context
  - command ledger
  - work ledger
  - branch decisions
- Result: functional but lower-context bootstrap.

## Recommended Packaging Split

### Portable Context Bundle

- `data/work-ledger.json`
- `data/ceo-command-ledger.json`
- `data/memory-ledger.jsonl`
- `data/branch-boot-context.md`
- `data/agent-boot-prompts.json`
- `data/branch-decisions.jsonl`
- `data/branch-session-restart-plan.json`
- `data/branch-org.json`

### Local Runtime Bundle Excluded

- `data/terminal-logs/`
- `tmp-chrome-cdp*/`
- `target*/`
- PID/log files
- secrets

## Migration Safety Notes

- `data/work-ledger.json` is authoritative and should be copied as-is.
- `data/memory-ledger.jsonl` is append-only and portable as-is.
- Do not rewrite ids during migration:
  - work task ids
  - work event ids
  - memory ids
  - memory `source_id`
- Preserve UTF-8 encoding for `.md`, `.json`, and `.jsonl` files.
- Avoid absolute-path rewrites inside historical evidence bodies; treat them as historical references, not executable config.
- If a file referenced by ledger or memory evidence is intentionally omitted from the portable package, recovery should still succeed but the evidence path will be archival-only.

## Decision Summary

- Portable second-PC context should be bootstrapped from ledgers, memory JSONL, and policy files.
- Terminal logs and Chrome/runtime artifacts stay local.
- Memory file is portable but must be reviewed for secrets before release packaging.
- Recovery should degrade gracefully when memory history is absent, using ledgers and policy files as the minimum reliable baseline.
