# LCC Branch Boot Context - 2026-05-31

This file is the restart-safe context for branch agents.

## Operating Rules

- Active agent count must stay at 6.
- Branch Director coordinates and reviews; agents execute assigned roles.
- File-based context is the source of truth until DB storage is introduced.
- Do not rely on terminal scrollback as memory.
- Do not print or persist real tokens.
- HQ hotline works through `http://hanwool-board.duckdns.org:9082/api/lcc`.
- Current HQ live speak passed with msgId `msg-1780198222835-f4b511e9`.
- The exposed token must be rotated by HQ/SRE after live validation.

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
