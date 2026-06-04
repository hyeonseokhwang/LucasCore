# QA/CDP 게이트 - 9000 Development Team 화면

날짜:
- `2026-06-01`

목표:
- `9000` 첫 화면에서 `Development Team` 필터를 선택했을 때 `Dev Lead + developer-1..8` 총 `9`개 카드가 active 상태로 보이는지 확인
- `Chief Min`, `android-tester`가 `Development Team` 결과에 포함되지 않는지 확인
- 팀 필터 `development / android-qa / executive` 전환이 정상 동작하는지 확인
- 스크린샷, CDP console, DOM text, `apps/web test/build`, `9001 PID unchanged`를 증거로 남긴다

증거 루트:
- `D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\qa-development-team-9000-20260601-022727\`

필수 산출물:
- `01-9001-pid-before.txt`
- `02-web-test.txt`
- `03-web-build.txt`
- `04-development-team.png`
- `05-team-filter-development.png`
- `06-team-filter-android-qa.png`
- `07-team-filter-executive.png`
- `08-console.json`
- `09-dom-text.json`
- `10-summary.txt`
- `11-browser-cleanup.txt`
- `12-9001-pid-after.txt`
- `13-pass-fail-template.md`

기대 결과:
- `Development Team` 필터에서 보이는 active 카드:
  - `Dev Lead`
  - `developer-1`
  - `developer-2`
  - `developer-3`
  - `developer-4`
  - `developer-5`
  - `developer-6`
  - `developer-7`
  - `developer-8`
- 총 active 카드 수: `9`
- 제외 대상:
  - `Chief Min`
  - `android-tester`

검증 포인트:
1. 기본 화면 또는 팀 필터 UI에서 `Development Team`이 선택 가능하다.
2. `Development Team` 선택 후 위 9개 카드가 DOM 텍스트와 화면에 존재한다.
3. 위 9개 카드가 active 표시를 가진다.
4. `Chief Min`, `android-tester`는 같은 결과 목록에 나타나지 않는다.
5. `android-qa`, `executive` 필터 전환 시 목록이 바뀌며 콘솔 에러가 없다.
6. `9001` PID before/after가 동일하다.

실행 순서:
1. `9001` PID before 저장
2. `apps/web` test
3. `apps/web` build
4. `9000`에서 `Development Team` 선택 후 스크린샷 저장
5. `development / android-qa / executive` 필터 각각 스크린샷 저장
6. console / pageerror / DOM text 저장
7. 브라우저 cleanup 기록
8. `9001` PID after 저장 및 before 비교

실행 명령:
```powershell
$Evidence = "D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\qa-development-team-9000-20260601-022727"
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
node "D:\Lucas Core v0.1\tools\check-9000-development-team-cdp.cjs" --url "http://127.0.0.1:9000" --out-dir "$Evidence"
```

```powershell
$Api9001After = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001After | Select-Object Id,ProcessName,Path,StartTime | Format-List *> "$Evidence\12-9001-pid-after.txt"
if ($Api9001After -ne $Api9001) { throw "9001 PID changed: before=$Api9001 after=$Api9001After" }
```

CDP 스크립트 요구사항:
- `http://127.0.0.1:9000` 접속
- `Development Team` 필터 선택
- 카드 텍스트와 active 상태 수집
- `development / android-qa / executive` 필터 각각 클릭 후 스크린샷 저장
- `console` / `pageerror` / 주요 DOM 텍스트 저장
- 다음 항목을 요약 파일에 기록:
  - active 카드 수
  - 포함된 카드 이름
  - 제외 대상 존재 여부
  - 필터 전환 성공 여부

판정 기준:
- `web test`: `PASS`
- `web build`: `PASS`
- `Development Team active 9 cards`: `PASS`
- `Chief Min excluded`: `PASS`
- `android-tester excluded`: `PASS`
- `team filter switching`: `PASS`
- `console/pageerror`: `PASS`
- `DOM text evidence`: `PASS`
- `9001 PID unchanged`: `PASS`

현재 상태:
- 체크리스트 준비 완료
- 실제 실행 증거는 아직 없음

현재 블로커:
- `check-9000-development-team-cdp.cjs`는 아직 생성 전이다
- 따라서 현재 부족한 정확한 산출물은 `04`부터 `11`까지의 실행 evidence다
