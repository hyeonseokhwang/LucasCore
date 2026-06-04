Objective

- Fix the regression where `20085 Work` shows near-empty terminal bodies for Arum/Caesar/Lux/Max even though `20086 /api/sessions` still reports non-empty `preview_text` tails.

Lucas Intent

- The Work view must show the current visible terminal body for active executive sessions.
- The browser must not render blank or whitespace-only terminal cards when the backend already has meaningful terminal preview state.
- The fix must preserve the protected terminal render/replay boundary and must not regress the newline/submit split contract.

Current Symptom / Evidence

- Arum reported that after commit `f52b8a6`, Chrome CDP on port `9240` captured `20085 Work (?view=terminals&layout=columns)` at about 12s and 32s.
- In both captures, Arum/Caesar/Lux/Max terminal bodies were nearly blank.
- DOM inspection reportedly showed `.xterm` `innerText` as whitespace only.
- At the same time, `20086 /api/sessions` still showed non-empty `preview_text` tails for `branch-ceo`.

Why This Matters

- This is the primary operator surface.
- If the browser terminal body goes blank while backend previews remain populated, Lucas loses runtime visibility and may assume sessions are dead or detached when they are not.

Known Wrong Interpretations

- Do not treat this as a newline/submit issue unless current evidence proves the preview source itself is empty.
- Do not "fix" this by reintroducing passive replay on view creation without verifying Lucas intent and the protected terminal render/replay contract.
- Do not assume blank `.xterm` means the backend buffer is empty; compare API preview, websocket attach, and xterm DOM separately.
- Do not restart `9001` or any live runtime just to inspect this symptom.

Forbidden Actions

- No `9001` restart or deploy.
- No prompt-text / prompt-submit behavior changes.
- No unrelated inbound API, ledger, or meeting UI work.
- No broad terminal UI rewrite without isolating the exact render path failure.

Source Root / Files

- Source root: `G:\Lucas-Initiative\LucasCore`
- Likely files:
  - `apps/web/src/main.tsx`
  - `apps/api/src/main.rs`
  - existing terminal QA/task evidence under `data/task-reports/` and `data/system-logs/`

Protected Contracts

- Terminal render/replay: touched.
- Terminal newline/submit injection: must remain untouched.
- Commit/QA gate: if source changes are needed, UI evidence and regression checks are mandatory.

Implementation Direction

1. Reproduce and compare backend `preview` / `preview_text` against web terminal attach behavior.
2. Determine whether the blank card is caused by:
   - websocket attach not seeding snapshot/output,
   - passive xterm reset/fit timing,
   - blank-only replay payload,
   - frontend session filtering/mount behavior, or
   - API preview generation mismatch after `f52b8a6`.
3. Apply the narrowest fix that restores visible passive terminal content without reintroducing forbidden replay behavior.

Understanding Check

- Objective in own words: restore non-blank Work-view passive terminal bodies when backend previews already contain session text.
- Lucas intent in own words: the terminal cards must stay readable for live supervision; blank cards are unacceptable false state.
- Forbidden paths in own words: no `9001` restart, no newline-contract edits, no broad UI rewrite, no assumption-driven replay rollback.
- Planned files in own words: first inspect `apps/web/src/main.tsx` and `apps/api/src/main.rs`, plus related task/evidence files.
- Protected contracts in own words: terminal render/replay is directly involved; newline/submit must not be touched.
- Acceptance in own words: Work-view cards for the affected sessions render meaningful body text again, and tests/build plus direct UI evidence remain clean.
- Questions: none at inspection start.

Acceptance Evidence

- Reproduction notes comparing `preview`, `preview_text`, websocket terminal payloads, and DOM text.
- If source changes are made: relevant web/API tests, build/check, and direct UI evidence showing the cards are no longer blank.

Live Progress

