# Max Task Card - Card View Snapshot Fix

Issued by: Caesar under Lucas direct order
Mode: emergency recovery
Permission: edit
Ledger reference: disabled. Do not read or assign from work-ledger, ceo-command-ledger, execution-board, or 9100 ledger board.

## Lucas Intent

Do not reinterpret this.

The terminal source is one simple current terminal text source.

Card view, fullscreen, popout, and tabs are only display surfaces. They must not create a new terminal stream, replay old output, or reattach to the PTY just because the view opens, refreshes, or changes size.

The UI should simply print the current terminal text snapshot into the card/fullscreen/popout container. Multiple windows showing the same session should show the same current snapshot independently.

## What Went Wrong

Caesar gave a bad instruction by treating the card view as an xterm attach/replay problem. That is wrong.

Current broken symptom:

- Card view shows fragments like `ki`, `in`, `Wng`, `Wog`, `or`, `rk`.
- Fullscreen/popout can appear to replay/re-render terminal output when opened or refreshed.

Root cause to verify:

- `preview_text` is built from raw PTY stream tail after stripping ANSI. That is not a current terminal text snapshot. It can contain cursor movement/spinner fragments.

## Failure Analysis To Tell Developers

Tell every assignee this explicitly before they edit:

1. Lucas repeatedly explained that the terminal card is a simple display of one current terminal text source.
2. Caesar misread that as "make every view attach to the terminal and replay the stream." That was the wrong model.
3. Developers then followed a bad model or inspected from the wrong workspace, so work drifted instead of fixing the card.
4. Max failed to monitor tightly enough after assignment and did not stop the drift early.
5. The system allowed source-changing work to be assigned while developer workspaces did not contain the real source tree.
6. The technical bug is not "style." The card is displaying raw PTY stream tail text that has already been polluted by cursor/spinner fragments after ANSI stripping.
7. The correct model is a current display snapshot: one source, many views, no replay on view creation.

This is a company-building blocker. If managers cannot preserve Lucas's simple intent through the command chain, parallel development will keep breaking the product. Treat this as a command-chain quality fix as well as a code fix.

## Required Fix

Implement a simple current terminal display snapshot source in `9001`.

Rules:

1. Do not change card/fullscreen/popout into xterm attach/replay.
2. Do not make view creation call terminal attach/replay.
3. Do not add UI styling tricks or fragment filters as the primary fix.
4. The API must expose a stable current display text snapshot for each session.
5. Card view must render that snapshot as plain terminal text in the existing container.
6. Fullscreen/popout must use the same snapshot source unless an explicit interactive terminal mode is separately requested later.
7. Preserve 9001. Do not restart 9001 unless Lucas explicitly approves context loss. 9000 web restart is allowed.

## Source Root

The real source root is:

```text
D:\Lucas Core v0.1
```

Do not assume the developer workspace contains source. If the agent cwd is under `workspaces\...\repo`, use the absolute source root above.

## Likely Files

Inspect first:

```text
D:\Lucas Core v0.1\apps\api\src\main.rs
D:\Lucas Core v0.1\apps\web\src\main.tsx
D:\Lucas Core v0.1\apps\web\src\terminalReplay.ts
```

Expected API direction:

- Keep raw PTY ring buffer only for logs/live stream if needed.
- Add or reuse a separate display snapshot buffer that represents the current visible terminal text.
- `SessionView.preview_text` should come from this display snapshot, not raw stream tail.

## Forbidden

- Do not replace card view with `XtermPreview`.
- Do not make fullscreen open trigger replay.
- Do not solve by hiding random fragments in UI.
- Do not touch ledger files.
- Do not commit before Caesar/Lucas review.

## Max Duties

Max must actively monitor, not just assign:

```text
ACK cardview-snapshot-fix manager=dev-lead permission=edit
MANAGER_CHECK cardview-snapshot-fix manager=dev-lead assignee=<id> state=<ack|doing|heartbeat-missing|blocked|reported> evidence=<session|file|test> next=<action>
REPORT cardview-snapshot-fix state=<reported|blocked|completed> changed=<files> evidence=<tests/screenshots> risk=<none|...> next=<Caesar action>
```

ACK is due within 30 seconds. If a developer lacks the source tree, reassign with the absolute source root immediately.

## Acceptance Evidence

Required:

- Source diff showing card/fullscreen do not mount `XtermPreview` or request replay.
- API evidence that card source is current display snapshot, not raw PTY tail stripped of ANSI.
- 9000 screenshot of card view without `ki/in/Wng/Wog/or/rk` fragment-only output.
- Fullscreen open/refresh evidence showing no replay-from-start behavior.
- Console check.
