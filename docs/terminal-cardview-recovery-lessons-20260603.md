# Terminal Card View Recovery Lessons - 2026-06-03

This file is restart-safe operational memory for the terminal card/fullscreen/popout recovery incident.

## Why This Exists

Lucas reported that the terminal card/fullscreen view was still not acceptable even after the team claimed recovery. The claim was wrong. The implementation removed replay/fragment symptoms, but it did not preserve the Codex-like terminal visual experience that Lucas explicitly expected.

Future Caesar/Max/developer sessions must read this as a caution before touching terminal rendering, terminal replay, terminal snapshot, terminal fullscreen, terminal popout, or terminal newline/submit work.

## Lucas Intent

- The display source is the live 9001 runtime PTY/Codex terminal buffer tail.
- Card view, fullscreen, popout, and tab views are passive display surfaces of that same current state.
- Opening, refreshing, resizing, or switching a view must not attach to the PTY, replay from the beginning, animate a snapshot write, or switch to `preview`/`preview_text`.
- The display must still look and feel close to the Codex terminal screen: dark terminal surface, readable monospace cells, status/prompt/command color hierarchy, stable scroll, and live current content.
- Plain white/static-looking text is not acceptable even if the fragment count is zero.
- Do not write terminal output to a file and read it back for this feature.

## What Caesar Missed

1. Caesar narrowed the problem incorrectly.
   - Lucas's request was "show the terminal as the current Codex-like screen."
   - Caesar reduced that to "remove replay and spinner fragments."
   - Result: fragment-free output was treated as success even though the visible product was still wrong.

2. Caesar failed to guard the opposite regression.
   - The team correctly blocked xterm attach/replay.
   - But the acceptance criteria did not explicitly block the opposite failure: a plain, dead-looking, single-color DOM preview.
   - Result: removing xterm write also removed the terminal visual language without a failing check.

3. Caesar verified machine metrics instead of the user-visible contract.
   - DOM class, line count, fragment count, console events, and tests were checked.
   - The actual question, "does Lucas's fullscreen look like a usable Codex terminal?", was not a hard gate.
   - Screenshots were captured, but they were not reviewed against the visual acceptance contract before completion was claimed.

4. The test suite encoded the wrong behavior.
   - `terminalPreviewTextForSnapshot` was reported as choosing the better source between raw cursor snapshot and stripped `preview_text`.
   - The actual code returned the raw cursor snapshot whenever ANSI was present.
   - A test expected a one-word `Working` snapshot, which protected the exact fullscreen collapse Lucas later observed.

5. Caesar kept reinterpreting "tail" as preview/snapshot/log.
   - Lucas meant the actual terminal text tail produced by the Codex PTY running under 9001.
   - `SessionView.preview`, `preview_text`, spinner display snapshots, sanitizer summaries, and file logs are not that source.
   - The correct source is the in-memory runtime terminal buffer tail.

## Mandatory Acceptance For This Incident Class

A terminal card/fullscreen/popout recovery is not complete until all of these are true:

- Source contract: all passive views use the same current terminal snapshot source.
- Hard source contract: the source is the 9001 runtime terminal buffer tail, not `preview`, `preview_text`, spinner snapshot, sanitizer summary, or file log.
- Replay contract: passive views do not open a websocket, attach to PTY, call requestReplay, resize the PTY, or write/reset xterm on view creation.
- Content contract: active sessions do not collapse to spinner-only lines such as `Working`, `W`, `Wo`, `rk`, `ki`, `in`, or numeric fragments when a richer `preview_text` tail exists.
- Visual contract: card, fullscreen, and popout look close to Codex terminal output, not like plain white/static text.
- Evidence contract: CDP screenshots must be human-reviewed against the visual contract, not only parsed for DOM class or line count.
- User contract: if Lucas reports "not fixed", the system must treat the current completion claim as invalid and reopen the issue immediately.

## Manager Rules

- Max must not accept "tests pass" or "fragment count zero" as sufficient.
- Caesar must not mark this class of UI incident complete without screenshot-based visual review.
- Any task report for terminal rendering must include both negative constraints and opposite-regression constraints.
- If "xterm", "snapshot", "static", "replay", or "style" appears in the task, the assignee must explain exactly what is allowed and forbidden before editing.

## Current Required Follow-Up

- Fix `terminalPreviewTextForSnapshot` so it truly chooses the richer current display source when raw cursor snapshot collapses to spinner-only content.
- Restore Codex-like visual styling for passive snapshot DOM without reintroducing attach/replay/xterm write behavior.
- Update tests so spinner-only raw snapshots lose to richer `preview_text`.
- Capture fresh card/fullscreen/popout screenshots and review them visually before claiming completion.
