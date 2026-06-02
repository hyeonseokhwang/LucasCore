# Terminal Fleet QA/CDP 게이트

날짜:
- `2026-06-01`

범위:
- `9000` ultra-wide / desktop / narrow 스크린샷
- `9000` CDP console / page error 확인
- `9000` DOM / layout 상태 확인
- `9000` xterm readable / scrollbar 확인
- `apps/web` test / build
- `9001` PID before / after 동일성 확인

증거 루트:
- `D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\terminal-fleet-qa-20260601-022525\`

필수 산출물:
- `01-9001-pid-before.txt`
- `02-web-test.txt`
- `03-web-build.txt`
- `04-9000-ultra-wide.png`
- `04-9000-desktop.png`
- `04-9000-narrow.png`
- `05-9000-console.json`
- `06-9000-dom-layout.json`
- `07-9000-xterm-summary.txt`
- `08-browser-cleanup.txt`
- `09-9001-pid-after.txt`
- `10-pass-fail-template.md`

실행 큐:
1. `9001` PID before 채취
2. `apps/web` test
3. `apps/web` build
4. `9000` 반응형 스크린샷 3종
5. `9000` console / page error 채취
6. `9000` DOM / layout / xterm / scrollbar 판독
7. 브라우저 종료와 잔존 포트 확인
8. `9001` PID after 채취 및 before 비교

실행 명령:
```powershell
$Evidence = "D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\terminal-fleet-qa-20260601-022525"
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
Set-Location "D:\Lucas Core v0.1\workspaces\developer-4\repo"
node "D:\Lucas Core v0.1\tools\capture-page-cdp.cjs" --url "http://127.0.0.1:9000" --out-dir "$Evidence" --prefix "04-9000" --viewport "ultra-wide=2560x1440" --viewport "desktop=1600x1200" --viewport "narrow=1280x720"
```

```powershell
Set-Location "D:\Lucas Core v0.1\workspaces\developer-4\repo"
node "D:\Lucas Core v0.1\tools\check-9000-terminal-ux-cdp.cjs" --out-dir "$Evidence" --url "http://127.0.0.1:9000" --session-name "scrollback-check-2"
```

```powershell
$Api9001After = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001After | Select-Object Id,ProcessName,Path,StartTime | Format-List *> "$Evidence\09-9001-pid-after.txt"
if ($Api9001After -ne $Api9001) { throw "9001 PID changed: before=$Api9001 after=$Api9001After" }
```

판정 기준:
- `web test`: 실패 없음
- `web build`: 실패 없음
- `9000` 스크린샷 3종 생성
- `console` / `pageerror`: 치명 에러 없음
- `DOM/layout`: stack / columns / grid 전환 확인
- `xterm`: 텍스트 판독 가능, viewport scrollHeight > clientHeight 또는 scrollWidth > clientWidth로 스크롤 가능성 확인
- `9001 PID`: before / after 동일

현재 상태:
- 체크리스트 준비 완료
- 실제 실행 증거는 아직 없음
- 기존 마지막 회귀 기준에서 `9001` PID는 `38752`였다

현재 블로커:
- 없음
- 단, 실제 QA 완료 판정에는 위 산출물 전부가 필요하다
