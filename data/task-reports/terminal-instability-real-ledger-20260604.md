# TERMINAL-INSTABILITY-REAL-LEDGER-20260604

## Metadata

- task_id: TERMINAL-INSTABILITY-REAL-LEDGER-20260604
- mode: real debugging
- owner: Caesar
- manager: Max
- reviewers: Areum, Lux
- started_at: 2026-06-04T13:24:20+09:00
- target_close: 2026-06-04T17:00:00+09:00
- current_status: dispatching
- permission_default: inspect
- edit_permission: Max must request explicit Caesar approval before developers edit source.
- source_of_truth: this MD packet plus visible terminal ACK/REPORT evidence.
- rollback_anchor_latest: `cc82ce5 Record terminal recovery ledger drill`
- rollback_anchor_terminal_fix: `5c937fd Stop terminal views resizing source PTY`

## Lucas Intent

The terminal is still unstable. This is no longer a tabletop drill.

Use the ledger operating system to debug and close the terminal instability issue by 17:00 today.

Evidence is required. A claim is not accepted unless each subject's confirmation, execution, and report are visible in terminal tail or captured evidence.

## Current Symptom

Lucas attached a screenshot showing terminal instability still present.

Observed API tail evidence at 2026-06-04T13:24 KST:

- Caesar session has queued user text visible: "도상훈련이 아니라 실전이다..."
- Max session tail still contains older spinner fragments such as `Wo`, `or`, `rk`, `ki` near the retained tail.
- Areum and Lux are idle with previous ledger drill reports visible.

Initial classification:

- The issue is not closed.
- The source/rendering split must be verified again.
- Manager delivery proof must be semantic, not API-only.

## Protected Contracts

- Preserve 9001 singleton backend.
- Do not restart 9001 without Lucas approval.
- Terminal source is one PTY/Codex tail.
- Browser views may render independently but must not mutate source PTY size by default.
- Do not use snapshot preview as canonical runtime terminal source.
- Do not alter prompt newline/submit paths without explicit protected-contract approval.
- QA must include terminal tail evidence and visible UI evidence.
- CDP QA must not treat the terminal as disposable. The terminal window is an operating surface Lucas will keep using until the meeting window is ready.
- QA must prove the operator-facing terminal remains usable after inspection, not only that a temporary CDP capture succeeded.

## Forbidden Actions

- Do not call work complete without Lucas approval.
- Do not count `prompt-text` or `prompt-submit` HTTP success as delivery proof.
- Do not assign edit work until the assignee has passed understanding check.
- Do not edit unrelated source files.
- Do not commit unverified work.
- Do not leave uncommitted terminal source changes after a verified fix.
- Do not treat a one-shot CDP screenshot as sufficient proof of operating stability.
- Do not break, close, or disturb the user's working terminal surface as part of QA.

## Required Evidence

Every phase must include:

- terminal_read for target session
- visible ACK or REPORT in the target terminal tail
- timestamp
- actor
- blocker
- next action

QA evidence must include:

- unit test results relevant to terminal rendering/replay
- web build result if frontend changes are made
- CDP or screenshot evidence for card view
- CDP or screenshot evidence for popout/fullscreen view
- evidence that the real operator-facing terminal remains usable after QA
- whether the inspected CDP page was temporary or operator-facing
- if temporary CDP was used, separate verification that the real terminal page is still stable
- 9001 PID preservation evidence
- git commit hash for every verified source change
- rollback anchor noted in final report

## Task Card To Max

```text
[CAESAR->MAX][TERMINAL-INSTABILITY-REAL-LEDGER-20260604] permission=inspect mode=real-debug target_close=17:00KST
Read and operate from:
D:\Lucas Core v0.1\data\task-reports\terminal-instability-real-ledger-20260604.md

Lucas says terminal is still unstable. This is real debugging, not a tabletop drill.

Your obligations:
1. ACK visibly in your terminal.
2. Restate the source/view contract in your own words.
3. Assign inspect-only understanding checks to selected developers.
4. Do not grant edit work until developer understanding is visible.
5. Monitor continuously; report MANAGER_CHECK with terminal tail evidence.
6. Ask Caesar for explicit permission before source edits.
7. Require QA and commit/rollback evidence before requesting Lucas review.

Reply format:
ACK task=TERMINAL-INSTABILITY-REAL-LEDGER-20260604 understood=<yes|no> source=<one-pty-tail> views=<independent-renderers> edit_permission=<not-yet> blocker=<none|...>
LCC_AUTO_SUBMIT_ON_STABLE_TAIL_V1
```

## Areum Review Card

```text
[CAESAR->AREUM][REVIEW TERMINAL-INSTABILITY-REAL-LEDGER-20260604] permission=inspect
Review the MD packet for restart-safe ledger operation.
Check metadata, owner chain, permission, protected contracts, evidence index, QA gate, commit/rollback gate, and Lucas approval gate.

Reply:
AREUM_REVIEW task=TERMINAL-INSTABILITY-REAL-LEDGER-20260604 status=<ready|return_for_fix> missing=<...> blocker=<none|...>
LCC_AUTO_SUBMIT_ON_STABLE_TAIL_V1
```

## Lux Audit Card

```text
[CAESAR->LUX][AUDIT TERMINAL-INSTABILITY-REAL-LEDGER-20260604] permission=inspect
Persona: No sanctuary in audit.
Audit delivery, understanding, manager monitoring, QA, commit, rollback, and Lucas approval gates.
Reject API-only ACK. Require visible semantic evidence.
Be extremely strict. If a human operator could still find the terminal unusable, unstable, misleading, or disruptive, return_for_fix.
If Lux passes and Lucas rejects, record that as a Lux audit miss and update the audit criteria.

Reply:
LUX_AUDIT task=TERMINAL-INSTABILITY-REAL-LEDGER-20260604 status=<pass|return_for_fix> missing_evidence=<...> blocker=<none|...>
LCC_AUTO_SUBMIT_ON_STABLE_TAIL_V1
```

