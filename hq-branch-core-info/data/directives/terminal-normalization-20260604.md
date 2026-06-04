# Terminal Normalization - 2026-06-04

## Objective

Normalize LCC terminal operation after the 9001 restart so Lucas can reliably command agents through the UI/API without pasted-only prompts, missing submits, stale previews, or misleading terminal evidence.

## Lucas Intent

Terminal normalization is priority 1. Human-grade memory completion is priority 2 and waits behind terminal stability unless Lucas changes the order. Operator manual work is deferred.

## Lucas Terminal Source Policy

This policy is authoritative for terminal rendering/replay work:

1. Codex runs from CMD.
2. LCC terminal source is only the tail of the CMD/Codex text stream, capped at the last 4 Kbytes.
3. LCC keeps each agent tail as singleton volatile state even when tabs change or no terminal view is mounted. The retained 4 Kbytes are volatile; older text is discarded as new text arrives.
4. The terminal popup uses the same singleton tail source and only changes the display size.
5. The terminal card view uses the same singleton tail source and only changes the display size/layout because it is one grid item.
6. Opening another terminal view must not replay or recreate an existing terminal. Same source, independent view items.

Clarification from Lucas, 2026-06-04:

- Default terminal views are live mirrors. They attach to the PTY stream and write only incoming terminal output bytes to xterm.
- Refreshing or opening a new view must not replay old 4KB tail into the screen. A newly attached view may be blank until new terminal output arrives.
- Do not reconstruct, syntax-highlight, regex-clean, summarize, tokenize, or restyle the terminal screen for the default view.
- The 4KB singleton is the backend source bound; it is not a frontend replay obligation.
- Logs/files/transcripts are separate durable evidence and must not be used as the default terminal display source.

Operational interpretation:

- The terminal is a compact live work surface, not durable memory and not a transcript viewer.
- Full transcript, debug log, raw JSON, and historical evidence belong behind drill-down/log access only.
- Any change that increases card/popup source retention, replays old terminal output on view creation, or treats scrollback as memory violates this policy unless Lucas explicitly overrides it.

## Current Symptom / Evidence

- 9001 core was restarted and is healthy at PID 24228.
- 9100 is a dashboard and is now running at PID 29492 after 9100-only restarts.
- Prompt delivery has recently shown failure modes where text appeared as pasted content but did not produce semantic ACK until a separate submit retry.
- Some terminal previews have shown stale or visually noisy state.
- 9100 was visually noisy and blocked by ledger-reference-disabled until Lucas restored ledger-system operation for this priority reset.

## Why This Matters

LCC cannot operate as a company if agents do not reliably receive, submit, understand, and report instructions. Terminal state is an operational control surface, not just UI decoration.

## Known Wrong Interpretations

- Do not treat a transport ACK as semantic understanding.
- Do not treat pasted text in the prompt area as delivered work.
- Do not scrape terminal preview fragments into durable memory.
- Do not restart 9001 just because a UI/dashboard view is stale.
- Do not combine command text and Enter submit into one fragile write path.

## Forbidden Actions

- Do not restart 9001 without explicit Lucas order.
- Do not bypass `prompt-text` / `prompt-submit` with raw PTY writes except documented emergency fallback.
- Do not use bracketed paste submit or CSI Enter as normal submit.
- Do not use, inspect, restart, or route this terminal work through 9002. Current scope is 9000 web UI, 9001 terminal/core API, and 9100 dashboard only.
- Do not make the default terminal display a syntax-highlighted dashboard/log view or duplicate transcript. It must output the live 4KB terminal singleton and must not tokenize output into LCC-styled spans.
- Do not edit terminal source before understanding check and protected-contract approval.
- Do not mix memory-system source changes into terminal normalization.

## Source Root / Files

Source root: `D:\Lucas Core v0.1`

Initial inspect-only files:

- `apps/api/src/main.rs`
- `apps/web/src/main.tsx`
- `tools/terminal-stuck-input-watchdog.cjs`
- `tools/non-sleeping-ops-loop.cjs`
- `tools/ceo-ledger-board-server.cjs`
- `data/work-ledger.json`
- `data/execution-board.json`

## Protected Contracts

- terminal newline/submit injection
- terminal render/replay
- 9001 singleton backend
- policy ACK boot
- ledger execution gates

