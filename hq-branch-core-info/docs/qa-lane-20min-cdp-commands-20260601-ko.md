# QA Lane 20분 스프린트 CDP 명령서

날짜:
- `2026-06-01`

범위:
- `Meeting MVP`
- `sidebar Development Team 9/9`
- `tab layout 독립`

증거 루트:
- `D:\Lucas Core v0.1\workspaces\developer-4\repo\tmp\qa-lane-20min-20260601-023200\`

## 1. 공통 준비

```powershell
$Root = "D:\Lucas Core v0.1"
$Repo = "D:\Lucas Core v0.1\workspaces\developer-4\repo"
$Evidence = "$Repo\tmp\qa-lane-20min-20260601-023200"
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null

$Api9001 = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001 | Select-Object Id,ProcessName,Path,StartTime | Format-List *> "$Evidence\01-9001-pid-before.txt"
```

```powershell
Set-Location "$Root\apps\web"
node --experimental-strip-types --test src/terminalPrompt.test.ts src/terminalReplay.test.ts src/terminalSurface.test.ts src/terminalTileFooter.test.ts *> "$Evidence\02-web-test.txt"
$bun = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter bun.exe | Select-Object -First 1 -ExpandProperty FullName)
cmd /c ('"' + $bun + '" run build') *> "$Evidence\03-web-build.txt"
```

```powershell
Set-Location $Repo
if (-not (Test-Path "$Evidence\package.json")) { npm init -y *> $null }
npm install playwright-core --no-save
```

## 2. Meeting MVP

```powershell
Set-Location $Root
node "$Root\tools\extract-9000-meeting-dom.cjs" --out-dir "$Evidence" --url "http://127.0.0.1:9000" --expect-text "channel" --expect-text "messages" --expect-text "decisions" --expect-text "action" --expect-text "ledger"
node "$Root\tools\capture-page-cdp.cjs" --url "http://127.0.0.1:9000" --out-dir "$Evidence" --prefix "04-meeting-mvp" --viewport "desktop=1600x1200"
Move-Item -LiteralPath "$Evidence\04-meeting-mvp-desktop.png" -Destination "$Evidence\04-meeting-mvp.png" -Force
Move-Item -LiteralPath "$Evidence\04-meeting-mvp-console.json" -Destination "$Evidence\05-meeting-console.json" -Force
Move-Item -LiteralPath "$Evidence\06-9000-meeting-dom.json" -Destination "$Evidence\06-meeting-dom.json" -Force
Move-Item -LiteralPath "$Evidence\06-9000-meeting-dom.txt" -Destination "$Evidence\06b-meeting-dom.txt" -Force
```

판정:
- `04-meeting-mvp.png`
- `05-meeting-console.json`
- `06-meeting-dom.json`
- `06b-meeting-dom.txt`

## 3. Sidebar Development Team 9/9

```powershell
Set-Location $Evidence
@'
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const outDir = process.cwd();
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const consoleEvents = [];
const pageErrors = [];
page.on("console", (m) => consoleEvents.push({ type: m.type(), text: m.text() }));
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto("http://127.0.0.1:9000", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2500);

const filterButton = page.locator("button").filter({ hasText: /Development Team/i }).first();
await filterButton.click();
await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const cardTexts = [...document.querySelectorAll("article, [data-session-id], .agent-card, .terminal-card")]
    .map((el) => el.textContent || "")
    .filter(Boolean);
  const names = ["Dev Lead","developer-1","developer-2","developer-3","developer-4","developer-5","developer-6","developer-7","developer-8"];
  const found = names.filter((name) => cardTexts.some((text) => text.includes(name)));
  const excluded = {
    chiefMinPresent: cardTexts.some((text) => text.includes("Chief Min")),
    androidTesterPresent: cardTexts.some((text) => text.includes("android-tester")),
  };
  const bodyText = document.body.innerText;
  return { found, expectedCount: names.length, foundCount: found.length, excluded, bodyText };
});

