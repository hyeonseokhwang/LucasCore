# Oracle Removal - 2026-06-04

## Summary

- task_id: `oracle-removal-20260604`
- owner: `han-ops`
- command_mode: `lucas-direct`
- permission: `edit`
- current_state: `doing`

## Objective

Remove Oracle DB related files on `D:` as aggressively as current permissions allow.

## Lucas Intent

User explicitly instructed: "오라클 db 관련해서 싹다 날려버려".

## Current Symptom / Evidence

- `D:` free space is low.
- Oracle services are still registered on the machine.
- `D:\MARS` contains the main Oracle installation and data footprint.

## Known Scope

- Primary delete target: `D:\MARS`
- Related running services found:
  - `OracleOraDB19Home5MTSRecoveryService`
  - `OracleOraDB19Home5TNSListener`
  - `OracleServiceORCL`

## Forbidden Actions

- Do not touch active LCC runtime paths.
- Do not restart `9001`.
- Do not delete unrelated `D:` directories based only on fuzzy name matches.

## Acceptance Evidence

- Oracle-related directory removal attempted on `D:\MARS`
- Remaining locked files or services reported explicitly
- Updated `D:` free-space measurement after cleanup attempt

## Live Progress

- 2026-06-04: Oracle services discovered.
- 2026-06-04: `D:\MARS` confirmed as primary Oracle footprint.
- 2026-06-04: Oracle services stopped successfully.
- 2026-06-04: `D:\MARS` removed successfully, reclaiming about `244.72 GB`.
- 2026-06-04: Oracle service registrations deleted successfully:
  - `OracleServiceORCL`
  - `OracleOraDB19Home5TNSListener`
  - `OracleOraDB19Home5MTSRecoveryService`
  - `OracleJobSchedulerORCL`
  - `OracleRemExecServiceV2`
  - `OracleVssWriterORCL`
- 2026-06-04: `D:` free space increased to about `259.66 GB`.

## Open Decisions / Blockers

- No blocker for the primary delete target.
- Residual Oracle-named items still exist in developer/config paths such as:
  - `D:\Diff\Utility\DbScript\tnsnames.ora`
  - `D:\Diff\Utility\DbScript2\tnsnames.ora`
  - `D:\황책임 업무\RDS협업\SynologyDrive\FT_조민제\02. 개발\Mars_Dev\Oracle_Java_Transaction\...`
- Those were not auto-deleted because they look like project/config artifacts, not the DB install/runtime itself.
