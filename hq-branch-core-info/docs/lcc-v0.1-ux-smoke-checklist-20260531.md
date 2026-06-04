# LCC v0.1 UX And Smoke Checklist

Date: 2026-05-31 KST

Scope: smoke procedure for validating the intended migration target:

- grid = lightweight status surface
- one active chat/terminal at a time
- original logs = file/API tail

## Preconditions

- Start the stable lane or testbed lane intentionally.
- Do not touch the protected `9002` lane unless explicitly approved.
- Keep any existing user modifications in place; this checklist is verification-only.

Suggested local start:

```powershell
.\scripts\start-lcc-core.ps1
```

Or testbed:

```powershell
.\scripts\start-9003-stage1.ps1
```

## Smoke Cases

| ID | Area | Procedure | Expected Result |
| --- | --- | --- | --- |
| UX-001 | Grid scan | Open terminal view with multiple sessions visible. | Grid communicates status quickly without requiring deep reading of every terminal body. |
| UX-002 | Focus enter | Click one session from the grid. | One focused terminal/chat surface becomes the primary workspace for that session. |
| UX-003 | Focus continuity | Enter text, leave focused view, reopen the same session. | Same session continuity is preserved; no accidental new session is created. |
| UX-004 | Recovery reachability | From the grid and from focused view, locate stop/delete/log controls. | Recovery controls remain reachable without hunting through unrelated UI. |
| UX-005 | Tail policy | Open the log view for a session with long output. | Browser shows a bounded tail rather than full unbounded replay. |
| UX-006 | File evidence | Inspect `data/terminal-logs/<session>.ansi.log` after output is generated. | Original log remains on disk independently of browser truncation. |
| UX-007 | API evidence | Call `/api/sessions/:id/log` for a large-output session. | API returns a bounded tail and remains responsive. |
| UX-008 | ANSI-heavy output | Generate many colored/escape-sequence lines, then inspect log modal and file log. | UI remains bounded; file retains original ANSI-heavy output. |
| UX-009 | Session list memory policy | Refresh `/api/sessions` after large output. | Session preview remains small and does not mirror the full log file. |
| UX-010 | Multi-session clarity | Keep several sessions active at once and move between them. | Operator attention stays on one active terminal while the grid stays useful as a status board. |

## Recommended Large-Output Reproduction

Create a high-volume session:

```powershell
$body = @{
  id = "bulk-out"
  name = "bulk-out"
  team = "qa"
  cwd = "workspaces/developer-4/repo"
  cmd = "python"
  args = @(
    "-c",
    "import sys; [sys.stdout.write(f'L{i:06d} ' + 'x'*90 + '\n') for i in range(200000)]"
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:9001/api/sessions" `
  -Method Post -ContentType "application/json" -Body $body
```

Inspect API tail:

```powershell
(Invoke-WebRequest -Uri "http://127.0.0.1:9001/api/sessions/bulk-out/log").Content.Length
Get-Item ".\data\terminal-logs\bulk-out.ansi.log" | Select-Object Name,Length
```

Expected interpretation:

- API response length stays bounded.
- File size continues growing independently.
- Browser log modal should not be treated as the complete log.

## Recommended ANSI-Heavy Reproduction

Create a color-heavy session:

```powershell
$body = @{
  id = "ansi-out"
  name = "ansi-out"
  team = "qa"
  cwd = "workspaces/developer-4/repo"
  cmd = "python"
  args = @(
    "-c",
    "import sys; esc='\x1b['; [sys.stdout.write(f'{esc}38;5;{i%256}mANSI{i:06d} BLOCK {esc}0m\n') for i in range(40000)]"
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:9001/api/sessions" `
  -Method Post -ContentType "application/json" -Body $body
```

Inspect file/API behavior:

```powershell
(Invoke-WebRequest -Uri "http://127.0.0.1:9001/api/sessions/ansi-out/log").Content.Length
Get-Item ".\data\terminal-logs\ansi-out.ansi.log" | Select-Object Name,Length
```

Expected interpretation:

- Tail views can start mid-line or mid-escape sequence because retrieval is byte-bounded.
- This is acceptable for bounded UI/API behavior.
- The source of truth for postmortem evidence remains the raw append-only file.

## Checklist For Sign-Off

- [ ] Grid is evaluated as fleet status UI, not as the main typing surface.
- [ ] Focused session entry and return path are clearly defined.
- [ ] Recovery controls are reachable from both grid and focused session.
- [ ] Preview and log modal are treated as bounded tails.
- [ ] File logs are verified as the retained evidence source.
- [ ] API tail behavior is verified against a large-output session.
- [ ] ANSI-heavy output is checked for bounded retrieval behavior and acceptable truncation semantics.

## Verification Notes From 2026-05-31

Commands run:

- `node --experimental-strip-types --test src/terminalPrompt.test.ts src/terminalReplay.test.ts`
- `cargo test --manifest-path apps/api/Cargo.toml`
- Large-output reproduction against API on port `9015`
- ANSI-heavy reproduction against API on port `9015`

Observed results:

- Web tests: `12` passed.
- API tests: `12` passed.
- `bulk-out.ansi.log`: `21,714,010` bytes on disk while `/api/sessions/bulk-out/log` returned `262,144` chars and session preview stayed about `11.9KB`.
- `ansi-out.ansi.log`: `1,718,152` bytes on disk while `/api/sessions/ansi-out/log` returned `262,144` chars and session preview stayed about `11.6KB`.
- Bounded tails could begin mid-line or mid-ANSI sequence, confirming tail-by-bytes behavior rather than semantic replay.
