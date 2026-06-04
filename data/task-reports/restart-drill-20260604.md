# Restart Drill Report - 2026-06-04

## Objective

Prepare a controlled restart drill for memory-system validation and 9100 web restart.

Lucas direction:

- Keep Lux as the last remaining comparison authority.
- Bring up new Caesar and Areum, then have them recover memory and compare against Lux.
- If context recovery is acceptable, restart 9100 to apply terminal/web changes.
- Preserve 9001 unless Lucas explicitly accepts context loss.

## Current Baseline

- branch: `feature/human-grade-memory-20260604`
- latest pushed commit: `9d7407d Add memory recovery fallback for live boot`
- dirty file intentionally excluded: `data/terminal-context-ledger.jsonl`
- 9001 listener: PID `14540`, command `"target-9001\\debug\\lcc-core-api.exe"`
- 9100 listener: PID `24800`, command `node tools\\ceo-ledger-board-server.cjs`

Evidence:

- `data/system-logs/restart-drill-20260604/listeners-before.json`
- `data/system-logs/restart-drill-20260604/sessions-before.json`
- `data/system-logs/restart-drill-20260604/git-status-before.txt`
- `data/system-logs/restart-drill-20260604/git-head-before.txt`

## Live Session Baseline

Active sessions observed on 9001:

- `ceo` / Caesar / gpt-5.5
- `areum` / Areum / gpt-5.4
- `audit-officer` / Lux / gpt-5.4
- `dev-lead` / Max / gpt-5.5
- `developer-1` / gpt-5.4
- `developer-4` / gpt-5.4
- `developer-8` / gpt-5.4
- `manual-tf-lead` / gpt-5.5
- `manual-tf-1` / gpt-5.4
- `manual-tf-2` / gpt-5.4

Lux state:

- Lux is active but stale on an earlier `developer-4_QA_remains_open` return.
- Treat Lux as a comparison witness, not a fresh executor, until a new Lux/Areum/Caesar verifies the stale behavior.

## Memory Recovery Contract To Test

New Caesar and Areum must recover from:

1. `AGENTS.md` and required policy files
2. `data/daily-memory/2026-06-04.md`
3. `data/task-reports/human-grade-memory-system-20260604.md`
4. `data/task-reports/restart-drill-20260604.md`
5. `GET /api/memory/recover/<agent-id>` if 9001 provides it
6. direct file fallback if `recovered_context.daily_memory` is missing

Required recovered facts:

- current branch and latest commit
- memory-system implementation phases
- 9001 must remain preserved
- 9100 restart is for web/terminal UI reflection
- Lux is the last comparison authority
- stale channel issues existed for Lux and developer-4
- final next action is 9100 restart only after context recovery passes

## Planned Sequence

1. Preserve Lux and current 9001.
2. Do not restart 9100 yet.
3. Create or respawn one low-risk test session first if needed.
4. Then bring up new Caesar and new Areum test sessions without deleting the current Caesar until Lucas confirms.
5. Ask new Caesar and Areum for a strict recovery report.
6. Compare their report against Lux baseline and file evidence.
7. If recovery passes, stop PID `24800` only.
8. Restart 9100 with `node tools\\ceo-ledger-board-server.cjs`.
9. Verify 9100 listener returns.
10. QA terminal card/fullscreen/popout and boot prompt memory text.

## 9100 Restart Command

Prepared command:

```powershell
$pid9100 = (Get-NetTCPConnection -LocalPort 9100 -State Listen).OwningProcess
Stop-Process -Id $pid9100 -Force
Start-Process -FilePath "node" -ArgumentList "tools\\ceo-ledger-board-server.cjs" -WorkingDirectory "D:\\Lucas Core v0.1" -WindowStyle Hidden
```

Before executing, Caesar must confirm:

- 9001 PID is still `14540`
- Lux is still active
- daily memory and this drill report are committed/pushed

## Current Gate

Status: restart preparation in progress.

Do not restart 9100 until Caesar reports `restart_ready=true` to Lucas.
