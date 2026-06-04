# Terminal Normalization - 2026-06-04

## Objective

Normalize LCC terminal operation after the 9001 restart so Lucas can reliably command agents through the UI/API without pasted-only prompts, missing submits, stale previews, or misleading terminal evidence.

## Lucas Intent

Terminal normalization is priority 1. Human-grade memory completion is priority 2 and waits behind terminal stability unless Lucas changes the order. Operator manual work is deferred.

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
