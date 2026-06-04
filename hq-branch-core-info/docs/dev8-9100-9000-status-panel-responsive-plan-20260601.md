# Developer 8 Plan: 9100 Status Panel + 9000 Responsive Command Center

Date: 2026-06-01 KST

Owner: developer-8

Scope:

- `9100` CEO ledger `agent-status-on-9100`
- `9000` responsive command-center planning for terminal fleet
- Coordination target: developer-1 for terminal layout and scrollback-safe behavior
- Output is patch strategy and verification plan only

Constraints:

- No broad UI changes until Max accepts the plan.
- Preserve `9001` singleton backend behavior.
- Keep commit boundaries narrow and evidence-backed.

## Files Inspected

- Local:
  - [tools/ceo-ledger-board-server.cjs](</D:/Lucas Core v0.1/tools/ceo-ledger-board-server.cjs:1>)
  - [tools/capture-9100-cdp.cjs](</D:/Lucas Core v0.1/tools/capture-9100-cdp.cjs:1>)
  - [data/ceo-command-ledger.json](</D:/Lucas Core v0.1/data/ceo-command-ledger.json:1>)
  - [apps/web/src/main.tsx](</D:/Lucas Core v0.1/apps/web/src/main.tsx:1>)
  - [apps/web/src/styles.css](</D:/Lucas Core v0.1/apps/web/src/styles.css:1>)

- HQ reference:
  - `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\terminal-grid\SectionFilterTabs.tsx`
  - `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\TerminalTabs.tsx`
  - `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\TerminalTabBar.tsx`
  - `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\TerminalPanel.tsx`

## Current State

### 9100

- The board server reads directives from [data/ceo-command-ledger.json](</D:/Lucas Core v0.1/data/ceo-command-ledger.json:1>) and agent sessions from `http://127.0.0.1:9001/api/sessions`.
- The current agent card only shows:
  - name
  - status
  - model
  - cwd
  - interactive flag
  - last three cleaned preview lines
- The current panel does not explicitly show:
  - current task
  - blocker state
  - heartbeat freshness
  - recent update timestamp
  - stale/idle risk

Relevant local code:

- Agent fetch and render path: [tools/ceo-ledger-board-server.cjs](</D:/Lucas Core v0.1/tools/ceo-ledger-board-server.cjs:25>), [tools/ceo-ledger-board-server.cjs](</D:/Lucas Core v0.1/tools/ceo-ledger-board-server.cjs:91>)
- Directive source for `agent-status-on-9100`: [data/ceo-command-ledger.json](</D:/Lucas Core v0.1/data/ceo-command-ledger.json:232>)

### 9000

- The current terminal fleet uses a simple session count based grid:
  - `1` column for `1`
  - `2` columns for `2` to `4`
  - `3` columns for `5+`
- There is no explicit ultra-wide mode, no work/fleet/focus switcher, and no vertical-optimized lane mode.
- Fullscreen exists, but the base fleet page still defaults to uniform tiles.

Relevant local code:

- Grid column logic: [apps/web/src/main.tsx](</D:/Lucas Core v0.1/apps/web/src/main.tsx:1121>)
- Grid container CSS: [apps/web/src/styles.css](</D:/Lucas Core v0.1/apps/web/src/styles.css:1244>)
- Existing scrollable xterm viewport behavior: [apps/web/src/styles.css](</D:/Lucas Core v0.1/apps/web/src/styles.css:1331>)

## HQ Patterns Worth Reusing

### Pattern A: Filter-first control strip

HQ uses:

- section filter tabs
- workspace pills
- team pills
- lightweight search
- persistent local storage for filter state

Reference anchors:

- `SectionFilterTabs.tsx`
- `TerminalTabs.tsx`
- `TerminalTabBar.tsx`

Recommended reuse:

- add a small mode and grouping strip above the `9000` terminal fleet
- persist selected fleet mode and grouping in local storage
- avoid immediate deep layout rewrites until the mode contract is accepted

### Pattern B: Primary-focus surface over uniform tiles

HQ `TerminalTabs` and `TerminalPanel` prioritize one active session surface and treat navigation as a separate control layer.

Reference anchors:

- `TerminalTabs.tsx`
- `TerminalPanel.tsx`

Recommended reuse:

- for ultra-wide screens, stop treating every session as equal-size by default
- use one primary area plus supporting lanes
- keep fullscreen, but add a non-modal focus mode in the base fleet

### Pattern C: Status dots and mission text

HQ tab items show:

