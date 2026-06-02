# CEO Command Board

Last updated: 2026-06-01 KST

This board is the restart-safe summary of Lucas's current directives, priorities, owners, and required evidence.

## Current Priorities

1. Meeting feature first
   - Build a Slack-style meeting/work channel feature.
   - Benchmark actual HQ source before implementation.
   - Use meetings as the primary way Lucas works with the team.

2. Heungkuk Android final-source triage in parallel
   - Prepare final source selection while product development continues.
   - Scope remains the Heungkuk Life Android joint-certificate WebView issue.
   - Track final source, APK, JS override, SHA, backups, dirty files, and delivery status.

3. Terminal scrollback
   - Add usable terminal scrollbar/scrollback.
   - Target about 100 lines of upward review.
   - Preserve 9001 singleton backend behavior and xterm rendering.

4. Ledger management workspace
   - Create `원장 관리` space for planning and execution tracking.
   - Track tasks, owners, status, due dates, evidence, blockers, commits, and next actions.
   - Link meetings with ledger items where feasible.

5. Responsive command-center layout
   - Add after meeting-first priority is underway.
   - Adapt layout by viewport size and aspect ratio.
   - Ultra-wide monitors should not default to uniform tiny terminal tiles.
   - Prefer compact navigation/team filters, a primary meeting/workspace or focused terminal/ledger item, grouped developer terminal lanes by workstream, and smaller observer/status strips.
   - Keep dense fleet overview available as a selectable layout mode, not the only ultra-wide default.
   - Preserve readable terminal card height, scrollback, and xterm rendering.
   - Use HQ source/design patterns where relevant before broad UI changes.
   - Verify with screenshots for ultra-wide, normal desktop, narrower laptop, and mobile widths.

## Team Policy

- Dev Lead name: Max.
- Max coordinates; Max should not work alone.
- Developers must receive explicit task assignments.
- Benchmark HQ source with actual git/code before new meeting, ledger, or workflow features.
- Commit each completed development step deliberately.
- Do not commit unverified work, unrelated dirty changes, generated noise, or wrong-source restoration.
- UI work requires screenshot and CDP console evidence where feasible.
- Preserve 9001 singleton terminal backend behavior.

## UI Architecture Requirement

- Meeting-first remains the immediate product priority.
- Responsive command-center layout is part of the UI architecture plan after meeting work is underway.
- Ultra-wide layouts should prioritize a usable primary work surface plus grouped workstream lanes, not a uniform grid of tiny cards.
- Dense fleet overview remains available as an explicit mode.
- Required evidence for layout work: HQ files/patterns inspected, screenshots at ultra-wide, normal desktop, narrower laptop, and mobile widths, CDP console check, and terminal readability/scrollback check.

## Expanded Development Team

- Max: lead, assignment, review, integration, commit boundary control.
- developer-1: terminal scrollback/scrollbar.
- developer-2: HQ benchmark for Slack-style meeting feature.
- developer-3: HQ/current benchmark for ledger management workspace.
- developer-4: verification owner: builds, tests, CDP, screenshots, 9001 regression.
- developer-5: meeting feature implementation support.
- developer-6: ledger workspace implementation support.
- developer-7: Heungkuk Android final-source triage support.
- developer-8: integration, documentation, 9100 status-panel planning, and 9000 responsive-layout coordination support.

## Heungkuk Android Reference

- Repo: `D:\WorkSpace\HeungKukLife`
- Current HEAD observed: `b2826b2 fix: stabilize joint certificate WebView input and popup back`
- Report: `D:\안드로이드이슈배포\android_joint_cert_task_full_report_ascii_20260531_0308.md`
- Target page: `/crtcnt/crtmth/jntMng/regist.do`
- Current residual issue: intermittent first tap on `#iptNm` after re-entering the joint certificate page does not bring up keyboard.
- Current dirty files observed:
  - `app/src/main/java/kr/co/heungkuklife/hklifem/di/ApiModule.kt`
  - `app/src/main/java/kr/co/heungkuklife/hklifem/utils/Util.kt`
  - `app/src/main/res/xml/network_security_config.xml`

## Required Evidence

- HQ benchmark report:
  - exact repo/path
  - branch/commit
  - files inspected
  - patterns reused
  - patterns rejected
  - proposed local files to change

- UI feature verification:
  - screenshot path
  - CDP console result
  - build/test commands and results

- Terminal verification:
  - generated output over viewport
  - scroll up around 100 lines
  - screenshot
  - no console errors

- Heungkuk final-source verification:
  - git status
  - final commit SHA
  - APK path and SHA256
  - JS override/server JS path and SHA256
  - backup path
  - residual issue status

## Status Snapshot

Status date: 2026-06-01 KST

- Max
  - Role confirmed in `data/branch-boot-context.md`.
  - Still needs to convert policy into explicit developer assignments, collected reports, integration notes, and commit-ready verification bundles.

