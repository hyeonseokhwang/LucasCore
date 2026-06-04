# Infra Storage Cleanup Handoff - 2026-06-04

## Summary

- handoff_id: `infra-storage-cleanup-handoff-20260604`
- author: `codex`
- intended_owner: `han-ops` infrastructure lane
- created_at: `2026-06-04`
- mode: `lucas-direct`
- ledger_reference: `disabled`

## Current User Direction

- Save the current cleanup context.
- Put it where the infrastructure owner can pick it up.
- User explicitly said Oracle and `D:\MARS\...` can be removed later.
- User then asked whether this session has administrator rights.

## Confirmed Admin State

- Current shell is **not elevated**.
- Verification result:
  - user: `DESKTOP-RH1ONHI\hysra`
  - `IsAdmin=False`
- `BUILTIN\Administrators` appears as `deny only`, so this session does not currently have UAC elevation.

## LCC-Side Storage Findings

### Immediate Delete Candidates

- `D:\Lucas Core v0.1\target-9104` about `976.1 MB`
- `D:\Lucas Core v0.1\target` about `227.0 MB`
- `D:\Lucas Core v0.1\target-commit-check` about `211.8 MB`
- `D:\Lucas Core v0.1\target-9015` about `73.2 MB`
- `D:\Lucas Core v0.1\target-9092` about `71.8 MB`
- root one-off QA screenshots/logs such as:
  - `lcc-9000-*.png`
  - `lcc-terminal-*.png`
  - `p0-overlay-audit-*.png`
  - small root debug `*.log` and `*.json`

### Review Before Delete

- all `tmp-chrome-cdp-*` directories, `49` directories total
- `D:\Lucas Core v0.1\data/system-logs/terminal-9000-cdp` about `1171.9 MB`
- `D:\Lucas Core v0.1\data/system-logs/dev8-chatgpt-web-operator-20260602` about `934.4 MB`
- `D:\Lucas Core v0.1\target-os-agent-runner` about `783.8 MB`
- `D:\Lucas Core v0.1\data/os-agents/api-restart-target` about `758.5 MB`
- `D:\Lucas Core v0.1\tmp\memory-qa` about `781.2 MB`
- `D:\Lucas Core v0.1\data/terminal-logs/archive` about `11.032 GB`

### Do Not Delete

- `D:\Lucas Core v0.1\target-9001`
- active `workspaces/*`
- active `data/terminal-logs/*.ansi.log`
- policy/docs/task-report files

### Runtime Check

- port `9001` currently runs from:
  - `D:\Lucas Core v0.1\target-9001\debug\lcc-core-api.exe`
- ports `9000`, `9002`, and `9100` are active through `node.exe`
- ports `9003`, `9004`, and `9104` were not listening at inspection time

## Non-LCC Storage Findings

- `C:\Users\hysra\AppData\Local\Packages` about `2.23 GB`
- `C:\Users\hysra\AppData\Local\Temp` about `1.84 GB`
- `C:\Users\hysra\AppData\Local\Google\Chrome\User Data` about `1.74 GB`
- `C:\Users\hysra\AppData\Local\Microsoft\Edge\User Data` about `1.09 GB`
- `C:` free space about `6.45 GB`
- `D:` free space about `9.31 GB`

## Oracle / MARS User Instruction

User explicitly stated:

- Oracle-related files can be deleted.
- `MARS` should be removed completely.
- Oracle DB can also be removed completely.

Important constraint:

- This session is not elevated, so Oracle service removal, protected install paths, and locked DB files may require an elevated shell.

## Suggested Next Action For Infra Owner

1. Oracle cleanup is now complete:
   - `D:\MARS` removed
   - Oracle services removed
   - `D:` free space now about `259.66 GB`
2. Next immediate LCC-safe delete candidates:
   - `D:\Lucas Core v0.1\target-9104` about `0.95 GB`
   - `D:\Lucas Core v0.1\target` about `0.22 GB`
   - `D:\Lucas Core v0.1\target-commit-check` about `0.21 GB`
   - `D:\Lucas Core v0.1\target-9015` about `0.07 GB`
   - `D:\Lucas Core v0.1\target-9092` about `0.07 GB`
3. Next high-yield review candidates:
   - `D:\Lucas Core v0.1\data\terminal-logs\archive` about `11+ GB`
   - `D:\Lucas Core v0.1\tmp-chrome-cdp-*` about multiple GB combined
   - `D:\Lucas Core v0.1\tmp\memory-qa` about `0.76 GB`
   - `D:\Lucas Core v0.1\target-os-agent-runner` about `0.77 GB`
4. Non-LCC large personal/archive candidates:
   - `D:\WorkSpace\IOS_Final.zip` about `2.97 GB`
   - repeated `HeungKukLife*.zip` files under `D:\WorkSpace`
   - `D:\Download\android-studio-panda4-windows.exe` about `1.33 GB`
   - `D:\SpringMSA\본사자료\SpringMSA - 복사본.zip` about `1.07 GB`
   - large media/archive files under `D:\정리정돈`

## Evidence Paths

- `D:\Lucas Core v0.1\data\task-reports\lcc-storage-optimization-discovery-20260604.md`
- `D:\Lucas Core v0.1\data\task-reports\infra-storage-cleanup-handoff-20260604.md`
