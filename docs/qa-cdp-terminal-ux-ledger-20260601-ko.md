# 터미널 UX + 9100 원장 QA/CDP 체크리스트

날짜: `2026-06-01`

범위:

- `9000` 터미널 popout
- `9000` 세로/가로/그리드 배치
- `9000` 개행 입력: `Shift+Enter` 개행 유지, `Enter` submit
- `9100` 원장 정상성: 응답, 화면 텍스트, 스크린샷, 콘솔

전제:

- `9001`은 재시작/종료 금지
- 실행은 패치 준비 후 수행
- 브라우저 자동화는 evidence 폴더 안의 임시 `playwright-core`를 사용

준비된 스크립트:

- [tools/check-9000-terminal-ux-cdp.cjs](</D:/Lucas Core v0.1/tools/check-9000-terminal-ux-cdp.cjs:1>)
- [tools/capture-page-cdp.cjs](</D:/Lucas Core v0.1/tools/capture-page-cdp.cjs:1>)

## 체크리스트

### 1. `9000` 터미널 popout

- [ ] 카드 액션에서 popout이 실제 새 페이지로 열린다
- [ ] popout URL에 `?popout=<sessionId>`가 포함된다
- [ ] popout 화면에 세션명/상태/입력창이 보인다
- [ ] popout 스크린샷을 남긴다

### 2. `9000` 세로/가로/그리드 배치

- [ ] `세로` 버튼 클릭 시 `.terminal-grid.stack`가 적용된다
- [ ] `가로` 버튼 클릭 시 `.terminal-grid.columns`가 적용된다
- [ ] `그리드` 버튼 클릭 시 기본 grid 클래스로 돌아온다
- [ ] 각 모드별 스크린샷을 남긴다

### 3. `9000` 개행 입력

- [ ] 카드 footer 입력창에 `Shift+Enter` 시 줄바꿈이 남는다
- [ ] 같은 입력창에서 `Enter` 시 submit되고 입력창이 비워진다
- [ ] 개행 입력 상태 스크린샷과 before/after 값을 남긴다

### 4. `9100` 원장 정상성

- [ ] `http://127.0.0.1:9100`이 `200` 응답
- [ ] 화면에 `CEO 지시 원장` 텍스트가 보인다
- [ ] 반응형 스크린샷 4종을 남긴다
- [ ] 콘솔 `error`와 page error가 없어야 한다
- [ ] CDP 종료 후 evidence 경로에 묶인 브라우저 프로세스가 남지 않아야 한다

## 증적 경로 생성

```powershell
$Root = "D:\Lucas Core v0.1"
$Evidence = Join-Path $Root ("workspaces\developer-4\repo\tmp\terminal-ux-ledger-qa-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null
$Evidence
```

## `9001` PID before/after

```powershell
$Api9001 = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001 | Select-Object Id,ProcessName,Path,StartTime |
  Format-List | Out-String | Out-File -Encoding utf8 "$Evidence\01-9001-pid-before.txt"
```

```powershell
$Api9001After = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001After | Select-Object Id,ProcessName,Path,StartTime |
  Format-List | Out-String | Out-File -Encoding utf8 "$Evidence\09-9001-pid-after.txt"
if ($Api9001After -ne $Api9001) {
  throw "9001 PID changed: before=$Api9001 after=$Api9001After"
}
```

## 임시 CDP 런타임 준비

```powershell
Set-Location $Evidence
if (-not (Test-Path "$Evidence\package.json")) { npm init -y *> $null }
npm install playwright-core --no-save
```

## `9000` 터미널 UX 검증 명령

사전조건:

- 카드가 보이는 세션이 하나 이상 있어야 한다
- 개행/submit 검증용 세션명은 기본값 `scrollback-check-2`

```powershell
Set-Location $Evidence
node "D:\Lucas Core v0.1\tools\check-9000-terminal-ux-cdp.cjs" `
  --out-dir "$Evidence" `
  --url "http://127.0.0.1:9000" `
  --session-name "scrollback-check-2"
```

산출물:

- `9000-terminal-layout-stack.png`
- `9000-terminal-layout-columns.png`
- `9000-terminal-layout-grid.png`
- `9000-terminal-newline.png`
- `9000-terminal-popout.png`
- `9000-terminal-ux.json`
- `9000-terminal-ux-summary.txt`

## `9100` 원장 정상성 검증 명령

```powershell
Set-Location $Evidence
node "D:\Lucas Core v0.1\tools\capture-page-cdp.cjs" `
  --url "http://127.0.0.1:9100" `
  --out-dir "$Evidence" `
  --prefix "9100-ledger" `
  --expect-text "CEO 지시 원장" `
  --viewport "ultra-wide=2560x1440" `
  --viewport "desktop=1600x1200" `
  --viewport "laptop=1440x900" `
  --viewport "mobile=390x844"
```

산출물:

- `9100-ledger-ultra-wide.png`
- `9100-ledger-desktop.png`
- `9100-ledger-laptop.png`
- `9100-ledger-mobile.png`
- `9100-ledger-console.json`
- `9100-ledger-summary.txt`

## `9100` HTTP 응답 기록

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:9100" |
  Select-Object StatusCode,Headers |
  Format-List | Out-String | Out-File -Encoding utf8 "$Evidence\08-9100-http.txt"
```

## 브라우저/CDP 정리 확인

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

## PASS / FAIL 템플릿

```md
# 터미널 UX / 9100 원장 QA 결과

- 검증 일시:
- 패치 범위:
- 증적 경로:
- 9001 PID before:
- 9001 PID after:
- popout: PASS|FAIL
- 세로 배치: PASS|FAIL
- 가로 배치: PASS|FAIL
- 그리드 복귀: PASS|FAIL
- Shift+Enter 개행 유지: PASS|FAIL
- Enter submit 후 입력창 비움: PASS|FAIL
- 9100 HTTP 200: PASS|FAIL
- 9100 반응형 스크린샷: PASS|FAIL
- 9100 콘솔 에러 없음: PASS|FAIL
- 브라우저 정리: PASS|FAIL
- blocker:
- 다음 조치:
```