## Live Log

- 2026-06-04T13:24: Caesar created real debugging ledger packet.
- 2026-06-04T13:24: Initial terminal_read showed Max active but with older spinner fragments retained in tail.
- 2026-06-04T13:25: Caesar sent task cards to Max, Areum, and Lux through `prompt-text` plus `prompt-submit`; HTTP API returned ok for all three sessions.
- 2026-06-04T13:26: Terminal tail check did not show new visible ACK/REVIEW/AUDIT from Max, Areum, or Lux. Per Lux rule, API success is not delivery proof. Current delivery status is `not-proven`.
- 2026-06-04T13:26: Next action is retry with shorter sentinel task lines and require visible semantic receipt.
- 2026-06-04T13:30: Lucas clarified QA bar: CDP capture-and-close is not enough. The terminal is an operating surface for Lucas and future customers. Lux must return_for_fix indefinitely for any human-visible instability; if Lux passes and Lucas rejects, that is a Lux audit miss.
- 2026-06-04T13:32: Raw `GET /api/sessions/dev-lead` preview contains spinner/control fragments such as `?2026h`, `or`, `rk`, `ki`. This proves at least part of the instability exists in the 9001 session preview source, not only CSS.
- 2026-06-04T13:32: Runtime 9001 returns 404 for `/api/sessions/dev-lead/tail`, while current source contains the route. 9001 is older than source or not running the latest binary. Do not restart 9001 without Lucas approval.
- 2026-06-04T13:33: `prompt-text` and `prompt-submit` returned ok for long and short sentinel dispatches, but visible terminal tails did not show the new task or ACK. This is now a command-delivery blocker. API ACK is insufficient.
- 2026-06-04T13:37: WebSocket terminal protocol `promptText` plus `promptSubmit`, matching the 9000 UI path, successfully delivered sentinel `terminal_real_ws_043740` to Max and produced visible `MAX_ACK`. Interim rule: use WS dispatch for developer coordination and verify visible tail receipt.
- 2026-06-04T13:39: WS dispatch delivered real task cards. Visible evidence collected:
  - Max: `ACK task=TERMINAL-INSTABILITY-REAL-LEDGER-20260604 understood=yes source=one-pty-tail views=independent-renderers edit_permission=not-yet blocker=none`
  - Areum: `AREUM_REVIEW ... status=return_for_fix missing=evidence_index_section,explicit_owner_chain,explicit_QA_to_commit_to_Lucas_approval_flow,explicit_commit_gate,explicit_final_review_line blocker=none`
  - Lux: `LUX_AUDIT ... status=return_for_fix missing_evidence=visible_semantic_delivery_for_Areum_and_Lux,visible_UNDERSTANDING_CHECK_and_manager_approval_chain_before_any_edit_work,continuous_MANAGER_CHECK_records_with_terminal_tail_evidence,proof_that_human_operator_terminal_is_stable_and_usable_after_QA,card_and_popout_fullscreen_QA_evidence,unit_test_and_web_build_results_for_any_terminal_fix,verified_commit_hash_per_fix,explicit_rollback_execution_or_rollback-readiness_evidence,Lucas_OK_SIGN_or_approval_to_close blocker=none`
- 2026-06-04T13:40: Caesar decision: accept Lux/Areum return_for_fix. Next action is Max manager assignment to developers for inspect-only understanding checks and evidence collection. No edit permission yet.
- 2026-06-04T13:41: Max reported `MANAGER_CHECK ... assigned=developer-1,developer-4 delivery_evidence=visible next=collect-understanding blocker=none`.
- 2026-06-04T13:42: Caesar checked developer-1 and developer-4 tails. Neither showed the new `UNDERSTANDING_CHECK` task. Max delivery evidence is a false positive. This is a manager monitoring failure and remains return_for_fix.
- 2026-06-04T13:42: Caesar will intervene with WS dispatch to developer-1 and developer-4 to unblock evidence collection, while recording the Max delivery-evidence miss.
- 2026-06-04T13:43: Caesar WS-dispatched inspect-only understanding checks directly to developer-1 and developer-4.
- 2026-06-04T13:44: Visible developer understanding evidence collected:
  - developer-1: `UNDERSTANDING_CHECK ... source=one-pty-tail views=independent-renderers problem=unknown edit_permission=none blocker=none`
  - developer-4: `UNDERSTANDING_CHECK ... source=one-pty-tail views=independent-renderers problem=preview-pollution edit_permission=none blocker=none`
- 2026-06-04T13:44: Caesar decision: understanding check is sufficient to proceed to inspect-only root-cause review. Edit permission remains denied.
- 2026-06-04T13:45: Max reported `MANAGER_REPORT ... suspected_root=mixed ... files_to_inspect=apps/api/src/main.rs;apps/web/src/main.tsx;apps/web/src/terminalReplay.ts;apps/web/src/styles.css;tools/terminal-stuck-input-watchdog.cjs edit_request=yes ... blocker=none`.
- 2026-06-04T13:46: Caesar decision: approve narrow edit for developer-4 only. developer-1 remains verify-only. No 9001 restart. No commit by developers. Required QA: terminal tests, web build, operator-facing 9000 card/fullscreen/popout evidence, 9001 PID preservation, rollback anchors.

## Current Decision

WS dispatch is proven for Max, Areum, Lux, developer-1, and developer-4. QA bar upgraded to operating-terminal stability. Narrow edit is approved for developer-4 only; developer-1 verifies. Current blockers are polluted 9001 preview source, Max false-positive delivery evidence, and missing terminal QA evidence.