await page.screenshot({ path: path.join(outDir, "07-development-team.png"), fullPage: true });
fs.writeFileSync(path.join(outDir, "08-development-team-console.json"), JSON.stringify({ consoleEvents, pageErrors }, null, 2));
fs.writeFileSync(path.join(outDir, "09-development-team-dom.json"), JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(outDir, "09b-development-team-dom.txt"), result.bodyText);
await browser.close();
'@ | node -
```

판정:
- `07-development-team.png`
- `08-development-team-console.json`
- `09-development-team-dom.json`
- `09b-development-team-dom.txt`
- 기대값:
  - `foundCount = 9`
  - `chiefMinPresent = false`
  - `androidTesterPresent = false`

## 4. Tab layout 독립

```powershell
Set-Location $Evidence
@'
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const outDir = process.cwd();
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const context = await browser.newContext();
const tabA = await context.newPage();
const tabB = await context.newPage();
const logs = { tabA: { console: [], errors: [] }, tabB: { console: [], errors: [] } };

tabA.on("console", (m) => logs.tabA.console.push({ type: m.type(), text: m.text() }));
tabA.on("pageerror", (e) => logs.tabA.errors.push(String(e)));
tabB.on("console", (m) => logs.tabB.console.push({ type: m.type(), text: m.text() }));
tabB.on("pageerror", (e) => logs.tabB.errors.push(String(e)));

await tabA.goto("http://127.0.0.1:9000", { waitUntil: "networkidle", timeout: 30000 });
await tabB.goto("http://127.0.0.1:9000", { waitUntil: "networkidle", timeout: 30000 });
await tabA.waitForTimeout(2000);
await tabB.waitForTimeout(2000);

const androidButton = tabA.locator("button").filter({ hasText: /android/i }).first();
const developmentButton = tabB.locator("button").filter({ hasText: /development/i }).first();
if (await androidButton.count()) { await androidButton.click(); await tabA.waitForTimeout(700); }
if (await developmentButton.count()) { await developmentButton.click(); await tabB.waitForTimeout(700); }

const stateA = await tabA.evaluate(() => ({
  origin: location.origin,
  title: document.title,
  bodyText: document.body.innerText,
  sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
  localStorage: Object.fromEntries(Object.entries(localStorage)),
}));
const stateB = await tabB.evaluate(() => ({
  origin: location.origin,
  title: document.title,
  bodyText: document.body.innerText,
  sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
  localStorage: Object.fromEntries(Object.entries(localStorage)),
}));

await tabA.screenshot({ path: path.join(outDir, "10-tab-a-android.png"), fullPage: true });
await tabB.screenshot({ path: path.join(outDir, "11-tab-b-development.png"), fullPage: true });
fs.writeFileSync(path.join(outDir, "12-tab-layout-console.json"), JSON.stringify(logs, null, 2));
fs.writeFileSync(path.join(outDir, "13-tab-a-state.json"), JSON.stringify(stateA, null, 2));
fs.writeFileSync(path.join(outDir, "14-tab-b-state.json"), JSON.stringify(stateB, null, 2));
await browser.close();
'@ | node -
```

판정:
- `10-tab-a-android.png`
- `11-tab-b-development.png`
- `12-tab-layout-console.json`
- `13-tab-a-state.json`
- `14-tab-b-state.json`
- 기대값:
  - `stateA.origin = http://127.0.0.1:9000`
  - `stateB.origin = http://127.0.0.1:9000`
  - tab A와 tab B의 storage/state가 서로 덮어쓰지 않음

## 5. 종료와 PID 확인

```powershell
Get-Process chrome -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime | Format-Table -AutoSize *> "$Evidence\15-browser-cleanup.txt"

$Api9001After = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001After | Select-Object Id,ProcessName,Path,StartTime | Format-List *> "$Evidence\16-9001-pid-after.txt"
if ($Api9001After -ne $Api9001) { throw "9001 PID changed: before=$Api9001 after=$Api9001After" }
```

최종 PASS 기준:
- `web test/build` 통과
- `Meeting MVP` DOM 텍스트와 스크린샷 확보
- `Development Team` 9/9 확인
- `tab layout` 2탭 스크린샷과 storage/state 분리 확인
- `9001 PID` unchanged
