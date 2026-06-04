# QA/CDP 게이트 - 9000 탭 분리 / origin / team-filter-layout

날짜:
- `2026-06-01`

목표:
- `9000` origin에서 탭별 상태가 분리되는지 확인
- tab A는 `Android` 레이아웃, tab B는 `development` 레이아웃으로 유지되는지 확인
- `team / filter / layout` 상태가 DOM 및 storage에 예상대로 남는지 확인
- 스크린샷 2장, 콘솔 에러, DOM, `sessionStorage`, `localStorage`, `apps/web test/build`, `9001 PID before/after unchanged`를 증거로 고정

증거 루트:
- `D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\qa-tab-layout-origin-9000-20260601-022641\`

필수 산출물:
- `01-9001-pid-before.txt`
- `02-web-test.txt`
- `03-web-build.txt`
- `04-tab-a-android.png`
- `05-tab-b-development.png`
- `06-console-tab-a.json`
- `07-console-tab-b.json`
- `08-dom-tab-a.json`
- `09-dom-tab-b.json`
- `10-storage-tab-a.json`
- `11-storage-tab-b.json`
- `12-summary.txt`
- `13-browser-cleanup.txt`
- `14-9001-pid-after.txt`
- `15-pass-fail-template.md`

검증 포인트:
1. 두 탭 모두 origin이 `http://127.0.0.1:9000`이다.
2. tab A에서 `Android` team/filter/layout을 적용해도 tab B의 `development` 상태를 덮어쓰지 않는다.
3. 각 탭 DOM에 현재 선택된 team/filter/layout 표시가 보인다.
4. 각 탭의 `sessionStorage` / `localStorage` 값이 예상 키와 값으로 남는다.
5. console `error` / `pageerror`가 없다.
6. `9001` PID가 before/after 동일하다.

실행 순서:
1. `9001` PID before 저장
2. `apps/web` test
3. `apps/web` build
4. CDP로 tab A, tab B를 열고 각 탭에서 상태를 맞춘다
5. 각 탭 스크린샷 1장씩 저장
6. 각 탭 console / DOM / storage를 저장
7. 브라우저 종료 후 cleanup 기록
8. `9001` PID after 저장 및 비교

실행 명령:
```powershell
$Evidence = "D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\qa-tab-layout-origin-9000-20260601-022641"
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
node "D:\Lucas Core v0.1\tools\check-9000-tab-layout-cdp.cjs" --url "http://127.0.0.1:9000" --out-dir "$Evidence"
```

```powershell
$Api9001After = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001After | Select-Object Id,ProcessName,Path,StartTime | Format-List *> "$Evidence\14-9001-pid-after.txt"
if ($Api9001After -ne $Api9001) { throw "9001 PID changed: before=$Api9001 after=$Api9001After" }
```

CDP 스크립트 요구사항:
- tab A 열기: `http://127.0.0.1:9000`
- tab B 열기: `http://127.0.0.1:9000`
- 각 탭 `location.origin` 저장
- tab A에서 `Android` 관련 team/filter/layout 선택
- tab B에서 `development` 관련 team/filter/layout 선택
- 각 탭에서 다음 저장:
  - screenshot
  - console events
  - page errors
  - `document.title`, 주요 header, 선택된 filter/layout 텍스트
  - `sessionStorage`
  - `localStorage`

판정 기준:
- `web test`: `PASS`
- `web build`: `PASS`
- `origin 9000`: `PASS`
- `tab A Android layout`: `PASS`
- `tab B development layout`: `PASS`
- `console/pageerror`: `PASS`
- `DOM/storage`: `PASS`
- `9001 PID unchanged`: `PASS`

현재 상태:
- 체크리스트 준비 완료
- 실제 QA 실행 증거는 아직 없음

현재 블로커:
- `check-9000-tab-layout-cdp.cjs`는 아직 생성 전이다
- 따라서 지금 부족한 정확한 산출물은 `04`부터 `13`까지의 실행 evidence다