## Implementation Direction

First pass is inspect and evidence only:

1. Verify live 9001 exposes `prompt-text` and `prompt-submit`.
2. Verify submit flow requires separate text ACK and submit ACK.
3. Verify semantic ACK appears after a prompt, not only transport ACK.
4. Verify terminal live preview is not stale after prompt submission.
5. Verify 9100 remains a ledger dashboard and not the terminal core.

Only after evidence and understanding approval may source edits be proposed.

## Understanding Check Questions

Assignee must restate:

- objective
- Lucas intent
- forbidden terminal paths
- files to inspect first
- protected contracts
- acceptance evidence
- whether source edits are requested or blocked

## Acceptance Evidence

- 9001 PID remains 24228 unless Lucas explicitly orders restart.
- `/api/sessions/:id/prompt-text` and `/api/sessions/:id/prompt-submit` live checks pass.
- At least one controlled prompt produces visible semantic ACK after split submit.
- 9100 shows only two active priorities and no disabled-ledger blocker.
- Any source edit proposal names exact regression tests before edit.

## External Newline Evidence Intake

Lucas assigned ongoing newline monitoring to an external GPT-5.4 lane. When that report arrives, Caesar should require:

- affected session id and whether it was card, fullscreen, popout, REST API, or WebSocket input
- exact input text, including where the user expected line breaks
- observed terminal tail before submit and after submit
- whether `prompt-text` returned `promptTextAck`
- whether `prompt-submit` returned `promptSubmitAck`
- whether semantic ACK/report appeared after submit
- browser route/view if the issue was visual
- whether the issue is one of:
  - text wraps visually at terminal width but semantic submit is OK
  - newline is inserted into composer instead of submit
  - text is visible but submit does not execute
  - pasted-content marker remains pending
  - semantic response appears only after a second submit

Do not edit protected newline/submit source from anecdotal evidence alone. First classify the failure mode and map it to `apps/api/src/main.rs`, `apps/web/src/main.tsx`, `apps/web/src/terminalPrompt.ts`, or terminal replay/rendering only if evidence points there.

## Live Progress

