# LCC Branch Boot Context - 2026-05-31

This file is the restart-safe context for branch agents.

## Operating Rules

- Active development capacity may expand up to the agent cap when Lucas requests parallel work.
- Current expanded development team is Max plus developer-1 through developer-8.
- Agent cap remains 20 unless Lucas changes it.
- Branch Director coordinates and reviews; agents execute assigned roles.
- File-based context is the source of truth until DB storage is introduced.
- Do not rely on terminal scrollback as memory.
- Do not print or persist real tokens.
- HQ hotline works through `http://hanwool-board.duckdns.org:9082/api/lcc`.
- Current HQ live speak passed with msgId `msg-1780198222835-f4b511e9`.
- The exposed token must be rotated by HQ/SRE after live validation.

## Development Team Policy

- Dev Lead name is Max.
- Max is the development lead, not the sole implementer.
- Max must decompose work, assign owners, collect reports, review, integrate, verify, and commit.
- Developer agents must receive explicit task assignments; do not leave developers idle while Max works alone.
- Benchmark existing HQ source before implementing meeting, ledger, or workflow features.
- Use actual source code only. Do not implement from memory or assumptions.
- HQ benchmark reports must include exact repo/path, branch/commit, inspected files, reusable patterns, rejected patterns, and proposed local changes.
- Commit every completed development step as a scoped, deliberate commit.
- Do not commit unverified work, unrelated dirty changes, generated noise, or wrong-source restoration.
- UI commits require screenshot/CDP console evidence where feasible.
- Preserve the 9001 singleton terminal backend behavior and API/WS origin correction.
- Terminal scrollback is required: web terminal cards must support about 100 lines of upward review with usable scrollbar/wheel behavior.

## QA And CDP Policy

- QA is mandatory after development, especially for UI work.
- Every UI change must be checked with browser automation or CDP before reporting done.
- Required UI evidence: screenshot path, DOM/text check, console error check, and viewport note.
- CDP/browser processes used only for QA must be closed after capture; do not leave debugging ports running.
- If CDP finds layout, encoding, console, or interaction issues, fix and rerun the check before commit.
- Non-UI changes still require relevant tests/build/checks and a short evidence note.

## 24/365 Ledger-Driven Operating Policy

- The 9100 command ledger is the shared backlog and operating board.
- No development agent should wait idly for manual prompting when ledger work exists.
- If an agent finishes or is blocked for more than 10 minutes, the agent must scan the 9100 ledger for unassigned, blocked, stale, or low-progress work that matches its role.
- Idle agents must report the proposed next task to Max, then proceed unless Max redirects.
- Max must actively detect idle agents, rebalance work, and keep every available developer assigned to a current ledger item.
- Every agent report must include current item, next action, blocker if any, evidence path if applicable, and expected next checkpoint.
- Developer-4 owns the QA queue and must pull completed UI/backend changes into verification without waiting for a separate request.
- Work should move in small loops: pick ledger item, inspect source, implement minimal patch, test/build, CDP or relevant verification, report evidence, commit, then pick the next item.

## Human-Team Operating Rhythm

- Run the development group like a human team, not isolated terminals.
- Max acts as team lead: standup, assignment, pairing, review, QA handoff, and commit gate.
- Developer agents act like proactive team members: they look for work, propose next actions, ask for review when ready, and move to the next ledger item after handoff.
- Every 15 minutes, active agents should produce a short heartbeat: `item / doing now / next / blocker / evidence`.
- Pairing is expected when useful: developer-2 with developer-5 for meetings, developer-3 with developer-6 for ledger, developer-1 with developer-4 for terminal QA, developer-7 with Max for Heungkuk triage decisions, developer-8 with Max for monitoring.
- A blocked agent must either request a specific decision from Max or switch to another ledger item; silent waiting is not allowed.

## Product Direction

- Add a Slack-style meeting/work channel feature based on HQ source patterns.
- Add a dedicated ledger management workspace (`원장 관리`) for planning, tracking, owners, status, due dates, evidence, blockers, commits, and next actions.
- Meetings should be able to reference ledger items, and ledger items should show related meeting/activity evidence where feasible.
- Keep existing ledger/reminder items intact, including Heungkuk Android, Spring MSA, tax, terminal P0, staffing, and HQ communications.
- Current product priority: implement the meeting feature first while Heungkuk Android final-source triage runs in parallel.

## Files To Read On Startup

1. `data/branch-org.json`
2. `data/branch-session-restart-plan.json`
3. `data/branch-decisions.jsonl`
4. `data/work-ledger.json`
5. `lcc-hq-communication-test-report-20260531.md`
6. `docs/branch-inbound-ops.md`
7. `D:\안드로이드이슈배포\android_joint_cert_task_full_report_ascii_20260531_0308.md` when working Android

## Today Timeline

- 13:30 KST: prepare Spring MSA technical whitepaper.
- 14:00 KST: start parallel Android final debugging.
- 20:00 KST: Spring MSA study.
- Hourly: remind Lucas about year-end tax task.

## Current Workstreams

- Android: Heungkuk Life joint certificate WebView issue.
- MSA: collect HQ learning history and write study brief.
- Ledger: keep today work visible and Korean-readable.
- Infra: keep exactly 6 active agents and monitor 9002/9100/9102.
- Security: guard against terminal API exposure, token leakage, auth regression.

## Target Session Names

- `chief-min`: development lead and execution board.
- `han-ops`: infrastructure admin and session health.
- `caden-android`: Android WebView implementation owner.
- `seo-security`: security and regression owner.
- `mira-ledger`: ledger and clarity owner.
- `joon-msa`: Spring MSA study owner.
