# QA/CDP 게이트 - Meeting MVP

날짜:
- `2026-06-01`

목표:
- `9000` Meeting MVP 화면의 주요 텍스트와 구조를 검증
- `channel list`, `messages`, `decisions`, `action items`, `ledger label`이 화면과 DOM에 보이는지 확인
- `apps/web test/build` 실행
- `apps/api`가 touched 된 경우에만 `cargo check`
- `9001` PID before/after unchanged 확인

증거 루트:
- `D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\qa-meeting-mvp-20260601-022810\`

필수 산출물:
- `01-9001-pid-before.txt`
- `02-web-test.txt`
- `03-web-build.txt`
- `04-api-cargo-check.txt`
- `05-9000-meeting.png`
- `06-9000-console.json`
- `07-9000-dom-text.json`
- `08-summary.txt`
- `09-browser-cleanup.txt`
- `10-9001-pid-after.txt`
- `11-pass-fail-template.md`

검증 포인트:
1. `9000` Meeting MVP 첫 화면이 로드된다.
2. 화면 스크린샷 1장을 저장한다.
3. CDP console / pageerror에 치명 에러가 없다.
4. DOM 텍스트에 다음 항목이 존재한다.
   - `channel list`
   - `messages`
   - `decisions`
   - `action items`
   - `ledger label`
5. `apps/web test/build`가 통과한다.
6. `apps/api` touched 시 `cargo check`가 통과한다.
7. `9001` PID before/after가 동일하다.

실행 순서:
1. `9001` PID before 저장
2. `apps/web` test
3. `apps/web` build
4. API touched 여부 판정 후 필요 시 `cargo check`
5. `9000` Meeting MVP 스크린샷 / console / DOM 저장
6. 브라우저 cleanup 기록
7. `9001` PID after 저장 및 before 비교

실행 명령:
```powershell
$Evidence = "D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\qa-meeting-mvp-20260601-022810"
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null

$Api9001 = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001 | Select-Object Id,ProcessName,Path,StartTime | Format-List *> "$Evidence\01-9001-pid-before.txt"
```

```powershell
Set-Location "D:\Lucas Core v0.1\apps\web"
node --experimental-strip-types --test src/terminalPrompt.test.ts src/terminalReplay.test.ts src/terminalSurface.test.ts src/terminalTileFooter.test.ts *> "$Evidence\02-web-test.txt"
$bun = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter bun.exe | Select-Object -First 1 -ExpandProperty FullName)
cmd /c ('"' + $bun + '" run build') *> "$Evidence\03-web-build.txt"
```

```powershell
Set-Location "D:\Lucas Core v0.1"
$TouchedApi = @(git diff --name-only --relative HEAD~1 HEAD | Where-Object { $_ -like "apps/api/*" }).Count -gt 0
if ($TouchedApi) {
  cargo check --manifest-path "D:\Lucas Core v0.1\apps\api\Cargo.toml" *> "$Evidence\04-api-cargo-check.txt"
} else {
  "SKIPPED: apps/api not touched" | Set-Content "$Evidence\04-api-cargo-check.txt"
}
```

```powershell
Set-Location "D:\Lucas Core v0.1"
node "D:\Lucas Core v0.1\tools\extract-9000-meeting-dom.cjs" --out-dir "$Evidence" --url "http://127.0.0.1:9000" --expect-text "channel" --expect-text "messages" --expect-text "decisions" --expect-text "action" --expect-text "ledger"
node "D:\Lucas Core v0.1\tools\capture-page-cdp.cjs" --url "http://127.0.0.1:9000" --out-dir "$Evidence" --prefix "05-9000-meeting" --viewport "desktop=1600x1200"
```

```powershell
$Api9001After = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001After | Select-Object Id,ProcessName,Path,StartTime | Format-List *> "$Evidence\10-9001-pid-after.txt"
if ($Api9001After -ne $Api9001) { throw "9001 PID changed: before=$Api9001 after=$Api9001After" }
```

판정 기준:
- `web test`: `PASS`
- `web build`: `PASS`
- `cargo check if API touched`: `PASS` 또는 `SKIPPED`
- `screenshot`: `PASS`
- `console/pageerror`: `PASS`
- `DOM text`: `PASS`
- `9001 PID unchanged`: `PASS`

현재 상태:
- 체크리스트 준비 완료
- 실제 QA 실행 증거는 아직 없음

현재 블로커:
- 없음
- 실행 완료 판정에는 `05`부터 `10`까지의 실증 evidence가 필요하다