- 2026-06-04: Lucas set priority order: terminal normalization, then memory completion.
- 2026-06-04: Caesar reset ledger to two active P0 items and paused other work.
- 2026-06-04: Caesar simplified 9100 priority reset view and restarted only 9100.
- 2026-06-04: Dedicated `terminal-normalization-verify` session produced semantic ACK after split `prompt-text` and `prompt-submit`.
- 2026-06-04: Max `dev-lead` was confirmed stale/read-only OS-attached from 2026-05-31 and was recreated as an internal interactive 9001 session without restarting 9001.
- 2026-06-04: Lucas assigned ongoing newline monitoring to an external GPT-5.4 lane; Caesar will handle root-cause fix when concrete external evidence arrives.
- 2026-06-04: External monitor evidence identified injected-command-visible-without-required-reply cases on `areum` and `dev-lead`.
- 2026-06-04: Caesar patched `apps/api/src/main.rs` so `prompt-text` waits `420ms` before ACK, preventing callers from submitting before text injection has settled. `prompt-submit` remains plain `\r`.
- 2026-06-04: Verification passed: `cargo check --manifest-path apps/api/Cargo.toml --bin lcc-core-api`; `cargo test --manifest-path apps/api/Cargo.toml --bin lcc-core-api prompt_text_ack_waits_before_submit_can_follow`.
- 2026-06-04: Live 9001 still needs a controlled restart/deploy before this API fix affects runtime behavior. Do not restart 9001 without Lucas approval.
- 2026-06-04: Display-tail lane aligned to Lucas policy. `apps/web/src/main.tsx` card, popout, and fullscreen views render the 4KB session tail through `HqTerminalPreview` without WebSocket attach, `requestReplay`, or `replayBytes`. `data/terminal-runtime-config.json` and `apps/api/src/main.rs` display defaults are 4KB for preview/card/max/ring. Log tail remains separate at 32KB.
- 2026-06-04: Display-tail verification passed: `npm --prefix apps/web test` (49 pass), `npm --prefix apps/web run build`, and `cargo test --manifest-path apps/api/Cargo.toml --bin lcc-core-api terminal_replay_limit_matches_hq_tail_policy`.
- 2026-06-04: Live API evidence for Caesar showed `previewTextBytes=2786`, `previewHasAnsi=false`, under the 4KB policy. Ports remained `9000=11900`, `9001=24228`.
- 2026-06-04: CDP display evidence captured Caesar card, fullscreen, and popout. Card class was `terminal-snapshot-preview`, fullscreen and popout class was `terminal-snapshot-preview fullscreen`; fullscreen open returned `ok=true`; stable fullscreen capture had `errorCount=0`.
- 2026-06-04: CDP evidence files: `data/system-logs/terminal-9000-cdp/terminal-card-caesar-executive-20260604-tail.json`, `data/system-logs/terminal-9000-cdp/terminal-fullscreen-caesar-stable-20260604-tail.json`, and `data/system-logs/terminal-9000-cdp/terminal-popout-caesar-executive-20260604-tail.json`.
- 2026-06-04: Refresh-style repeat audit passed. Popout was opened twice from a fresh CDP browser session and fullscreen was opened twice from a fresh CDP browser session. All four captures used `terminal-snapshot-preview fullscreen`, had `errorCount=0`, and stayed under 4KB (`2774` to `2888` UTF-8 bytes). No `POLICY_ACK` boot replay or transcript reattach block returned.
- 2026-06-04: Repeat audit evidence files: `data/system-logs/terminal-9000-cdp/terminal-popout-refresh-audit-a-20260604-tail.json`, `data/system-logs/terminal-9000-cdp/terminal-popout-refresh-audit-b-20260604-tail.json`, `data/system-logs/terminal-9000-cdp/terminal-fullscreen-refresh-audit-a-20260604-tail.json`, and `data/system-logs/terminal-9000-cdp/terminal-fullscreen-refresh-audit-b-20260604-tail.json`.
- 2026-06-04: Final focused checks passed after repeat audit: `npm --prefix apps/web test` (49 pass), `npm --prefix apps/web run build`, `cargo test --manifest-path apps/api/Cargo.toml --bin lcc-core-api terminal_replay_limit_matches_hq_tail_policy`. Ports remained `9000=11900`, `9001=24228`.
- 2026-06-04: Lucas reported Codex format break/white-screen concern. 9001 screen-reader classified Caesar as `active_or_idle`, `pending=none`, `fragmentDominated=false`; the source tail still included cut ANSI fragments (`repo5;5m ... m)`) from the 4KB boundary/cursor status line.
- 2026-06-04: Patched `apps/web/src/terminalReplay.ts` display sanitization to strip cut SGR/cursor fragments such as `5;5m`, `X62X`, and the trailing `m)` after Codex goal status lines. This does not change the 9001 source tail, replay policy, or newline/submit contract.
- 2026-06-04: Codex format verification passed: `npm --prefix apps/web test` (50 pass) and `npm --prefix apps/web run build` (chunk-size warning only). CDP popout evidence `data/system-logs/terminal-9000-cdp/terminal-popout-format-fix-b-20260604-tail.json` had `terminalClass=terminal-snapshot-preview fullscreen`, `hasX62X=false`, `hasSgr=false`, `hasGoalTrailingM=false`, console types `debug,info` only. Screenshot: `data/system-logs/terminal-9000-cdp/terminal-popout-format-fix-b-20260604-card.png`.
- 2026-06-04: Lucas narrowed runtime scope: 9000, 9001, and 9100 only. 9002 is out of scope unless Lucas explicitly restores it for another task. `AGENTS.md` and `docs/terminal-source-tail-policy-20260604.md` were updated accordingly.
- 2026-06-04: Lucas approved active 9000/9001 restart and load testing. 9001 was deployed through `tools/controlled-9001-deploy.cjs --execute --approval LUCAS_APPROVED_9001_DEPLOY`; old PID `24228` was replaced by PID `34440`, health recovered, memory recovery passed, and newline smoke passed. 9000 Vite was restarted at PID `37688`; 9100 remained PID `29492`.
- 2026-06-04: Added backend and frontend 4KB byte-cap guards. API tests passed (`cargo test --manifest-path apps/api/Cargo.toml --bin lcc-core-api`, 22 pass). Web tests passed (`npm --prefix apps/web test`, 52 pass) and build passed (`npm --prefix apps/web run build`, chunk-size warning only).
- 2026-06-04: Load-tail sessions generated large terminal output without model calls. API evidence showed `ceo`, `terminal-load-1`, and `terminal-load-2` each capped at `previewBytes=4096`, `textBytes=4096`, `under4096=true`.
- 2026-06-04: Lucas clarified that the terminal must look like the terminal itself, not a styled LCC rendering and not a plain white log. The earlier plain `<pre>` direction is superseded. `HqTerminalPreview` now uses a read-only xterm renderer for the 4KB display tail so ANSI/VT terminal color/form is preserved, while tokenized path/model/status highlighting and line classes remain removed.
- 2026-06-04: Superseded evidence note: popout `data/system-logs/terminal-9000-cdp/terminal-pure-pre-popout-20260604-tail.json` and fullscreen `data/system-logs/terminal-9000-cdp/terminal-pure-pre-fullscreen-20260604-tail.json` showed no replay, but the visual direction was rejected because plain white log rendering is not terminal form.
- 2026-06-04: Lucas corrected the source contract again: no file tail, no duplicate transcript, no intermediate replay path. The display source is the live terminal stream retained as a per-agent volatile 4KB singleton. Frontend output must use that singleton only. API was changed so session view prefers the backend terminal singleton display state over raw replay fragments; live 9001 was restarted from PID `38056` to PID `29648` with `target-9001-deploy-snapshot`.
- 2026-06-04: Real Caesar was restarted as `cmd.exe /K codex.cmd --model gpt-5.5 --cd . --no-alt-screen --dangerously-bypass-approvals-and-sandbox`. API evidence showed the initial Codex screen is not cut: `previewBytes=842`, `textBytes=842`, `hasPolicyAck=false`, `hasTranscript=false`.
- 2026-06-04: CDP visual evidence after restart: popout `data/system-logs/terminal-9000-cdp/terminal-real-codex-no-horizontal-overflow-20260604-card.png`, card `data/system-logs/terminal-9000-cdp/terminal-real-codex-card-snapshot-20260604-card.png`, fullscreen `data/system-logs/terminal-9000-cdp/terminal-real-codex-fullscreen-snapshot-20260604b-fullscreen.png`. Popout/fullscreen show the initial Codex screen from the 4KB singleton without top cut or horizontal terminal overflow.
- 2026-06-04: Removed default OS registry/file-tail sessions from 9001 terminal list. `LCC_OS_AGENT_REGISTRY` must now be explicitly set for OS attach/file-log sessions; otherwise 9001 exposes only live internal terminal sessions. Live restart moved 9001 from PID `29648` to PID `27292` using `target-9001-deploy-snapshot2`. API evidence after restart: session count `1`, `ceo.source=internal`, `previewBytes=847`, `hasTranscript=false`, `hasOldOsLaunch=false`.
- 2026-06-04: Final CDP evidence after OS file-tail removal: card `data/system-logs/terminal-9000-cdp/terminal-final-card-singleton-20260604b-card.png`, popout `data/system-logs/terminal-9000-cdp/terminal-final-popout-singleton-20260604b-card.png`, fullscreen `data/system-logs/terminal-9000-cdp/terminal-final-fullscreen-singleton-20260604-fullscreen.png`. Card count is `1`; stale developer OS cards are absent.
- 2026-06-04: Fixed a remaining frontend violation where read-only xterm preview used `scrollback: 0`. That could discard top lines once the 4KB singleton exceeded the visible height. `HqTerminalPreview` now keeps 512 scrollback lines for the already-bounded 4KB singleton, preserving vertical access inside the retained tail without increasing source retention.
- 2026-06-04: Verification after scrollback fix passed: `npm --prefix apps/web test` (52 pass) and `npm --prefix apps/web run build` (chunk-size warning only). 9000 was restarted only, moving to PID `3832`; 9001 remained PID `27292`; 9100 remained PID `29492`.
- 2026-06-04: CDP evidence after scrollback fix: popout `data/system-logs/terminal-9000-cdp/terminal-after-scrollback-fix-20260604-card.png`; card `data/system-logs/terminal-9000-cdp/terminal-after-scrollback-fix-card-20260604-card.png`; fullscreen `data/system-logs/terminal-9000-cdp/terminal-after-scrollback-fix-card-20260604-fullscreen.png`. Card and popup show the Codex initial terminal screen and prompt from the same `ceo` singleton; `POLICY_ACK` and stale transcript content are absent.
- 2026-06-04: Caesar was instructed through split `prompt-text` then `prompt-submit` to load context and work only on newline/submit reliability while avoiding the terminal display/source-tail lane. API ACK evidence: `promptTextAck`, `textBytes=819`, `promptSubmitAck`, `submitKey=\r`, `repeat=1`.
- 2026-06-04: Caesar completed newline smoke evidence without editing display/source-tail files. Dedicated session `terminal-newline-codex-verify-1780577110813` passed and was deleted. `data/system-logs/terminal-normalization-20260604/newline-channel-smoke.json` reports `ok=true` for split, write_plain, write_trailing_lf, write_trailing_crlf, and ws_sendPrompt. Live sessions returned to `ceo` only.
- 2026-06-04: Added frontend box sizing guard to `.terminal-snapshot-preview` so the terminal frame fits its current view while xterm viewport owns vertical scrolling. Verification passed: `npm --prefix apps/web test` (52 pass), `npm --prefix apps/web run build` (chunk-size warning only), and `cargo test --manifest-path apps/api/Cargo.toml --bin lcc-core-api terminal_` (5 pass, warnings only). 9000 was restarted only, moving to PID `1344`; 9001 remained PID `27292`; 9100 remained PID `29492`.
- 2026-06-04: CDP overflow evidence after box sizing: `data/system-logs/terminal-9000-cdp/terminal-overflow-metrics-after-boxsizing-20260604.json` and screenshot `data/system-logs/terminal-9000-cdp/terminal-overflow-metrics-after-boxsizing-20260604.png`. Page body and xterm viewport have no horizontal overflow; vertical scrolling is available for the retained 4KB tail. API evidence after the check: session count `1`, `ceo.source=internal`, `previewBytes=2109`, `hasPolicyAck=false`, `hasOldOsLaunch=false`.
- 2026-06-04: Lucas rejected the remaining white/plain terminal look. Investigation showed that using the raw ANSI 4KB tail directly preserved color but could start inside a terminal control sequence and render visible garbage such as `Hin    P`. Backend was changed so internal session `preview` retains the raw bounded 4KB ANSI tail while `preview_text` keeps the current display snapshot text from the same singleton source. Frontend `HqTerminalPreview` now renders the display snapshot through xterm with Codex-style SGR colors instead of replaying the cut raw ANSI tail.
- 2026-06-04: Runtime deploy for the ANSI/display split moved 9001 from PID `27292` to PID `31308` using `target-9001-deploy-snapshot3`; Caesar was recreated as real Codex under `cmd.exe /K codex.cmd --model gpt-5.5 --cd . --no-alt-screen --dangerously-bypass-approvals-and-sandbox`. 9000 was restarted to PID `5220`; 9100 stayed PID `29492`.
- 2026-06-04: Verification after Codex-style render fix: `cargo test --manifest-path apps/api/Cargo.toml --bin lcc-core-api terminal_` passed (5 pass, warnings only); `npm --prefix apps/web test` passed (53 pass); `npm --prefix apps/web run build` passed (chunk-size warning only). API evidence: `count=1`, `id=ceo`, `source=internal`, `previewBytes=4096`, `textBytes=822`, `previewHasAnsi=true`, `hasEsc=true`, `hasPolicyAck=false`, `hasOldOsLaunch=false`.
- 2026-06-04: CDP evidence after Codex-style render fix: popout `data/system-logs/terminal-9000-cdp/terminal-codex-style-real-popout-20260604-card.png` and JSON `data/system-logs/terminal-9000-cdp/terminal-codex-style-real-popout-20260604-tail.json` show actual `popout=ceo`, `cardCount=0`, `terminalClass=terminal-snapshot-preview fullscreen`, Codex colored model/path/permission/status lines, no `Hin P` raw-tail artifact, no `POLICY_ACK`, and no OS-file-tail artifact. Card/fullscreen evidence: `data/system-logs/terminal-9000-cdp/terminal-codex-style-card-fullscreen-20260604b-card.png` and `data/system-logs/terminal-9000-cdp/terminal-codex-style-card-fullscreen-20260604b-fullscreen.png`.
- 2026-06-04: Lucas rejected replay/snapshot/reconstruction again and clarified that "mirroring" means screen output is the live terminal stream, not a replay of prior 4KB on view creation. Frontend `HqTerminalPreview` now opens xterm, sends attach only, and writes only live WebSocket `output.data`. It accepts both `sessionId` and Rust-style `session_id`; direct WS proof showed server output events use `session_id`.
- 2026-06-04: Removed frontend terminal reconstruction helpers from `apps/web/src/terminalReplay.ts`; it now keeps only log-modal tail helpers. Default terminal rendering no longer depends on regex cleanup, snapshot scoring, synthetic Codex styling, or replay repair.
- 2026-06-04: Verification passed after simplification: `npm --prefix apps/web test` (34 pass), `npm --prefix apps/web run build` (chunk-size warning only), and `cargo test --manifest-path apps/api/Cargo.toml --bin lcc-core-api terminal_` (5 pass, warnings only). 9000 restarted to PID `26648`; 9001 remained PID `23964`; 9100 remained PID `29492`.
- 2026-06-04: Live mirror evidence: direct WS attach to `terminal-mirror-stream-proof2` received `output.session_id=terminal-mirror-stream-proof2` and live `data`; CDP screenshot `data/system-logs/terminal-9000-cdp/terminal-mirror-live-stream-proof2-20260604-card.png` shows live xterm lines `MIRROR-PROOF2-17` through `MIRROR-PROOF2-70`. Report: `data/system-logs/terminal-9000-cdp/terminal-mirror-live-stream-proof2-20260604-tail.json`. Verification sessions were deleted after evidence collection.