- developer-1: terminal scrollback/scrollbar
  - In progress.
  - Evidence present in current web source and verification checklist:
    - `apps/web/src/main.tsx`
    - `apps/web/src/styles.css`
    - `docs/regression-checklist-9000-9001-20260601.md`
  - Verification artifacts not yet attached on this board.

- developer-2: HQ benchmark for Slack-style meeting feature
  - Open.
  - No repo-local HQ benchmark report found yet that satisfies required meeting benchmark fields.

- developer-3: HQ/current benchmark for ledger management workspace
  - Partial.
  - Local ledger direction exists in:
    - `docs/work-ledger-ops.md`
    - `data/work-ledger.json`
  - HQ/current benchmark report format is still missing.

- developer-4: verification owner
  - In progress.
  - Verification procedure exists in `docs/regression-checklist-9000-9001-20260601.md`.
  - Required output artifacts are not yet produced in an evidence directory.

- developer-5 through developer-8
  - Board ownership exists.
  - Activation and handoff evidence are still missing from repo-local tracking.

- developer-7: Heungkuk Android final-source triage support
  - Reference inputs exist, including target repo, residual issue note, and dirty-file inventory.
  - Board-ready final-source triage inventory is still missing.

- developer-8: integration and documentation support
  - Current pass is documenting status, evidence, gates, and blockers against this board.
  - Current assigned planning scope:
    - `9100` agent status panel improvement plan
    - `9000` responsive command-center mode plan
    - developer-1 coordination boundary for layout vs. scrollback behavior
    - operational monitoring upgrade so `9100` visibly shows idle/active/blocked/next action
    - ultra-wide layout status check and mode contract for `9000`
  - Report prepared:
    - `docs/dev8-9100-9000-status-panel-responsive-plan-20260601.md`
  - Immediate patch scope proposed for approval:
    - `tools/ceo-ledger-board-server.cjs`: parse heartbeat lines, derive board state, show task/blocker/next action/last update
    - `9100` summary strip: blocked, stale, active, idle, missing-heartbeat counts
    - no broad `9000` UI changes before Max accepts `Work` / `Fleet` / `Focus`

## Repo Evidence Snapshot

- Policy and ownership source:
  - `data/branch-boot-context.md`

- Ledger scope and local source of truth:
  - `data/work-ledger.json`
  - `docs/work-ledger-ops.md`

- Verification checklist and required artifact bundle:
  - `docs/regression-checklist-9000-9001-20260601.md`

- Current in-flight app changes observed in worktree:
  - `apps/web/src/main.tsx`
  - `apps/web/src/styles.css`

- Current worktree state observed while updating this board:
  - Modified:
    - `apps/web/src/main.tsx`
    - `apps/web/src/styles.css`
    - `data/branch-boot-context.md`
  - Untracked:
    - `data/ceo-command-board.md`
    - `docs/regression-checklist-9000-9001-20260601.md`
    - `tools/`

## Commit Boundary And Verification Gate

- Do not commit meeting feature implementation until developer-2 delivers an HQ benchmark report with exact repo/path, branch/commit, inspected files, reusable patterns, rejected patterns, and proposed local files to change.
- Do not commit ledger workflow expansion as if benchmarked until developer-3 records the HQ/current benchmark evidence in the same report format.
- Do not approve a UI-related commit until one evidence directory contains:
  - git status capture
  - web test output
  - web build output
  - API health result
  - screenshot path
  - CDP console note
  - terminal scrollback note
  - `9001` PID before/after match
- Keep documentation/status tracking separate from unrelated product diffs already present in the worktree.
- Do not record commit completion on this board until verification artifacts exist and the change boundary is clear.

## Open Blockers

- Missing HQ benchmark report for the meeting feature.
- Missing HQ/current benchmark report for the ledger workspace.
- Missing explicit activation or handoff evidence for developer-5 through developer-8.
- Missing produced verification artifact directory; only the checklist document exists right now.
- Missing board-formatted Heungkuk final-source triage inventory with final SHA, APK path/SHA256, JS path/SHA256, backup path, and residual issue disposition.
- Current app worktree is already dirty, so Max must keep future commit boundaries narrow and evidence-backed.

## Open Actions

- [ ] Add/activate developer-5 through developer-8.
- [ ] Instruct Max to reprioritize: meeting feature first, Android final-source triage in parallel.
- [ ] Max to assign developers explicitly.
- [ ] Produce HQ meeting-feature benchmark report.
- [ ] Produce Heungkuk final-source triage inventory.
- [ ] Implement terminal scrollback and verify.
- [ ] Implement meeting MVP after benchmark.
- [ ] Implement ledger workspace after meeting plan is clear.
- [ ] Design responsive layout modes for ultra-wide, desktop, narrower laptop, and mobile screens after meeting-first priority is underway.
