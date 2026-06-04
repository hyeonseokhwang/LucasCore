# Restart Resume - Terminal Incident

Generated: 2026-06-02 KST
Owner: Caesar CEO

## Current State

- Lucas ordered all current work context saved and worker sessions stopped because terminal visibility is unacceptable.
- Active sessions intentionally preserved:
  - `ceo` / Caesar / executive / gpt-5.5
  - `developer-7` / Developer 7 / development / gpt-5.4 / Lucas-direct protected
- Worker sessions stopped after context snapshot:
  - `dev-lead`
  - `developer-1`
  - `developer-3`
  - `developer-4`
  - `developer-8`
  - `qa-lead`
  - `audit-officer`
  - `ops-recorder`
  - `infra-admin`
  - `android-1`
  - `hkl-handover-tf-1`
  - `ux-designer`

## Saved Context

- Full session snapshot:
  - `data/system-logs/session-shutdown-20260602-215318/session-context-snapshot.json`
- Session summary:
  - `data/system-logs/session-shutdown-20260602-215318/shutdown-summary.txt`
- Work-ledger handoff event:
  - `work-event-1780404666086`

## Runtime Preservation

- `9001` backend preserved:
  - PID `1656`
- Other listeners observed before restart prep:
  - `9000` PID `39532`
  - `9002` PID `22264`
  - `9100` PID `44060`
- `9003` not listening at last check.

## Primary Reboot Instruction

On next startup, do not immediately respawn the full company.

First sequence:

1. Caesar reads boot policy and this file.
2. Max is raised second.
3. Caesar and Max inspect:
   - `data/ceo-wake-latest.json`
   - `data/work-ledger.json`
   - `data/agent-ops-events.jsonl`
   - `data/system-logs/session-shutdown-20260602-215318/session-context-snapshot.json`
4. Confirm `developer-7` remains Lucas-direct protected.
5. Respawn only the minimum team needed for terminal recovery.

## P0 After Reboot

Terminal recovery is the sole P0 until Lucas accepts the visible result.

Acceptance criteria:

- Fullscreen/popout terminal is readable.
- No ANSI/control fragments visible.
- No duplicated scrollback or replay waterfall.
- Real bounded scrollback is available.
- Korean input is not lost while typing.
- `Shift+Enter` creates multiline input.
- `Enter` submits.
- `9000` may be restarted as needed.
- `9001` must remain preserved unless Lucas explicitly approves context loss.
- `developer-7` must not be used.

## Required Restart Staffing

Lucas decision: after restart, raise exactly Caesar, Max, and four developers for terminal recovery.

Required lineup:

- `ceo` / Caesar / gpt-5.5 or gpt-5.4:
  - executive gatekeeper and Lucas command channel.
- `dev-lead` / Max / gpt-5.5:
  - owns recovery plan, developer assignment, QA gate, and commit boundary.
- `developer-1` / gpt-5.4:
  - owns source patch for terminal display/input.
- `developer-2` / gpt-5.4:
  - owns HQ terminal benchmark/transplant comparison and API/client contract.
- `developer-3` / gpt-5.4:
  - owns ledger/context continuity and restart-safe reporting for terminal P0 only.
- `developer-4` / gpt-5.4:
  - owns CDP/screenshot/DOM/console QA.

Do not raise design, HKL, ChatGPT GUI, Android, infra, audit, QA-lead, ops-recorder, or extra developers until the terminal gate passes or Lucas explicitly redirects.

`developer-7` remains Lucas-direct protected. Do not use developer-7 for terminal recovery.

## Paused Work To Resume Later

- `terminal-input-text-loss-20260602`
- `terminal-buffer-instant-render-20260602`
- `hkl-auth-manual-handover-20260602`
- `ops-progress-space-20260602`
- `decision-blocker-portal-20260602`
- `ceo-9100-board-cleanup-20260602`
- `chatgpt-web-operator-20260602`
- `caesar-hourly-reporting`
- `ceo-support-qa-audit-ops-20260602`

These are not cancelled. They are paused behind terminal recovery.
