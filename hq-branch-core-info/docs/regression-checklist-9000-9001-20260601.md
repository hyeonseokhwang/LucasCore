# Stable Lane Regression Checklist

Date: 2026-06-01

Owner: verification

Scope:

- web tests and build
- CDP console check
- screenshot on `9000`
- terminal render and scrollback check
- API and WS origin to `9001`
- `9001` PID unchanged across verification

Constraints:

- Do not restart or kill the live `9001` API process during this checklist.
- Stable lane contract is `9000` for Web UI and `9001` for Agent/API.
- UI commits require screenshot and CDP console evidence where feasible.

Source anchors:

- Stable ports and injected origins: [scripts/start-lcc-core.ps1](</D:/Lucas Core v0.1/scripts/start-lcc-core.ps1:2>), [scripts/dev-web.ps1](</D:/Lucas Core v0.1/scripts/dev-web.ps1:2>)
- Web API and WS origin resolution: [apps/web/src/main.tsx](</D:/Lucas Core v0.1/apps/web/src/main.tsx:87>)
- Terminal scrollback target `300`: [apps/web/src/main.tsx](</D:/Lucas Core v0.1/apps/web/src/main.tsx:1393>), [apps/web/src/main.tsx](</D:/Lucas Core v0.1/apps/web/src/main.tsx:1551>)
- Terminal viewport scrollbar behavior: [apps/web/src/styles.css](</D:/Lucas Core v0.1/apps/web/src/styles.css:1332>), [apps/web/src/styles.css](</D:/Lucas Core v0.1/apps/web/src/styles.css:1378>), [apps/web/src/styles.css](</D:/Lucas Core v0.1/apps/web/src/styles.css:1519>)
- `9001` API default bind: [scripts/dev-api.ps1](</D:/Lucas Core v0.1/scripts/dev-api.ps1:10>), [apps/api/src/main.rs](</D:/Lucas Core v0.1/apps/api/src/main.rs:529>)
- Commit-gate policy for screenshot, CDP, `9001`, and scrollback: [data/branch-boot-context.md](</D:/Lucas Core v0.1/data/branch-boot-context.md:29>)

## Evidence Directory

Create one timestamped directory per run:

```powershell
$Root = "D:\Lucas Core v0.1"
$Evidence = Join-Path $Root "workspaces\developer-4\repo\tmp\regression-9000-9001-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null
$Evidence
```

Required artifacts before commit:

- `$Evidence\01-git-status.txt`
- `$Evidence\02-ports-before.txt`
- `$Evidence\03-9001-pid-before.txt`
- `$Evidence\04-web-test.txt`
- `$Evidence\05-web-build.txt`
- `$Evidence\06-api-health.txt`
- `$Evidence\07-sessions-headers.txt`
- `$Evidence\08-screenshot-9000.png`
- `$Evidence\09-cdp-targets.json`
- `$Evidence\10-cdp-console-note.txt`
- `$Evidence\11-terminal-scrollback-note.txt`
- `$Evidence\12-ports-after.txt`
- `$Evidence\13-9001-pid-after.txt`

## Baseline Capture

Run these first and do not recycle the `9001` process:

```powershell
Set-Location "D:\Lucas Core v0.1"
git status --short | Out-File -Encoding utf8 "$Evidence\01-git-status.txt"

Get-NetTCPConnection -LocalPort 9000,9001 -State Listen |
  Select-Object LocalPort, OwningProcess, State |
  Sort-Object LocalPort |
  Format-Table -AutoSize |
  Out-String | Out-File -Encoding utf8 "$Evidence\02-ports-before.txt"

$Api9001 = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001 | Select-Object Id, ProcessName, Path, StartTime |
  Format-List | Out-String | Out-File -Encoding utf8 "$Evidence\03-9001-pid-before.txt"
```

Pass criteria:

- `9000` and `9001` are both listening.
- `9001` is owned by the expected API process.
- The `9001` PID and `StartTime` become the frozen baseline for the rest of the run.

## Web Tests And Build

These are safe to run without touching the `9001` process:

```powershell
Set-Location "D:\Lucas Core v0.1\apps\web"
node --experimental-strip-types --test src/terminalPrompt.test.ts src/terminalReplay.test.ts src/terminalSurface.test.ts src/terminalTileFooter.test.ts `
  *>&1 | Tee-Object -FilePath "$Evidence\04-web-test.txt"

bun run build *>&1 | Tee-Object -FilePath "$Evidence\05-web-build.txt"
```

Pass criteria:

- All listed Node tests pass.
- Vite build completes without error.

## API And WS Origin To 9001

The web launcher injects explicit `9001` origins, and the app falls back to those env values before `window.location.origin`. Verify both the HTTP side and the browser-observed side.

HTTP baseline:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:9001/api/health" |
  Select-Object StatusCode, Content |
  Format-List | Out-String | Out-File -Encoding utf8 "$Evidence\06-api-health.txt"

Invoke-WebRequest -Uri "http://127.0.0.1:9001/api/sessions" |
  Select-Object StatusCode, Headers |
  Format-List | Out-String | Out-File -Encoding utf8 "$Evidence\07-sessions-headers.txt"
```