- 2026-06-05: Policy boot completed and active ledger scope reviewed.
- 2026-06-05: CTO formally assigned `q74410` to close the confirmed run1-3 race. Required web-only fix: promote `resizeDebounce` from a local variable to `resizeDebounceRef`, use that ref inside `term.onResize`, and on the first `snapshot`/`output` clear any pending pre-snapshot debounce before enabling later resize delivery. Intent: if `fit.fit()` arms resize at `T=0` and snapshot arrives at `T<300ms`, the old timeout must be cancelled rather than firing at `T=300ms` and sending a stale `resize` WS that triggers SIGWINCH blank.
- 2026-06-05: `q74410` patch applied in `apps/web/src/main.tsx`. `HqTerminalPreview` now stores pending resize debounce in `resizeDebounceRef`, clears it on effect teardown and session switch, and cancels a pre-snapshot pending timeout immediately before flipping `firstSnapshotReceivedRef=true`. This prevents a resize armed before the first snapshot from surviving long enough to emit stale SIGWINCH after content is already rendered.
- 2026-06-05: Verification passed: `npm --prefix apps/web run build` completed successfully. Existing Vite chunk-size warning remains unchanged and is unrelated to this fix.
- 2026-06-05: CTO clarified command drift on the RCA lane. The earlier `q74401` redefinition was withdrawn. The active instruction is `q74408`: keep the `firstSnapshotReceived` resize-block fix, avoid the proposed `fit.fit() before term.reset()` snapshot-handler change, and wait for SRE deploy plus Areum's repeated validation before judging closure. `dev-2` investigates the separate command-center-v2 equal-layout race in parallel.
- 2026-06-05: CTO follow-up narrowed a second uncovered path after commit `faef975`: `layout=focus&session=X` can still blank because `variant` changes recreate xterm and rerun fit timers, but the websocket attach/reset effect does not rerun when `sessionId` is unchanged. In that case `firstSnapshotReceivedRef` can remain `true`, so the new instance may emit resize WS during layout transition and trigger the same SIGWINCH blank later in the session. This is distinct from the initial mount case already covered by `q74408`.
- 2026-06-05: CTO escalated a separate P0 runtime finding: `20086` briefly collapsed to `sessions:0` after a PM2 restart, pointing to an empty in-memory Rust session registry rather than a passive-preview render bug. Immediate requested operator action was session recreation for `branch-ceo`, `branch-lux`, and `branch-dev-lead`.
- 2026-06-05: Local verification after the escalation showed the collapse is not present now. `GET http://127.0.0.1:20086/api/health` returned `ok=true`, `service=lcc-core-api`, `sessions=5`; `GET /api/sessions` returned `branch-ceo`, `dev-lead`, `arum`, `lux`, and `branch-qa-faef975-20260605-042947-1`, all `source=internal`. PM2 shows `branch-api-20086` online with PID `101028` and about `31m` uptime. This means the urgent zero-active condition was transient or has already been remediated by runtime/SRE action.
- 2026-06-05: CTO assigned `q74410` to close the confirmed run1-3 race. Accepted implementation shape: promote `resizeDebounce` from a local variable to `resizeDebounceRef`, use that ref inside `onResize`, and on the first `snapshot`/`output` clear any pending debounce before opening the resize gate. Goal: if `fit.fit()` already scheduled a `300ms` resize before the first snapshot, that stale timeout must die instead of firing a late resize WS and causing `SIGWINCH -> ESC[2J] -> blank`.
- 2026-06-05: CTO formally reassigned the current protected-contract fix as `q74419`. HQ comparison confirmed the attach protocol difference: HQ sends `cols/rows` together with `attach`, so the PTY boots at the right size and does not need a delayed post-attach resize. Current LCC web preview still attaches first and can emit a later duplicate resize, so the accepted narrow fix is web-only in `apps/web/src/main.tsx`: track the last emitted dimensions, include non-zero `cols/rows` in the `attach` payload, and suppress an immediate same-dimension resize after attach.
- 2026-06-05: CTO later finalized the `run1-3 FAIL` RCA from dev-2 evidence. The failing timeline is: WS open -> `fit.fit()` -> `term.onResize` arms a 300ms debounce while `firstSnapshotReceivedRef=false` -> snapshot arrives at `T=X` where `X < 300ms` -> handler flips `firstSnapshotReceivedRef=true` and writes visible content -> at `T=300ms` the already-armed debounce fires, now sees `firstSnapshotReceivedRef=true`, sends resize WS, triggers SIGWINCH / `ESC[2J]`, and the card blanks. This means the current guard does not protect against "snapshot-before-debounce-expiry" and is therefore not a complete initial-attach fix.
- 2026-06-05: `POLICY_ACK agent=codex role=caesar read=data/branch-boot-context.md,docs/command-chain-policy-20260531.md,docs/agent-state-management-policy-20260531.md,data/agent-boot-prompts.json,data/work-ledger.json,docs/development-architecture-policy-20260603.md,docs/developer-source-change-conventions-20260603.md,docs/lucas-initiative-operating-principles-20260603.md policy_version=2026-06-03 policy_delta=checked mode=lucas-direct next=verify-20085-runtime blocker=none`
- 2026-06-05: Arum incident report identified likely protected-contract scope as terminal render/replay, not terminal submit.
- 2026-06-05: Initial source scan confirmed current passive Work-view terminal implementation uses live websocket `attach` in `HqTerminalPreview`.
- 2026-06-05: `f52b8a6` touches `apps/api/src/main.rs` ring-buffer CR handling only; investigation now compares API preview state versus websocket snapshot/output delivery.
- 2026-06-05: Arum follow-up evidence weakened the blank-transport theory. `Work(columns)` showed equal `320px` card widths while Lux alone split into a `47+3` wrap pattern; WS snapshot remained non-empty. Working diagnosis shifted to per-card xterm `cols` / fit timing mismatch.
- 2026-06-05: Direct server checks showed `branch-lux` websocket `snapshot` itself already contains the broken `47+3` split. That means the corruption is not only a browser paint issue; the live PTY/snapshot width had already been narrowed upstream.
- 2026-06-05: Inspection of `apps/web/src/main.tsx` found the passive `HqTerminalPreview` was sending `resize` messages back to the PTY on mount/open. A mis-fit passive card could therefore shrink the real Codex terminal width and poison future snapshots.
- 2026-06-05: An attempted width/fit-forcing patch was rejected and reverted because it caused fresh blank rendering and did not improve the live state. History preserved; it is not the accepted fix.
- 2026-06-05: Accepted narrow fix in `apps/web/src/main.tsx`: remove passive preview PTY `resize` propagation entirely. `HqTerminalPreview` now attaches for display only and no longer mutates the live terminal size just because a Work-view card opened.
- 2026-06-05: Verification after the accepted fix: `npm --prefix apps/web run build` passed with the existing chunk-size warning only; fresh CDP capture on `20085 Work(columns)` again shows non-blank executive cards, with Lux still wrapped at `47` columns because that live session had already been resized before the fix. Evidence: `data/system-logs/terminal-9000-cdp/terminal-20085-nonresize-20260605.json`.
- 2026-06-05: Developer-1 reported commit `cce619e` and later confirmed CTO deployment receipt for `cce619e` plus `ce11e1f`. Local runtime verification shows `branch-web-20085` already restarted at `2026-06-05 03:42:13` local log time, PM2 status is `online`, and `http://127.0.0.1:20085` returns HTTP `200`. No additional manual restart was executed from this session.
- 2026-06-05: Developer-1 race RCA: backend path around `L2801-L2802` can return `Some(CLEAR_PREFIX)` when snapshot lacks `ESC[2J]`. That means the passive xterm receives reset/clear semantics without a real body, so sessions attaching mid-output or newly created can paint blank even when `initialPreviewText` was available. Proposed safe direction from RCA lane: if no real snapshot body exists, send nothing from Rust instead of `CLEAR_PREFIX`, preserve frontend `initialPreviewText` seed, and let frontend retry attach after a short delay. A second frontend-side alternative was mentioned but the report was truncated and is still pending verbatim confirmation.
- 2026-06-05: Developer-1 completed `q74384` on commit `871c2b3` and changed the no-`ESC[2J]` path from bare `CLEAR_PREFIX` to `CLEAR_PREFIX + tail[-2048..]`. The live branch repo `HEAD` now resolves to `871c2b3`.
- 2026-06-05: `branch-api-20086` was already restarted before this session intervened. PM2 shows `branch-api-20086` `online`; the current launcher PowerShell process started at `2026-06-05 03:47:08` local time, PM2 out log shows fresh `lcc_core_api` listen at `2026-06-05 03:47:22`, and runtime probe `GET /api/sessions` returned `4`. No additional manual API restart was executed from this session.
- 2026-06-05: CTO formally assigned `q74419` as the active fix direction. Root cause statement: HQ sends `cols/rows` together with `attach`, so PTY boots at the correct size and no follow-up `SIGWINCH` is required. Branch behavior had been `attach(sessionId only)` followed by a later standalone `resize`, which left a race window for `SIGWINCH -> ESC[2J] -> blank`.
- 2026-06-05: `apps/web/src/main.tsx` already contains the expected `q74419` frontend shape in the working tree: `lastEmittedDimsRef` tracks attach-time dimensions, `doAttach()` includes non-zero `cols/rows` in the attach payload, and same-dimension post-attach resize messages are suppressed.
- 2026-06-05: `q74419` backend completion applied in `apps/api/src/main.rs`. The websocket `attach` handler now parses optional `cols/rows` and, for internal PTY sessions only, applies `resize_to_session()` before replay generation. This aligns branch attach semantics with the HQ attach+dimensions contract while avoiding unsupported resize calls for runner-backed OS-agent sessions.
- 2026-06-05: `q74419` web-side attach alignment patch applied in `apps/web/src/main.tsx`. `HqTerminalPreview` now keeps `lastEmittedDimsRef`, includes current non-zero `cols/rows` in the initial `attach` payload, resets that tracking on session change, and suppresses a post-attach debounce resize when it matches the dimensions already emitted with `attach`. This aligns the passive preview attach path with the HQ protocol difference identified by CTO and avoids an immediate duplicate `resize -> SIGWINCH -> ESC[2J]` after attach.
- 2026-06-05: Verification after `q74419` patch passed locally: `npm --prefix apps/web test` (35 pass) and `npm --prefix apps/web run build` (pass, existing chunk-size warning only). No API/Rust/newline-contract files were changed in this patch.
- 2026-06-05: CTO assigned `q74419` to align the branch attach handshake with HQ. Confirmed root cause: HQ sends `cols/rows` together with `attach`, so PTY boot/attach happens at the correct size and no follow-up `SIGWINCH` is needed just to establish the initial viewport. Branch preview currently sends `attach` without dimensions, then relies on a later debounced `resize`, which can produce `SIGWINCH -> ESC[2J] -> blank`.
- 2026-06-05: Accepted `q74419` implementation direction: keep the existing non-zero-cols warm-attach guard, but include current xterm `cols/rows` in the initial `attach` payload, remember those dimensions in a frontend ref so the immediate duplicate `resize` is suppressed, and teach the API websocket attach path to apply optional `cols/rows` before sending the initial attached/snapshot response. This is a protected terminal render/attach contract change; newline/submit remains untouched.
- 2026-06-05: Direct assignment received as `q74419` follow-up: "HQ attach protocol alignment, main.tsx 3 places + main.rs 2 places." Local source inspection confirmed the three `main.tsx` attach/dimension hunks are already present in the working tree, while `apps/api/src/main.rs` still only applies `cols/rows` on the replay path inside `handle_terminal_protocol("attach")`. The non-replay websocket attach branch in `terminal_socket` still emits `attached` + snapshot without first applying the incoming dimensions, so the backend side is not yet aligned with HQ.
- 2026-06-05: Current implementation scope is therefore narrowed to the existing `q74419` packet: preserve the dirty but in-scope web attach hunks in `apps/web/src/main.tsx`, update `apps/api/src/main.rs` so both attach branches honor the optional `cols/rows` before the first snapshot/replay response, and leave newline/submit behavior untouched.

