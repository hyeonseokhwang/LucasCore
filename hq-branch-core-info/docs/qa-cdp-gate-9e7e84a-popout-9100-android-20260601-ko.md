# QA/CDP 게이트 체크리스트 - 9e7e84a / 9000 popout / 9100 / Android tester

대상 커밋:
- `9e7e84ae424684e76090a0b7de2c8d9f6c6d4c09`
- 제목: `Stabilize terminal popout workflow`

목표:
- `9000` 터미널 popout 동작 검증
- `9100` 원장 health 및 화면 노출 검증
- Android tester spawn 상태 확인
- `9001` PID before/after 동일성 보존
- 웹 변경 게이트용 `test/build/CDP` 실행 기준 고정

증거 루트:
- `D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\qa-cdp-9e7e84a-20260601-021917\`

필수 산출물:
- `00-scope.txt`
- `01-git-show-9e7e84a.txt`
- `02-ports-before.txt`
- `03-9001-pid-before.txt`
- `04-web-test.txt`
- `05-web-build.txt`
- `06-9000-popout-console.json`
- `07-9000-popout-summary.txt`
- `08-9000-popout-desktop.png`
- `08b-9000-popout-mobile.png`
- `09-9000-popout-dom.txt`
- `10-9100-health.txt`
- `11-9100-console.json`
- `12-9100-desktop.png`
- `13-android-tester-sessions.json`
- `14-browser-cleanup.txt`
- `15-ports-after.txt`
- `16-9001-pid-after.txt`
- `17-pass-fail-template.md`

실행 순서:
1. 커밋 범위와 현재 포트 상태를 고정한다.
2. `9001` PID before를 채취한다.
3. `apps/web` 테스트를 실행한다.
4. `apps/web` 빌드를 실행한다.
5. `9000`에서 popout 진입, 스크린샷, 콘솔, DOM 텍스트를 채취한다.
6. `9100`에서 health, 스크린샷, 콘솔을 채취한다.
7. `9001 /api/sessions`에서 Android tester spawn 상태를 필터링한다.
8. CDP 종료 후 브라우저/포트 정리를 확인한다.
9. `9001` PID after를 채취하고 before와 동일한지 확인한다.

실행 명령:
```powershell
$Evidence = "D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\qa-cdp-9e7e84a-20260601-021917"
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null
Set-Location "D:\Lucas Core v0.1\workspaces\developer-4\repo"
git show --stat --format=fuller --summary 9e7e84a *> "$Evidence\01-git-show-9e7e84a.txt"
Get-NetTCPConnection -State Listen | Where-Object { 9000,9001,9100 -contains $_.LocalPort } | Sort-Object LocalPort | Format-Table -AutoSize *> "$Evidence\02-ports-before.txt"
Get-Process -Id 38752 | Select-Object Id,ProcessName,StartTime,Path | Format-List *> "$Evidence\03-9001-pid-before.txt"
```

```powershell
Set-Location "D:\Lucas Core v0.1\apps\web"
node --experimental-strip-types --test src/terminalPrompt.test.ts src/terminalReplay.test.ts src/terminalSurface.test.ts src/terminalTileFooter.test.ts *> "$Evidence\04-web-test.txt"
$bun = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter bun.exe | Select-Object -First 1 -ExpandProperty FullName)
cmd /c ('"' + $bun + '" run build') *> "$Evidence\05-web-build.txt"
```

```powershell
Set-Location "D:\Lucas Core v0.1\workspaces\developer-4\repo"
node "D:\Lucas Core v0.1\tools\capture-page-cdp.cjs" --url "http://127.0.0.1:9000/?popout=scrollback-check-2&name=scrollback-check-2" --out-dir "$Evidence" --prefix "08-9000-popout" --viewport "desktop=1600x1200" --viewport "mobile=390x844"
node "D:\Lucas Core v0.1\tools\capture-9000-cdp.cjs" *> "$Evidence\06-9000-popout-console.json"
```

```powershell
Set-Location "D:\Lucas Core v0.1\workspaces\developer-4\repo"
$r = Invoke-WebRequest -Uri "http://127.0.0.1:9100" -UseBasicParsing -TimeoutSec 10
"STATUS=$($r.StatusCode)" | Set-Content "$Evidence\10-9100-health.txt"
$r.Content | Add-Content "$Evidence\10-9100-health.txt"
node "D:\Lucas Core v0.1\tools\capture-page-cdp.cjs" --url "http://127.0.0.1:9100" --out-dir "$Evidence" --prefix "12-9100" --viewport "desktop=1600x1200"
```

```powershell
$resp = Invoke-RestMethod -Uri "http://127.0.0.1:9001/api/sessions" -TimeoutSec 15
$sessions = if ($null -ne $resp.value) { $resp.value } else { $resp }
$sessions | Where-Object { $_.id -like "android-tester*" -or $_.name -like "*android*" -or $_.name -like "*Android*" -or $_.cwd -like "*android*" -or $_.cwd -like "*Android*" } | Select-Object id,name,status,cwd,lastExitCode,restartCount,createdAt,updatedAt | ConvertTo-Json -Depth 6 | Set-Content "$Evidence\13-android-tester-sessions.json"
Get-NetTCPConnection -State Listen | Where-Object { 9000,9001,9100 -contains $_.LocalPort } | Sort-Object LocalPort | Format-Table -AutoSize *> "$Evidence\15-ports-after.txt"
Get-Process -Id 38752 | Select-Object Id,ProcessName,StartTime,Path | Format-List *> "$Evidence\16-9001-pid-after.txt"
```

판정 기준:
- `web test`: 실패 없음
- `web build`: 실패 없음
- `9000 popout`: 화면 로드, 콘솔 치명 에러 없음, popout DOM 텍스트 노출
- `9100 health`: HTTP `200`, 타이틀 `CEO 지시 원장` 확인
- `Android tester spawn`: 대상 세션 존재 여부를 JSON으로 고정
- `9001 PID`: before/after 동일

현재 알려진 블로커:
- Android tester 세션 필터 결과가 현재 비어 있다. 이는 `spawn 미확인` 상태이며, 실행 증거 `13-android-tester-sessions.json`이 필요하다.
- `9000 popout`용 DOM 추출 전용 스크립트는 아직 없다. 필요 시 `capture-9000-cdp.cjs` 또는 추가 추출 스크립트로 보강한다.
