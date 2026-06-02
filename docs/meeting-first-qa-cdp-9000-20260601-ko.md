# 미팅 우선 QA/CDP 검증 명령

날짜: `2026-06-01`

목표:

- 오늘 `9000`에 보이는 미팅 화면을 기준으로 QA/CDP 검증 명령을 고정한다.
- 필수 범위는 `9000` 스크린샷, CDP 콘솔, DOM 텍스트, `apps/web` 테스트/빌드, `9001` PID 전후 동일성이다.
- `9001`은 절대 재시작/종료하지 않는다.

준비된 스크립트:

- 공통 반응형 캡처: [tools/capture-page-cdp.cjs](</D:/Lucas Core v0.1/tools/capture-page-cdp.cjs:1>)
- `9000` 미팅 DOM 텍스트 추출: [tools/extract-9000-meeting-dom.cjs](</D:/Lucas Core v0.1/tools/extract-9000-meeting-dom.cjs:1>)

## 1. 증적 폴더 생성

```powershell
$Root = "D:\Lucas Core v0.1"
$Evidence = Join-Path $Root ("workspaces\developer-4\repo\tmp\meeting-first-qa-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null
$Evidence
```

생성되어야 하는 기본 산출물:

- `01-git-status.txt`
- `02-9001-pid-before.txt`
- `03-web-test.txt`
- `04-web-build.txt`
- `05-9000-meeting-ultra-wide.png`
- `05-9000-meeting-desktop.png`
- `05-9000-meeting-laptop.png`
- `05-9000-meeting-mobile.png`
- `05-9000-meeting-console.json`
- `05-9000-meeting-summary.txt`
- `06-9000-meeting-dom.json`
- `06-9000-meeting-dom.txt`
- `07-browser-cleanup.txt`
- `08-9001-pid-after.txt`
- `09-pass-fail-template.md`

## 2. `9001` PID 동결

```powershell
Set-Location "D:\Lucas Core v0.1"
git status --short | Out-File -Encoding utf8 "$Evidence\01-git-status.txt"

$Api9001 = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001 | Select-Object Id,ProcessName,Path,StartTime |
  Format-List | Out-String | Out-File -Encoding utf8 "$Evidence\02-9001-pid-before.txt"
```

## 3. `apps/web` 테스트/빌드

```powershell
Set-Location "D:\Lucas Core v0.1\apps\web"
node --experimental-strip-types --test src/terminalPrompt.test.ts src/terminalReplay.test.ts src/terminalSurface.test.ts src/terminalTileFooter.test.ts `
  *>&1 | Tee-Object -FilePath "$Evidence\03-web-test.txt"

