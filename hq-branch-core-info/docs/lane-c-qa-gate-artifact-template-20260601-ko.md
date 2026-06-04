# Lane C QA Gate Artifact Template

날짜:
- `2026-06-01`

증거 루트 템플릿:
- `D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\lane-c-qa-<YYYYMMDD-HHMMSS>\`

공통 변수:
```powershell
$Evidence = "D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\lane-c-qa-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null
```

필수 산출물:
- `01-9001-pid-before.txt`
- `02-web-test.txt`
- `03-web-build.txt`
- `04-api-cargo-check.txt`
- `05-meeting-mvp.png`
- `06-meeting-console.json`
- `07-meeting-dom.json`
- `08-development-team.png`
- `09-development-team-console.json`
- `10-development-team-dom.json`
- `11-tab-a-android.png`
- `12-tab-b-development.png`
- `13-tab-layout-console.json`
- `14-tab-a-state.json`
- `15-tab-b-state.json`
- `16-xterm-summary.txt`
- `17-xterm-console.json`
- `18-browser-cleanup.txt`
- `19-9001-pid-after.txt`
- `20-summary.md`

항목별 매핑:
- `apps/web test` -> `02-web-test.txt`
- `apps/web build` -> `03-web-build.txt`
- `cargo check if API touched` -> `04-api-cargo-check.txt`
- `Meeting MVP screenshot` -> `05-meeting-mvp.png`
- `Meeting MVP console` -> `06-meeting-console.json`
- `Meeting MVP DOM text` -> `07-meeting-dom.json`
- `Development Team screenshot` -> `08-development-team.png`
- `Development Team console` -> `09-development-team-console.json`
- `Development Team count / exclusion DOM` -> `10-development-team-dom.json`
- `2-tab layout tab A` -> `11-tab-a-android.png`
- `2-tab layout tab B` -> `12-tab-b-development.png`
- `2-tab layout console` -> `13-tab-layout-console.json`
- `tab A storage/state` -> `14-tab-a-state.json`
- `tab B storage/state` -> `15-tab-b-state.json`
- `xterm readable/scrollbar summary` -> `16-xterm-summary.txt`
- `xterm console/pageerror` -> `17-xterm-console.json`
- `browser cleanup` -> `18-browser-cleanup.txt`
- `9001 PID after` -> `19-9001-pid-after.txt`

최소 summary 템플릿:
```md
# Lane C QA Summary

- Evidence: `<full path>`
- web test: `PASS | FAIL`
- web build: `PASS | FAIL`
- cargo check if API touched: `PASS | FAIL | SKIPPED`
- meeting MVP DOM: `PASS | FAIL`
- development team count: `PASS | FAIL`
- 2-tab layout independence: `PASS | FAIL`
- xterm readable/scrollbar: `PASS | FAIL`
- 9001 PID unchanged: `PASS | FAIL`

## Notes
- blocker:
- exact missing artifact:
```