## Open Decisions / Blockers

- Need Lucas approval for controlled 9001 restart/deploy before runtime fix is live.
- Need Lux audit of protected-contract boundaries after any newline source fix.
- Need Areum to keep ledger/9100 readable while terminal and memory evidence is collected.

## Controlled 9001 Deploy Gate

Current live 9001:

- PID: `24228`
- executable: `D:\Lucas Core v0.1\target-9001\debug\lcc-core-api.exe`
- current source fix commit: `de7c1ac Delay prompt text ack before submit`

Prepared deploy candidate:

- executable: `D:\Lucas Core v0.1\target-9001-deploy\debug\lcc-core-api.exe`
- evidence: `data/system-logs/terminal-normalization-20260604/deploy-candidate.json`
- guarded script: `tools/controlled-9001-deploy.cjs`
- dry-run evidence: `data/system-logs/terminal-normalization-20260604/controlled-9001-deploy.json`
- reason: built in a separate target directory so the live `target-9001` executable is not overwritten while PID `24228` is running.

Do not run this gate without explicit Lucas approval.

Execution command after explicit Lucas approval only:

```powershell
node tools/controlled-9001-deploy.cjs --execute --approval LUCAS_APPROVED_9001_DEPLOY
```

When approved:

1. Capture pre-restart evidence:
   - `GET http://127.0.0.1:9001/api/health`
   - `GET http://127.0.0.1:9001/api/sessions`
   - current listener PID for port 9001
2. Stop only PID `24228` for port 9001.
3. Start `D:\Lucas Core v0.1\target-9001-deploy\debug\lcc-core-api.exe` from source root.
4. Confirm the new 9001 PID is different and health returns OK.
5. Confirm `GET /api/memory/recover/ceo?limit=3` still includes `recovered_context.daily_memory`.
6. Create a dedicated verification session, not `ceo`.
7. Submit a prompt through split `prompt-text` then `prompt-submit` without a second submit.
8. Require visible semantic ACK:
   - `TERMINAL_POST_DEPLOY_ACK state=pass split_submit=received blocker=none`
9. Record evidence under `data/system-logs/terminal-normalization-20260604/`.
10. Update `data/work-ledger.json`, `data/execution-board.json`, and this packet.

Post-deploy acceptance:

- 9001 health OK with new PID.
- daily memory recovery still present.
- split submit produces semantic ACK on first submit.
- external newline monitor shows no persistent injected-command-without-submit case for the dedicated verifier.
