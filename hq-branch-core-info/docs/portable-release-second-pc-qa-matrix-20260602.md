# Portable Release Second-PC QA Matrix

Date: 2026-06-02 KST

Task: `portable-release-20260603`
Owner: `developer-4`
Scope: second-PC dry run for clone, install, build, start, health, ledger, memory, and UI smoke.

## Evidence Root

Create one release evidence root on the second PC before starting:

- `data/system-logs/portable-release-second-pc-20260603/`

Required subpaths:

- `data/system-logs/portable-release-second-pc-20260603/commands/`
- `data/system-logs/portable-release-second-pc-20260603/api/`
- `data/system-logs/portable-release-second-pc-20260603/ui/`
- `data/system-logs/portable-release-second-pc-20260603/screens/`

## Matrix

| Step | Check | Command / Action | Pass Criteria | Fail Signal | Evidence Path |
| --- | --- | --- | --- | --- | --- |
| 1 | Fresh clone | `git clone <repo> LucasCore-portable-test` | Clone succeeds with expected branch/commit available | Clone/auth/path failure | `commands/01-clone.txt` |
| 2 | Repo hygiene | `git status --short` | No unexpected generated/runtime files immediately after clone | Dirty tree before local run | `commands/02-git-status.txt` |
| 3 | Tool prerequisites | `git --version`, `cargo --version`, `node --version`, `npm --version`, `bun --version` if used, Codex CLI presence | Required tools resolve; missing optional tools are documented | Missing required bootstrap/build tool | `commands/03-prereqs.txt` |
| 4 | Web deps install | `npm --prefix apps/web install` or project-approved install path | Install exits `0` | Lock/dependency/install error | `commands/04-web-install.txt` |
| 5 | API deps/build readiness | `cargo check --manifest-path apps/api/Cargo.toml` | Exit `0` | Compile or environment error | `commands/05-api-cargo-check.txt` |
| 6 | Web build | `npm --prefix apps/web run build` | Exit `0`; warnings noted separately | Build failure | `commands/06-web-build.txt` |
| 7 | Start 9000/9001 | `.\scripts\start-lcc-core.ps1 -SkipAgentBootstrap` | Script starts web/API without machine-specific path edits | Script crash, path binding failure, missing env | `commands/07-start-core.txt` |
| 8 | Port listen | Check listeners for `9000` and `9001` | Both ports listening on expected host | Missing listener or wrong port owner | `commands/08-port-listen.txt` |
| 9 | API health | `GET /api/health` on `9001` | HTTP `200` and healthy payload | Non-200, timeout, missing route | `api/09-health.json` |
| 10 | Work ledger | `GET /api/work-ledger` | HTTP `200`; tasks/events readable | Non-200, empty/malformed payload, parse error | `api/10-work-ledger.json` |
| 11 | Memory list baseline | `GET /api/memory` before write | HTTP `200`; route available; path points to `data/memory-ledger.jsonl` or local equivalent | `404`, `500`, or wrong path behavior | `api/11-memory-get-before.json` |
| 12 | Memory append | `POST /api/memory` with Korean UTF-8 payload | HTTP `201`; returned topic/content match request | `4xx/5xx`, mojibake in raw response, missing file write | `api/12-memory-post.json` |
| 13 | Memory search | `GET /api/memory?agent_id=developer-4&search=<korean>` | HTTP `200`; appended record returned | Missing search hit or encoding mismatch | `api/13-memory-search.json` |
| 14 | Memory recover | `GET /api/memory/recover/developer-4?limit=5` | HTTP `200`; personal memories plus active ledger/recent events present | Missing personal memory, empty recovery contract, parse error | `api/14-memory-recover.json` |
| 15 | Invalid memory input | POST bad layer, missing content, malformed JSON | All invalid requests rejected with `400` | Unexpected success or wrong error class | `api/15-memory-invalid-*.txt` |
| 16 | Memory file creation | Inspect `data/memory-ledger.jsonl` | File exists after append; readable UTF-8 content present | File absent, unreadable, or corrupted | `api/16-memory-ledger.txt` |
| 17 | Caesar/Max bootstrap readiness | Confirm 9001 healthy before manager bootstrap; then run approved bootstrap step if assigned | Bootstrap precondition documented; no hidden manual repair needed | Requires ad hoc local edits or restart loops | `commands/17-bootstrap-readiness.txt` |
| 18 | 9000 UI load | Open `http://127.0.0.1:9000` | Page renders without blocking errors | Blank page, connect loop, fatal overlay | `screens/18-home.png` |
| 19 | Console check | Browser console on initial load | No fatal console errors; warnings noted | Unhandled exceptions or failed API/WS bootstrap | `ui/19-console.txt` |
| 20 | DOM/text check | Verify visible shell text and terminal/operator UI landmarks | Expected app shell text present; not raw error page | Missing UI regions or fallback error screen | `ui/20-dom.txt` |
| 21 | Work-ledger UI smoke | Navigate to ledger-related view if present | Ledger data visible or explicitly API-only if no panel exists | UI claims success while ledger/API missing | `screens/21-work-ledger.png` |
| 22 | Memory UI smoke | If memory/recovery panel exists in patch, verify render plus console | Panel visible and reflects recovery/API state | Missing panel, broken fetch, console errors | `screens/22-memory-panel.png`, `ui/22-memory-console.txt` |
| 23 | Shutdown note | Record whether temporary QA browser/processes were closed | No stray QA-only process left running | QA leaves extra debug/browser listeners | `commands/23-cleanup.txt` |

## Required Korean UTF-8 Smoke Payload

Use this payload for memory append/search:

```json
{
  "agent_id": "developer-4",
  "layer": "working",
  "scope": "personal",
  "kind": "qa-note",
  "topic": "포터블 릴리스 QA",
  "content": "두 번째 PC에서 한글 UTF-8 메모리 저장과 복구를 검증합니다.",
  "importance": 8,
  "source": "portable-release-qa",
  "source_id": "portable-release-20260603",
  "ledger_item": "portable-release-20260603",
  "evidence_path": "data/system-logs/portable-release-second-pc-20260603/api",
  "tags": ["portable", "qa", "utf8"]
}
```

Search probe:

- `GET /api/memory?agent_id=developer-4&search=%ED%95%9C%EA%B8%80`

## Invalid Input Set

Capture raw request/response for:

- Bad layer: `layer=broken`
- Missing content
- Malformed JSON body

Expected result:

- HTTP `400` for all three

## Screenshot / Console Rules

- Capture at least one desktop viewport note, for example `1440x900` or actual second-PC size.
- Save one main app screenshot after initial render.
- Save one screenshot after ledger/memory smoke if the UI exposes those surfaces.
- Export console output to text even when empty; write `consoleErrors=0` explicitly.

## Pass / Fail Summary Template

```text
REPORT portable-release agent=developer-4 status=<doing|blocked|done> evidence=docs/portable-release-second-pc-qa-matrix-20260602.md;data/system-logs/portable-release-second-pc-20260603 blocker=<none|exact blocker> next=<action>
```

Pass conditions:

- Steps 1 through 20 pass.
- Step 21 passes when applicable, or is marked `API-only / not in current UI scope`.
- Step 22 is required only if a memory UI patch exists.

Fail conditions:

- Any clone/install/build/start/health failure.
- `9001` requires machine-specific path editing.
- Memory API missing on the tested runtime.
- Korean UTF-8 payload cannot round-trip.
- Console shows fatal startup errors.