- connection status
- worker state
- mission text
- model badge

Reference anchor:

- `TerminalTabBar.tsx`

Recommended reuse:

- bring the same compact status language into the `9100` agent panel
- use this data for `9000` fleet cards only after Max accepts the surface contract

## Patch Strategy: Keep 9100 Ledger Current

### Step 1: Split directive truth from live agent truth

Keep `data/ceo-command-ledger.json` as the manual directive source, but do not use it as the source of live agent freshness.

Patch:

- keep directive cards from JSON
- derive agent heartbeat data live from `9001` sessions plus preview parsing
- optionally add a small `derivedAt` timestamp in the board server response

Why:

- directives are planned/manual
- agent freshness is operational/live
- mixing them in one handwritten JSON file causes drift

### Step 2: Parse heartbeat structure from preview text

Use the current PTY-visible reporting rule and parse the latest preview/log text for these patterns:

- `HEARTBEAT task=...`
- `status=...`
- `progress=...`
- `blocker=...`
- `next_action=...`

Patch:

- add a lightweight preview parser in `tools/ceo-ledger-board-server.cjs`
- prefer the most recent heartbeat line
- fall back to the cleaned preview summary when a heartbeat is absent

Expected fields on each agent card:

- current task
- status
- progress
- blocker
- next action
- preview summary

### Step 3: Add stale-state classification

Patch:

- compare `updated_at` from session data against current time
- classify cards into:
  - `fresh`
  - `warning`
  - `stale`

Suggested thresholds:

- `fresh`: updated within `3` minutes
- `warning`: `3` to `10` minutes
- `stale`: over `10` minutes

Visible indicators:

- freshness badge
- `last update` timestamp
- highlighted stale cards at the top

### Step 4: Add blocker-first ordering

Patch:

- sort 9100 agent cards by:
  1. blocked
  2. stale
  3. active but missing heartbeat
  4. fresh active
  5. idle/other

Why:

- CEO view should surface exceptions first, not alphabetical order

### Step 5: Keep 9100 artifact capture standardized

Continue using [tools/capture-9100-cdp.cjs](</D:/Lucas Core v0.1/tools/capture-9100-cdp.cjs:1>) as the `9100` proof path.

Patch:

- extend the report payload to include:
  - count of stale cards
  - count of blocked cards
  - count of cards missing heartbeat fields
  - screenshot timestamp

## Agent Heartbeat / Status Display Plan For 9100

Each agent card should show:

1. Identity row
   - agent name
   - connected/running status
   - freshness badge

2. Mission row
   - current task
   - progress
   - last update time

3. Risk row
   - blocker text or `none`
   - missing-heartbeat warning if no structured heartbeat is found

4. Context row
   - cwd
   - model
   - preview tail

5. Exception behavior
   - blocked cards: red border and top ordering
   - stale cards: amber border and top ordering
   - missing-heartbeat cards: muted warning badge

Minimum parsing contract:

```text
HEARTBEAT task=<text> status=<text> progress=<text> blocker=<text> next_action=<text>
```

If the preview does not contain that line:

- show `task unknown`
- show `heartbeat missing`
- preserve preview tail as fallback evidence

## 9100 Operational Monitoring Upgrade

Goal:

- make `idle`, `active`, `blocked`, and `next action` visible at a glance on `9100`
- make stale or non-reporting agents obvious before they become coordination failures

### Proposed Agent State Model

Map each agent into one of these board states:

1. `blocked`
   - latest structured heartbeat contains a non-empty blocker
   - or preview explicitly reports `blocked`

2. `active`
   - recent heartbeat exists
   - no blocker
   - current task is present

3. `idle`
   - session is connected/running
   - no blocker
   - no recent heartbeat task/progress signal

4. `stale`
   - session exists but `updated_at` is too old
   - this should visually override idle/active styling with warning emphasis

### Required Visible Fields Per Card

- agent name
- board state: `idle` | `active` | `blocked`
- last update time
- current task
- blocker
- next action
- preview fallback

### Parsing Priority

1. latest `HEARTBEAT ...`
2. latest `REPORT ... blocked ...`
3. latest `ACK ...`
4. preview fallback with `heartbeat missing`

### Visual Ordering

On `9100`, cards should sort in this order:

1. blocked
2. stale
3. active with missing next action
4. active
5. idle

### Header Summary Strip

Add a small summary strip above agent cards:

- blocked count
- stale count
- active count
- idle count
- missing-heartbeat count

This gives the operator an immediate board-level health read without reading each card.

