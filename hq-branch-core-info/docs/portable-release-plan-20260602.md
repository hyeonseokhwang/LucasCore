# LCC Core v0.1 Portable Release Plan

Date: 2026-06-02 KST

## Goal

Make LCC Core v0.1 portable to a different Windows PC by 2026-06-03, including the HQ-style durable memory baseline.

## Release Gate

- Fresh clone on another PC can install dependencies, build, and start 9000/9001 from scripts.
- 9001 starts without requiring machine-specific absolute paths.
- 9000 can connect to 9001 through configured API/WS origins.
- Caesar and Max can boot from policy files without manual prompt reconstruction.
- Memory API is available and can append, search, and recover Korean/UTF-8 memory entries.
- Work ledger and command ledger survive restart and remain readable.
- Generated runtime artifacts are excluded from the portable commit/package.

## Current Baseline

- Commit pushed: `98b71be feat: add memory baseline and operator QA tooling`
- Branch: `backup/current-ui-state-20260531-2315`
- Remote: `origin https://github.com/hyeonseokhwang/LucasCore.git`
- Verified before commit:
  - `git diff --check`
  - `npm --prefix apps/web test`
  - `npm --prefix apps/web run build`
  - `$env:CARGO_TARGET_DIR='target-commit-check'; cargo check --manifest-path apps/api/Cargo.toml`
  - 9001 PID preserved during checks

## Workstreams

### 1. Portable Bootstrap

Owner: developer-6, Max review

- Audit `scripts/start-lcc-core.ps1`, `scripts/start-lcc-agents.ps1`, `scripts/bootstrap-lcc-managers.ps1`.
- Confirm prerequisites: Git, Rust/Cargo, Bun or npm fallback, Codex CLI, Chrome only for QA.
- Produce fresh-clone commands for a second PC.
- Record required environment variables and defaults.

### 2. Memory System

Owner: developer-1, developer-3, developer-4 QA

- Verify `GET/POST /api/memory` and `GET /api/memory/recover/:agent_id`.
- Confirm `data/memory-ledger.jsonl` is created if absent.
- Confirm invalid input rejection and Korean UTF-8 round trip.
- Define which memory data should be copied to another PC and which should remain local/private.

### 3. Terminal UX Alignment With HQ

Owner: developer-2, developer-5, developer-8, developer-4 QA

- Benchmark HQ terminal state/status patterns from `D:\Lucas-Initiative-HQ\command-center`.
- Keep card grid readable at low resolution by showing status/tail, not full interaction.
- Experiment cautiously with hiding/removing card footer input:
  - Do not delete the input path first.
  - Add a reversible mode or scoped branch patch.
  - Keep selected/fullscreen/popout input available.
  - QA before accepting.
- Improve active/standby/blocked visibility with badges or footer metadata, not more terminal text.

### 4. Package Hygiene

Owner: Max, developer-8

- Exclude runtime logs, PID files, Chrome profiles, build targets, and local secrets.
- Ensure `.gitignore` covers:
  - `data/terminal-logs/`
  - `tmp-chrome-cdp*/`
  - `*.pid`
  - Rust and web build outputs
- Produce portable artifact checklist.

Portable artifact checklist:

- Keep:
  - source under `apps/`, `scripts/`, `tools/`, and required policy/docs files
  - tracked `data/*.json`, `data/*.md`, and restart-policy files needed for Caesar/Max boot
  - `Cargo.toml`, `Cargo.lock`, `package.json`, `bun.lock`, `.env.example`, `README.md`
- Exclude:
  - `data/terminal-logs/`, `data/system-logs/`, `data/memory-ledger.jsonl`
  - `tmp/`, `tmp-chrome-cdp*/`, `workspaces/`
  - `target*/`, `apps/web/dist/`
  - `*.log`, `*.png`, `*.pid`
  - local secret files such as `.env`, `.env.local`, `.env.*.local`

Commit boundaries:

1. `.gitignore` hygiene changes only.
2. Portable release docs/checklist updates only.
3. Bootstrap/runtime script portability fixes only.
4. Memory/runtime validation evidence only after QA and restart-risk review.

### 5. Second-PC Dry Run

Owner: Max coordinates, developer-4 QA

- Clone pushed branch.
- Install dependencies.
- Build API and web.
- Start `.\scripts\start-lcc-core.ps1 -SkipAgentBootstrap`.
- Check `GET /api/health`, `GET /api/work-ledger`, memory API smoke.
- Start Caesar/Max bootstrap after confirming 9001.
- Capture screenshot and console/DOM evidence.

## Decisions

- Developer-7 remains Lucas direct only and is excluded from this release work.
- 9001 singleton must not be restarted on the live PC unless Lucas explicitly allows context loss.
- Card input removal is an experiment, not an immediate deletion.
- Low-resolution density is accepted; the release criterion is legibility of status and access to full terminal, not every line visible in every card.

## Open Risks

- Live 9001 may not include newly compiled memory routes until restart/deploy; test on alternate port or second PC must prove the code path.
- Current repo contains many runtime artifacts in the working tree; they must not enter release packaging.
- Some scripts assume Windows and Codex CLI availability; prerequisites must be explicit.
- Broad `data/*.json*` sweep ignores can hide required portable state files by accident; prefer explicit runtime-artifact exclusions.