Open Decisions / Blockers

- `q74401` is no longer the active fix direction. Do not add the snapshot-handler `fit.fit()`-before-`term.reset()` change or callback retry logging unless CTO reissues that instruction with fresh evidence.
- `q74408` is no longer sufficient as-is. `q74410` is now the active code-change direction for the confirmed "snapshot-before-debounce-expiry" race inside the web passive preview path.
- `q74408` must now be treated as a partial fix, not a closure candidate. Its guard blocks only the case where the 300ms debounce fires before any snapshot/output arrives. It does not block the confirmed `snapshot-before-debounce-expiry` race from CTO's run1-3 FAIL timeline.
- `faef975` appears to cover only the initial attach path. A separate protected-contract decision is now needed for `layout=focus` or any same-session `variant` transition where xterm is recreated without resetting the resize gate. Any source fix here must stay narrow and must not reintroduce passive replay.
- Zero-active runtime collapse and passive-preview blank are now separated failure classes. If `20086 /api/sessions` drops to `0` again, treat that as an API/session-registry operational incident first, not proof that the frontend passive-preview fix regressed.
- `q74410` is now the active frontend protected-contract patch. Acceptance should focus on whether pending pre-snapshot resize timeouts are cancelled on first content, then re-run the repeated UI validation lane after deploy.
- The source fix prevents future passive-card-induced PTY width corruption, but it does not automatically repair a live session that is already narrowed to `47` columns. Immediate visual repair for current `branch-lux` would require a runtime redraw/new output or an explicit corrective resize path, which is separate from the passive preview source fix.
- Inspector and Areum validation are still pending. Until those checks land, treat the current state as deployed-and-online rather than fully closed.
- The new race RCA points to a narrower render/snapshot contract bug than the earlier width-only diagnosis. Before approving further source edits, capture the full truncated frontend option from developer-1 and verify whether this touches the protected terminal render/replay contract on API, web, or both.
- Areum's evidence predates commit `871c2b3`; passive-preview revalidation must be rerun against the restarted `20086` runtime before the issue can be considered closed.
- `q74419` is now implemented locally but still needs formal regression evidence. Required next checks: `cargo check`, `npm --prefix apps/web run build`, and live UI validation that attach-time sizing prevents the first redundant resize/SIGWINCH blank path on the affected passive preview cards.
- `q74419` changes the attach handshake contract itself. Verification therefore must confirm both sides: frontend sends non-zero `cols/rows` in `attach`, backend applies them before first snapshot/replay, and the old follow-up duplicate resize does not fire for the same dimensions.