### Immediate Patch Scope

Patch only these pieces first:

- heartbeat parser in `tools/ceo-ledger-board-server.cjs`
- derived board-state classifier
- agent card fields for task/blocker/next action/last update
- summary counts row

Do not expand into new remote APIs yet.

## Owner / Progress Low-Item Routing Table

Use this routing table when the `9100` panel sees low-signal or stalled states.

| Condition on 9100 | Primary owner | Secondary owner | Required panel label | Required next action |
|---|---|---|---|---|
| heartbeat fresh, blocker empty, task present | agent owner | Max | `active` | continue current task and refresh heartbeat |
| heartbeat missing, session still updating | agent owner | Max | `idle` | print structured heartbeat with task/progress/next action |
| blocker present in heartbeat | agent owner | Max | `blocked` | escalate blocker text and assign explicit next owner/action |
| `updated_at` stale over threshold | Max | agent owner | `stale` | inspect session preview/log, issue direct order, require heartbeat |
| next action missing but task active | agent owner | Max | `active-needs-next` | print next action in next heartbeat |
| session absent for assigned owner | Max | infra/admin if needed | `missing-session` | confirm whether agent should be respawned, reassigned, or marked stopped |
| 9001/API fetch failure on 9100 | infra/admin | Max | `panel-degraded` | restore session feed, keep directive cards visible, record degraded period |

Recommended progress buckets on `9100`:

- `0-24`: not meaningfully started
- `25-49`: active investigation or benchmark underway
- `50-79`: implementation/verification in flight
- `80-99`: waiting for proof, review, or integration
- `100`: done

Routing rule:

- `blocked`, `stale`, and `missing-session` should always sort above plain `idle`
- `active-needs-next` should sort above ordinary `active`

## 9000 Responsive Modes: Work / Fleet / Focus

This is the proposed contract to align with developer-1 before code changes.

### Mode 1: Work

Use when:

- ultra-wide screen
- a lead is actively supervising a subset of developers

Layout:

- left: compact roster/filter rail
- center: primary terminal surface or selected active session
- right: secondary lane with `2` to `4` supporting terminals
- bottom or side strip: ledger/peer/status summary

Primary goal:

- readable active work, not maximal tile count

### Mode 2: Fleet

Use when:

- broad monitoring matters more than a single conversation

Layout:

- equalized multi-tile grid
- compact status chips on each card
- optional group by team/workstream

Primary goal:

- quick fleet scanning

Notes:

- this is closest to the current view, but should become an explicit mode rather than the only mode

### Mode 3: Focus

Use when:

- vertical monitor
- narrow laptop
- one terminal is the primary working surface

Layout:

- one dominant terminal panel
- slim horizontal or vertical tab strip
- secondary sessions behind tabs or a collapsible side list

Primary goal:

- preserve typing space and scrollback readability on narrow or tall viewports

## Coordination Points With Developer-1

Developer-1 owns scrollback/scrollbar behavior. Alignment points before implementation:

- the mode switcher must not regress the existing `scrollback: 300` path
- Work/Focus primary surfaces must preserve wheel and scrollbar behavior already enforced in xterm CSS
- Fleet mode must avoid shrinking cards so far that scrollback becomes visually useless
- responsive mode storage should use a separate local storage key and not interfere with current filter persistence

Suggested division:

- developer-1: terminal container sizing, scrollback, xterm viewport behavior, resizing edge cases
- developer-8: mode contract, layout rules, 9100 status panel plan, screenshot matrix, command-board reconciliation

## Screenshot Matrix

### 9100

- `9100-default-board`
  - viewport: `1800x1200`
  - prove directive cards plus agent panel are visible together

- `9100-stale-agent-case`
  - viewport: `1800x1200`
  - prove stale or missing-heartbeat styling is visible

- `9100-blocked-agent-case`
  - viewport: `1800x1200`
  - prove blocked card ordering and blocker text

- `9100-idle-active-mix`
  - viewport: `1800x1200`
  - prove idle/active separation and visible next-action fields

### 9000

- `9000-work-ultrawide`
  - viewport: `2560x1440`
  - prove primary work surface plus supporting lane

- `9000-fleet-ultrawide`
  - viewport: `2560x1440`
  - prove dense fleet scan mode remains available

- `9000-focus-vertical`
  - viewport: `1080x1920`
  - prove focus mode preserves terminal readability

- `9000-desktop-standard`
  - viewport: `1440x900`
  - prove standard desktop layout remains readable