$bun = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter bun.exe | Select-Object -First 1 -ExpandProperty FullName)
cmd /c ('"' + $bun + '" run build > "' + "$Evidence\04-web-build.txt" + '" 2>&1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

## 4. CDP 런타임 준비

이 단계는 evidence 폴더 내부에만 `playwright-core`를 임시 설치한다.

```powershell
Set-Location $Evidence
if (-not (Test-Path "$Evidence\package.json")) { npm init -y *> $null }
npm install playwright-core --no-save
```

## 5. `9000` 미팅 화면 스크린샷 + 콘솔 확인

아래 명령은 초광폭/데스크톱/노트북/모바일 4개 해상도 스크린샷과 콘솔/페이지 에러 JSON을 남긴다.

```powershell
Set-Location $Evidence
node "D:\Lucas Core v0.1\tools\capture-page-cdp.cjs" `
  --url "http://127.0.0.1:9000" `
  --out-dir "$Evidence" `
  --prefix "05-9000-meeting" `
  --expect-text "meeting" `
  --expect-text "message" `
  --viewport "ultra-wide=2560x1440" `
  --viewport "desktop=1600x1200" `
  --viewport "laptop=1440x900" `
  --viewport "mobile=390x844"
```

주의:

- 현재 화면이 영문이 아니면 `--expect-text`는 실제 보이는 문자열로 바꿔서 실행한다.
- 예: `"회의"`, `"채널"`, `"메시지"`, `"결정"`, `"액션"`

핵심 산출물:

- `05-9000-meeting-*.png`
- `05-9000-meeting-console.json`
- `05-9000-meeting-summary.txt`

## 6. `9000` 미팅 DOM 텍스트 증적

이 단계는 실제 body text를 저장하고, 채널/회의 목록/메시지/결정/액션 아이템 관련 키워드 라인을 뽑아낸다.

```powershell
Set-Location $Evidence
node "D:\Lucas Core v0.1\tools\extract-9000-meeting-dom.cjs" `
  --out-dir "$Evidence" `
  --url "http://127.0.0.1:9000" `
  --expect-text "channel" `
  --expect-text "meeting" `
  --expect-text "message"
```

화면이 한글이면 이렇게 바꿔서 실행:

```powershell
Set-Location $Evidence
node "D:\Lucas Core v0.1\tools\extract-9000-meeting-dom.cjs" `
  --out-dir "$Evidence" `
  --url "http://127.0.0.1:9000" `
  --expect-text "채널" `
  --expect-text "회의" `
  --expect-text "메시지" `
  --expect-text "결정" `
  --expect-text "액션"
```

핵심 산출물:

- `06-9000-meeting-dom.json`
- `06-9000-meeting-dom.txt`

이 파일에는 다음이 들어간다:

- 전체 body text
- 앞부분 샘플 라인
- 기대 텍스트 포함 여부
- `channel`, `meetingList`, `messages`, `decisions`, `actionItems` 키워드 매칭 라인
- 콘솔 에러 수
- 페이지 에러 수

## 7. CDP 사용 후 브라우저 정리 확인

준비된 스크립트는 자체 종료하지만, evidence 경로에 묶인 브라우저 프로세스가 남지 않았는지 확인한다.

```powershell
$EscapedEvidence = [Regex]::Escape($Evidence)
Get-CimInstance Win32_Process |
  Where-Object {
    ($_.Name -match 'chrome|msedge') -and
    $_.CommandLine -match $EscapedEvidence
  } |
  Select-Object ProcessId,Name,CommandLine |
  Format-List | Out-String | Out-File -Encoding utf8 "$Evidence\07-browser-cleanup.txt"
```

## 8. `9001` PID 사후 확인

```powershell
$Api9001After = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001After | Select-Object Id,ProcessName,Path,StartTime |
  Format-List | Out-String | Out-File -Encoding utf8 "$Evidence\08-9001-pid-after.txt"

if ($Api9001After -ne $Api9001) {
  throw "9001 PID changed: before=$Api9001 after=$Api9001After"
}
```

## 9. PASS/FAIL 템플릿

아래 내용을 `$Evidence\09-pass-fail-template.md`로 저장한다.

```md
# 미팅 우선 QA/CDP 결과

- 검증 일시:
- 패치 범위:
- 증적 경로:
- 9001 PID before:
- 9001 PID after:
- web test: PASS|FAIL
- web build: PASS|FAIL
- 9000 스크린샷 4종: PASS|FAIL
- 9000 콘솔 에러 체크: PASS|FAIL
- 9000 DOM 텍스트 체크: PASS|FAIL
- 채널 텍스트 확인: PASS|FAIL
- 회의 목록 텍스트 확인: PASS|FAIL
- 메시지 텍스트 확인: PASS|FAIL
- 결정 텍스트 확인: PASS|FAIL
- 액션 아이템 텍스트 확인: PASS|FAIL
- 브라우저/CDP 정리: PASS|FAIL
- blocker:
- 다음 조치:
```

## 10. 합격 기준

- `03-web-test.txt` 통과
- `04-web-build.txt` 통과
- `05-9000-meeting-console.json`에서 console `error = 0`, page error `= 0`
- `05-9000-meeting-*.png` 4장 모두 존재
- `06-9000-meeting-dom.json`에서 기대 텍스트가 모두 `found=true`
- `08-9001-pid-after.txt`의 PID가 `02-9001-pid-before.txt`와 동일
- `07-browser-cleanup.txt`에 evidence 경로를 물고 있는 브라우저 프로세스가 남지 않음

## 11. 주의사항

- 현재 제품에 아직 meeting 전용 UI가 완전히 없으면, `--expect-text`는 오늘 실제 보이는 미팅 관련 문자열로 바꿔야 한다.
- 이 문서는 실행 명령 고정용이다. 실제 실행은 패치가 준비된 시점에 한다.
