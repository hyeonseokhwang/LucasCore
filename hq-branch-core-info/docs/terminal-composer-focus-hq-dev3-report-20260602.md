# Terminal Composer HQ Parity Review - developer-3 - 2026-06-02

Scope: `terminal-composer-focus-hq-20260602` and `terminal-unratified-caesar-patch-review-20260602`

## Summary For Max

Local terminal composer behavior is partially aligned with HQ already, but the branch is not yet at full HQ parity.

Verified aligned in local code:

- Enter submit / Shift+Enter newline / IME Enter guard use shared helper in [apps/web/src/terminalTileFooter.ts](D:/Lucas Core v0.1/apps/web/src/terminalTileFooter.ts)
- card/fullscreen/popout all call the shared helper in [apps/web/src/main.tsx](D:/Lucas Core v0.1/apps/web/src/main.tsx)
- composer focus blurs `textarea.xterm-helper-textarea` via `blurNearestXtermHelper(...)`
- xterm custom key handler ignores active non-helper `input`/`textarea`
- dirty-composer refresh suppression exists for shell and popout paths

Missing vs HQ:

- no local image paste or file-attach path in terminal composers
- no backend/session write attachment contract; `/api/sessions/:id/write` accepts text only
- no explicit automated test covering prompt retention across refresh while composer is dirty
- no explicit automated test covering Korean IME composition behavior beyond the `isComposing` Enter guard helper
- no CDP screenshot/DOM/console evidence captured in this lane yet; developer-4 still needs to close the UI QA gate

## HQ Reference

Primary HQ file reviewed:

- `D:\Lucas-Initiative-HQ\command-center\frontend\src\components\TerminalToolbar.tsx`

Relevant HQ behaviors observed there:

- textarea `onKeyDown` calls `stopPropagation()`
- Enter submits, Shift+Enter falls through to native newline
- focus handler blurs `textarea.xterm-helper-textarea`
- prompt input installs a paste handler that extracts image clipboard items into preview state
- file input also supports image attachment selection

## Local Findings

### 1. Keyboard/focus parity is mostly present

Local helper in `apps/web/src/terminalTileFooter.ts` already enforces:

- Enter submit
- Shift+Enter newline
- IME `isComposing` guard
- `stopPropagation()`

Local terminal surfaces in `apps/web/src/main.tsx` use that helper for:

- card footer
- fullscreen modal footer
- popout footer

Local `XtermPreview` also has a custom key handler that returns `false` when the active element is a non-helper `input` or `textarea`, which matches the HQ intent to keep xterm from stealing prompt keystrokes.

### 2. Refresh/resize text-loss risk is reduced but not fully proven

Observed in local `apps/web/src/main.tsx`:

- shell refresh skips when any terminal composer is active
- popout refresh skips when its composer is active
- prompt state is held in React state plus `promptRef`
- composer auto-resize and reset hooks are wired across card/fullscreen/popout

This is good direction, but there is no direct automated test that proves:

- typed multiline text survives background refresh polling
- typed text survives resize/refit timing
- typed text survives fullscreen/popout transitions

### 3. Pasted image attachment is not implemented locally

Search result: no `onPaste`, `clipboardData`, `FormData`, `pastedImages`, or terminal attachment state exists in local `apps/web/src` terminal surfaces.

Backend review:

- `WriteSession` in `apps/api/src/main.rs` only accepts `input`, `data`, `prompt`
- `write_session(...)` forwards plain text only
- `write_session_bytes(...)` writes raw bytes to PTY or OS-agent write endpoint

Conclusion: true image attachment is blocked by missing cross-stack support, not just by missing UI controls.

## Caesar Patch Review

Reviewed unratified diff:

- `apps/web/src/main.tsx`
- `apps/api/src/main.rs`

Keep / likely valid:

- shared blur/auto-resize/reset composer behavior in web
- xterm custom key guard against non-helper active inputs
- replay/log tail limits moving toward HQ bounded replay policy
- resize debounce and minimum-dimension guards to avoid bad PTY fits

Needs dev-owned validation before acceptance:

- API volatile-log behavior change for internal sessions
- websocket attach handshake change now emitting explicit `attached`
- replay fallback now returning empty string instead of log tail for internal sessions

These are reasonable terminal-architecture changes, but they are broader than my composer-focus lane and need Max + developer-4 verification before being treated as accepted.

## Evidence

Commands run:

- `npm --prefix apps/web test`
- `git diff -- apps/web/src/main.tsx apps/api/src/main.rs`
- source inspection of local `apps/web/src/main.tsx`, `apps/web/src/terminalTileFooter.ts`, `apps/api/src/main.rs`
- source inspection of HQ `command-center/frontend/src/components/TerminalToolbar.tsx`

Test result:

- `apps/web` test suite passed: 31/31

Specific local tests relevant here:

- `src/terminalTileFooter.test.ts`
- `src/terminalPrompt.test.ts`

Missing evidence:

- CDP screenshot
- DOM focus verification
- browser console check
- Korean IME live-browser proof
- pasted image attach live-browser proof

## Patch Plan For Max

1. Accept the existing keyboard/focus helper path as the base implementation, but add explicit tests for dirty-composer refresh retention and IME-safe multiline editing.
2. If Lucas requires real image attachment parity, add a dev-owned attachment contract first:
   - web composer image state
   - API attachment payload or upload endpoint
   - OS/internal session write handling for attachment references
   - QA proof for paste, remove, resend, and size limits
3. Keep composer-focus work separate from broader replay/log architecture review so the unratified Caesar patch can be accepted in pieces instead of as one bundle.
4. Route UI verification to developer-4 for required screenshot, DOM/text, console, viewport, and Korean IME evidence.

## Recommendation

Report `terminal-composer-focus-hq-20260602` as:

- status: `reported`
- result: `partial-pass`
- blocker: real pasted image attachment unsupported cross-stack

Report `terminal-unratified-caesar-patch-review-20260602` as:

- status: `reported`
- result: `needs-verification`
- note: keep candidate web composer focus fixes, but broader API/replay changes require Max + developer-4 acceptance