- `9000-laptop-narrow`
  - viewport: `1280x800`
  - prove controls do not collapse into unusable rows

## Ultra-Wide Layout Status Check

Current status on `9000`:

- ultra-wide is not yet a true mode-aware layout
- current grid logic still caps at `3` columns based mainly on session count
- there is no primary-work-surface lane, no explicit fleet/focus toggle, and no operator summary band

Operational implication:

- ultra-wide currently uses more width, but not in a way that improves supervision quality
- the layout is still tile-first rather than workstream-first

Immediate non-invasive acceptance target:

- approve a mode switcher before deeper layout changes
- default ultra-wide to `Work` mode after acceptance
- keep `Fleet` as an explicit fallback for dense monitoring

## CDP Screenshot Procedure

### 9100

Use the existing capture script:

```powershell
Set-Location "D:\Lucas Core v0.1"
node .\tools\capture-9100-cdp.cjs
```

Expected artifacts:

- `data\system-logs\ceo-ledger-9100-cdp\ceo-ledger-9100.png`
- `data\system-logs\ceo-ledger-9100-cdp\ceo-ledger-9100-report.json`

Pass checks:

- page loads on `http://127.0.0.1:9100`
- directive cards render
- agent cards render
- no console errors in the CDP report

### 9000

Recommended capture flow:

1. Launch stable lane on `9000`.
2. Start Chrome with remote debugging and the target viewport.
3. Capture one screenshot per mode and viewport.
4. Save a short JSON or text note with:
   - mode
   - viewport
   - selected filter
   - visible session count
   - console result

Recommended Chrome launch pattern:

```powershell
$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$Profile = "D:\Lucas Core v0.1\tmp-chrome-cdp-9000"
Start-Process -FilePath $Chrome -ArgumentList @(
  "--user-data-dir=$Profile",
  "--remote-debugging-port=19200",
  "--new-window",
  "http://127.0.0.1:9000"
)
```

Minimum manual CDP checks:

- mode switch applies correctly
- no red console errors
- API origin remains `9001`
- WS terminal origin remains `9001`
- terminal remains readable after mode switch

## Acceptance Gate Before UI Patch

Max should approve these items before implementation:

- `9100` heartbeat parsing contract
- `9100` stale/block ordering rule
- `9000` mode names: Work / Fleet / Focus
- `9000` default mode on ultra-wide
- viewport matrix for evidence collection
- developer-1 / developer-8 boundary

## Recommended Next Patch Sequence

1. Patch `9100` agent cards only.
2. Add `9100` CDP artifact fields for stale/block/missing-heartbeat counts.
3. Add `9000` mode state and non-invasive mode switcher.
4. Implement Work mode container layout.
5. Implement Fleet mode as explicit current-style fallback.
6. Implement Focus mode for vertical/narrow layouts.
7. Collect screenshot matrix and console notes.

## Proposed 9100 UI Patch

If Max accepts a narrow `9100` patch now, implement in this order:

1. Add a parser helper in [tools/ceo-ledger-board-server.cjs](</D:/Lucas Core v0.1/tools/ceo-ledger-board-server.cjs:1>) that extracts:
   - `task`
   - `status`
   - `progress`
   - `blocker`
   - `next_action`
   - heartbeat presence

2. Add a classifier helper that derives:
   - `boardState`: `idle | active | blocked | stale | active-needs-next | missing-session`
   - `freshnessMinutes`
   - sort rank

3. Extend the `renderAgent` card to show:
   - board-state badge
   - last update
   - current task
   - blocker
   - next action
   - preview fallback

4. Add a top summary row to the `9100` page with:
   - blocked
   - stale
   - active
   - idle
   - missing-heartbeat

5. Extend [tools/capture-9100-cdp.cjs](</D:/Lucas Core v0.1/tools/capture-9100-cdp.cjs:1>) to save summary counts in the JSON report.

## Dev4 QA Artifact List

If this work is blocked and needs QA handoff to developer-4, request this artifact set:

- `9100` screenshot showing summary strip and agent cards
- `9100` CDP JSON report with console status
- `9100` note listing:
  - blocked count
  - stale count
  - idle count
  - active count
  - missing-heartbeat count
- `9000` screenshot set for:
  - Work ultra-wide
  - Fleet ultra-wide
  - Focus vertical
  - desktop standard
  - laptop narrow
- `9000` CDP console note confirming:
  - no red console errors
  - API origin is `9001`
  - WS origin is `9001`
  - terminal remains readable after mode changes