Browser launch for stable lane verification:

```powershell
$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$ChromeProfile = Join-Path $Evidence "chrome-profile"
New-Item -ItemType Directory -Force -Path $ChromeProfile | Out-Null

Start-Process -FilePath $Chrome -ArgumentList @(
  "--user-data-dir=$ChromeProfile",
  "--remote-debugging-port=9222",
  "--new-window",
  "http://127.0.0.1:9000"
)

Invoke-WebRequest -Uri "http://127.0.0.1:9222/json/list" -UseBasicParsing |
  Select-Object -ExpandProperty Content |
  Out-File -Encoding utf8 "$Evidence\09-cdp-targets.json"
```

Manual CDP checks in DevTools:

1. Open `http://127.0.0.1:9222/json/list`.
2. Copy the `devtoolsFrontendUrl` for the `http://127.0.0.1:9000` page target into Chrome.
3. In Network, confirm `/api/*` requests go to `http://127.0.0.1:9001`.
4. Confirm the terminal socket connects to `ws://127.0.0.1:9001/ws/terminal`.
5. In Console, confirm there are no red errors caused by origin mismatch, failed fetches, or failed WebSocket connection.
6. Save a short note to `$Evidence\10-cdp-console-note.txt` with the observed API origin, WS origin, and whether the console was clean.

Minimum note template:

```text
Page target: http://127.0.0.1:9000
Observed API origin: http://127.0.0.1:9001
Observed WS origin: ws://127.0.0.1:9001/ws/terminal
Console: clean
Network mismatches: none
Verifier timestamp:
```

## Screenshot On 9000

Use headless Chrome to capture the current stable-lane page:

```powershell
$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
& $Chrome `
  --headless `
  --disable-gpu `
  --window-size=1600,1200 `
  --screenshot="$Evidence\08-screenshot-9000.png" `
  "http://127.0.0.1:9000"
```

Pass criteria:

- The file exists and shows the actual `9000` UI state.
- No token or secret is visible in the screenshot.

## Terminal Render And Scrollback

Why this matters:

- The product policy requires terminal card upward review of about `300` lines.
- The current implementation sets `scrollback: 300` for both preview and log terminals and forces viewport scrolling in CSS.

Manual verification steps:

1. In the `9000` UI, open a live terminal card and then fullscreen for the same session.
2. Produce more than `300` lines of output in a non-critical session.
3. Use mouse wheel and scrollbar in the card preview, log modal, and fullscreen terminal.
4. Confirm older lines are reachable up to the retained tail window and the viewport still scrolls naturally.
5. Confirm the browser stays responsive and does not attempt unlimited in-memory replay.

Optional safe helper for a disposable session on `9001`:

```powershell
$body = @{
  id = "scrollback-check"
  name = "scrollback-check"
  team = "qa"
  cwd = "workspaces/developer-4/repo"
  cmd = "python"
  args = @(
    "-c",
    "import sys,time; [sys.stdout.write(f'SCROLL {i:04d}\\n') for i in range(450)]"
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:9001/api/sessions" `
  -Method Post -ContentType "application/json" -Body $body
```

Required note in `$Evidence\11-terminal-scrollback-note.txt`:

```text
Session checked:
Card preview scroll:
Fullscreen scroll:
Log modal scroll:
Approx visible upward review:
Wheel behavior:
Scrollbar behavior:
Browser responsiveness:
```

## 9001 PID Unchanged

Run this last:

```powershell
Get-NetTCPConnection -LocalPort 9000,9001 -State Listen |
  Select-Object LocalPort, OwningProcess, State |
  Sort-Object LocalPort |
  Format-Table -AutoSize |
  Out-String | Out-File -Encoding utf8 "$Evidence\12-ports-after.txt"

$Api9001After = Get-NetTCPConnection -LocalPort 9001 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess
Get-Process -Id $Api9001After | Select-Object Id, ProcessName, Path, StartTime |
  Format-List | Out-String | Out-File -Encoding utf8 "$Evidence\13-9001-pid-after.txt"

if ($Api9001After -ne $Api9001) {
  throw "9001 PID changed: before=$Api9001 after=$Api9001After"
}
```

Pass criteria:

- `9001` PID is identical before and after verification.
- `Path` and `StartTime` remain the same.

## Blockers

Current blockers for full automation:

- No repo-owned CDP client or browser-smoke script is present, so console and network-origin validation are manual even though Chrome remote debugging is available.
- Browser executables are installed but not on `PATH`; use explicit executable paths such as `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Screenshot capture is automatable with headless Chrome, but a CDP console export still requires either manual DevTools review or adding a dedicated CDP automation script to the repo.

## Commit Gate

Do not approve a UI-related commit until all required artifact files exist under the same `$Evidence` directory and the `9001` PID comparison passes.
