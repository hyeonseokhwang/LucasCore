# Terminal Newline / Submit Fix - 2026-06-04

## Objective

Resolve the terminal newline/submit issue across command injection paths while preserving the protected split `prompt-text` / `prompt-submit` contract.

## Lucas Intent

Lucas needs agent instructions to arrive with internal newlines intact and execute on the first submit. Transport ACK alone is not enough; UI and automation paths must wait for the correct ACKs and produce semantic evidence.

## Scope / Coordination

- Newline lane changed input/submit paths only.
- Tail display lane owns `HqTerminalPreview`, singleton tail display, and removal of replay attach behavior.
- This lane did not restore `requestReplay`, `replayBytes`, `TERMINAL_VIEW_REPLAY_BYTES`, or xterm attach/replay in `HqTerminalPreview`.
- 9000 restart was performed; 9001 remained PID `24228`.

## Changes

- `apps/web/src/main.tsx`
  - `sendTerminalProtocol()` now waits for `promptTextAck` or `promptSubmitAck` before resolving.
  - Terminal diagnostics now records repeated events when enabled, so ACK evidence can be captured.
- `scripts/start-lcc-agents.ps1`
  - legacy `/write` boot fallback no longer sends an extra submit afterward.
- `tools/caesar-newline-monitor.cjs`
  - Caesar notification legacy `/write` fallback no longer sends an extra empty write afterward.
- `tools/check-terminal-newline-channels.cjs`
  - fixed semantic marker detection for channel smoke evidence.

## Injection Path Audit

- 9000 UI composer: split WS `promptText` then `promptSubmit`, now ACK-gated.
- REST split API: `/api/sessions/:id/prompt-text` then `/api/sessions/:id/prompt-submit`.
- Legacy REST `/write`: still compatibility path; current API normalizes body and submits separately server-side.
- WS `sendPrompt`: compatibility path; smoke verified semantic delivery.
- Ops tools: dispatcher, wake tick, non-sleeping ops loop use split API first, `/write` fallback only for 404/405.
- Watchdog/monitor submit-only paths use `prompt-submit` first, empty-write fallback only for submit recovery.
- Agent bootstrap script no longer double-submits after `/write` fallback.

## Verification

- `cargo check --manifest-path apps/api/Cargo.toml --bin lcc-core-api`: pass, existing warnings only.
- `cargo test --manifest-path apps/api/Cargo.toml --bin lcc-core-api prompt_text_ack_waits_before_submit_can_follow`: pass.
- `npm --prefix apps/web test`: pass, 49 tests.
- `npm --prefix apps/web run build`: pass, existing chunk-size warning only.
- `node --check` passed for newline/ops scripts.
- `scripts/start-lcc-agents.ps1` parser check passed.
- `node tools/check-terminal-newline-channels.cjs`: current live 9001 PID `24228` fails the first REST split case, then subsequent compatibility paths pass. This proves the API deploy candidate is still required before closure.
- 9000 UI CDP evidence: `data/system-logs/terminal-normalization-20260604/ui-ack-wait-cdp.json`, `ok=true`, includes `promptTextAck`, `promptSubmitAck`, semantic verifier pass, console errors `0`.

## Refreshed Evidence - 2026-06-04 21:44-21:46 KST

- Startup policy re-read from source root `D:\Lucas Core v0.1`; ledger reference suspension file has `disabled=false`.
- Live 9001 health passed before smoke: `ok=true`, service `lcc-core-api`.
- Live 9001 listener PID is now `27292`, not the deploy script's expected old PID `24228`.
- Guarded deploy dry-run did not execute and wrote `data/system-logs/terminal-normalization-20260604/controlled-9001-deploy.json`; candidate exists, but the PID guard is stale for the current runtime.
- Dedicated verification session `terminal-newline-codex-verify-1780577110813` was created for smoke, then deleted after evidence collection; Caesar/user conversation was not used.
- `node tools/check-terminal-newline-channels.cjs` passed with `ok=true` in `data/system-logs/terminal-normalization-20260604/newline-channel-smoke.json`.
- Semantic ACK passed for all smoke channels: `split`, `write_plain`, `write_trailing_lf`, `write_trailing_crlf`, and `ws_sendPrompt`.
- No protected source files were edited during this refresh.

## Runtime State

- 9000 web restarted to PID `11900`.
- 9001 API remained PID `24228`.
- 9003 is not listening after cleanup.

## Deploy Gate

- Guarded deploy script dry-run: pass.
- Guarded deploy script now runs post-deploy newline channel smoke automatically after health and memory recovery.
- Candidate executable: `D:\Lucas Core v0.1\target-9001-deploy\debug\lcc-core-api.exe`.
- Candidate evidence: `data/system-logs/terminal-normalization-20260604/deploy-candidate.json`.
- Latest dry-run evidence: `data/system-logs/terminal-normalization-20260604/controlled-9001-deploy.json`.
- Current blocker: explicit Lucas approval is still required before switching live 9001.
- Approved command:

```powershell
node tools/controlled-9001-deploy.cjs --execute --approval LUCAS_APPROVED_9001_DEPLOY
```

## Residual Risk

- Earlier evidence said live 9001 used PID `24228`; refreshed evidence shows live 9001 currently listens on PID `27292`.
- The deploy guard still expects PID `24228`; executing the guarded deploy would currently refuse on PID mismatch unless the guard is consciously updated after approval.
- Current live semantic smoke passed across split REST, legacy write variants, and WS compatibility paths.
- Existing dirty display-tail changes in `apps/web/src/main.tsx` belong to the terminal tail display lane and must be reviewed with that lane before commit.
