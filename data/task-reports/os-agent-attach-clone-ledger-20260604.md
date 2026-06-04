# OS-AGENT-ATTACH-CLONE-LEDGER-20260604

## Objective

Build and verify, through the ledger operating system, a safe test lane for OS-level agents that can attach/detach dynamically to an LCC terminal backend without risking the live 9001 singleton.

Lucas intent:

- Keep live 9001 because existing agents depend on it.
- Do not use live 9001 as the experiment target.
- Clone the 9001-style backend onto an arbitrary test port.
- Use that clone to test OS agent attach/detach behavior.
- Run the work through the ledger chain, not Caesar direct coding.
- Show concise progress on 9100 for Lucas review at 20:00 KST.
- Lux must audit from a human operator viewpoint and return for fix aggressively.

## Current Mode

- mode=real-debug-ledger-operation
- target_review_time=2026-06-04 20:00 KST
- source_of_truth=this markdown task packet plus linked evidence
- live_9001_contract=preserve; no restart; no destructive testing
- implementation_owner=Max/development-team
- Caesar_role=supervisor/gatekeeper/reporting, not implementer
- Areum_role=ledger clarity, ownership chain, evidence index, 9100 readability
- Lux_role=final audit/return_for_fix gate; no sanctuary

## Owner Chain

Command and review chain:

1. Lucas: business objective, final acceptance, 20:00 review, OK/return decision.
2. Caesar: supervisor, task packet owner, protected-contract gate, 9100 summary owner, final report to Lucas.
3. Max: implementation manager; must collect developer understanding checks before any edit, assign test-port/clone/attach-detach work, review developer evidence, and request Caesar/Lux gate.
4. Developers assigned by Max: inspect, implement, verify, and report only inside explicit permission.
5. Areum: ledger clarity reviewer; checks owner chain, evidence index, 9100 readability, commit gate, rollback anchor.
6. Lux: audit officer; checks human operator risk, proof quality, rollback readiness, and final OK_SIGN/RETURN_FOR_FIX.

Current operating permission:

- Caesar=supervise/report only
- Max=inspect/plan until Caesar approves edit
- Areum=inspect/review ledger only
- Lux=inspect/audit only
- Developers=unassigned until Max proposes owners and Caesar approves permissions

## Protected Contracts

- Preserve live 9001 singleton and current agent sessions.
- Do not restart or mutate 9001 for this experiment.
- Terminal newline/submit remains separate `prompt-text` / `prompt-submit`.
- Test clone must use an arbitrary port and clearly label itself as non-production.
- Do not promote clone behavior into production until Max review, Lux audit, Caesar gate, and Lucas OK.
- Any source edit requires an approved understanding check and mapped regression plan.

## Acceptance Criteria

1. A clear architecture note explains how the clone differs from live 9001 and why live 9001 is preserved.
2. A test port is selected and recorded before launch.
3. Clone launch evidence includes port, PID, command, and shutdown/rollback method.
4. OS agent attach/detach test evidence includes at least:
   - attach request path or manual command
   - attached session identity
   - visible terminal tail before attach
   - visible terminal tail after attach
   - detach/stop evidence
5. Terminal display evidence distinguishes:
   - raw ANSI/PTY stream
   - text preview
   - final human-visible screen/tail
6. Max verifies developer understanding before edits.
7. Areum confirms ledger readability and evidence index.
8. Lux either returns for fix with exact missing evidence or gives OK_SIGN.
9. Caesar reports final state to Lucas with residual risks and rollback anchors.
10. Human-visible evidence must prove the operator-facing terminal remains usable after attach and after detach.
11. Every assignee must have visible semantic delivery evidence in PTY; API ACK alone is not sufficient.
12. Every developer edit must be preceded by a visible `UNDERSTANDING_APPROVED` line from Max or Caesar.
13. Max must produce continuous `MANAGER_CHECK` reports during clone execution.
14. Final closure requires an explicit Lucas OK line or a recorded `pending_lucas_ok` closure gate.

## 9100 Board Summary Format

The 9100 view must let Lucas see the following by 20:00 KST:

```text
OS Agent Attach Clone Test
status=<not-started|planning|in-progress|return-for-fix|qa|ok-sign|blocked>
live_9001=<preserved PID evidence>
test_port=<port|pending>
clone_pid=<pid|pending>
owner_chain=<Lucas->Caesar->Max->developers->Areum/Lux>
current_owner=<role/session>
latest_action=<one line>
latest_evidence=<path or pending>
lux_gate=<pending|return_for_fix|ok_sign>
areum_gate=<pending|return_for_fix|ok_sign>
next_decision=<who must decide what>
rollback=<ready evidence path|pending>
```

Until 9100 server code is explicitly changed, this markdown report is the 9100-readable source and is linked from `terminal-instability-real-ledger-20260604.md`.

## Review Outcome Lines

Managers and reviewers must append one of these exact lines when they review:

```text
MAX_REVIEW task=OS-AGENT-ATTACH-CLONE-20260604 status=<approved_for_edit|return_for_fix|blocked> evidence=<path|none> blocker=<none|...>
AREUM_REVIEW task=OS-AGENT-ATTACH-CLONE-20260604 status=<ok_sign|return_for_fix> missing=<none|...> blocker=<none|...>
LUX_AUDIT task=OS-AGENT-ATTACH-CLONE-20260604 status=<ok_sign|return_for_fix> missing=<none|...> human_risk=<none|...> blocker=<none|...>
CAESAR_GATE task=OS-AGENT-ATTACH-CLONE-20260604 status=<approved_for_edit|hold|blocked|ready_for_lucas> reason=<one line>
```

## Semantic Delivery Gate

The following does not count as delivery by itself:

- WebSocket `promptTextAck`
- WebSocket `promptSubmitAck`
- HTTP `ok=true`
- command injection log without PTY-visible response

Delivery counts only when the target PTY shows a semantic line such as:

```text
ACK OS-AGENT-ATTACH-CLONE-20260604 state=acknowledged owner=<session-id>
UNDERSTANDING_CHECK OS-AGENT-ATTACH-CLONE-20260604 ...
MANAGER_CHECK OS-AGENT-ATTACH-CLONE-20260604 ...
REPORT OS-AGENT-ATTACH-CLONE-20260604 ...
```

Caesar must use terminal tail evidence for delivery verification.

## Developer Understanding Approval Gate

Before any developer edits:

1. Max assigns the developer with explicit permission.
2. Developer replies with `UNDERSTANDING_CHECK`.
3. Max or Caesar replies visibly:

```text
UNDERSTANDING_APPROVED OS-AGENT-ATTACH-CLONE-20260604 assignee=<developer-id> permission=<inspect|edit|verify> scope=<files> blocker=none
```

Without that line, developers remain inspect-only.

## Manager Check Cadence

During clone execution Max must report at least every 3 minutes, and immediately after any launch/attach/detach event:

```text
MANAGER_CHECK OS-AGENT-ATTACH-CLONE-20260604 state=<planning|launching|attach-test|detach-test|qa|blocked> owner=<current-owner> live_9001_pid=<pid> test_port=<port|pending> evidence=<path|pending> next=<one line> blocker=<none|...>
```

Missing manager checks are a Lux return-for-fix condition.

## Human-Visible Terminal QA

Clone work is not accepted unless evidence proves both:

- live operator terminal remains usable and undisturbed
- clone terminal attach/detach is understandable to a human operator

Required evidence:

```text
HUMAN_VISIBLE_QA OS-AGENT-ATTACH-CLONE-20260604 surface=<live-9001|clone-port|9000-view|9100-board> phase=<before|after-attach|after-detach|sustained> screenshot=<path> text_tail=<path|inline> result=<pass|return_for_fix> notes=<one line>
```

At minimum:

- live 9001 before clone launch
- live 9001 after clone launch
- clone view after attach
- clone view after detach
- 9100 board summary before 20:00

## Lucas Closure Gate

The task cannot close without one of:

```text
LUCAS_OK_SIGN OS-AGENT-ATTACH-CLONE-20260604 at=<timestamp> notes=<optional>
PENDING_LUCAS_OK OS-AGENT-ATTACH-CLONE-20260604 reason=<waiting-for-20:00-review> evidence=<report-path>
```

If Lux gives `ok_sign` before Lucas review, Caesar must still report `pending_lucas_ok`, not complete.

## Commit Gate

No commit is allowed until all of the following are true:

- Max has reviewed developer evidence.
- Areum has `ok_sign` for ledger clarity and 9100 readability.
- Lux has `ok_sign` or Caesar explicitly records why a Lux return is being overridden.
- Tests/build/clone QA evidence paths are recorded.
- Live 9001 PID preservation is recorded after the clone test.
- Rollback anchor is recorded.

Commit scope must exclude unrelated dirty files and must be split if source work and report work diverge.

## Rollback Anchor

Current known rollback anchors before this clone task:

- `5c937fd Stop terminal views resizing source PTY`
- `cc82ce5 Record terminal recovery ledger drill`
- `74bb18f Record terminal instability real ledger`
- `839f3dd Show active terminal ledger on 9100`
- `72a1a20 Update terminal ledger delivery evidence`
- `08e9c98 Approve narrow terminal edit via ledger`

Before any clone-related source edit, Max must record:

- current branch
- current HEAD
- dirty files in scope
- exact files planned for edit
- rollback command plan that does not discard unrelated user changes

## Forbidden Paths

- No live 9001 restart.
- No production promotion during the test.
- No vague "works" report without screenshot/text/API evidence.
- No direct Caesar implementation unless Lucas explicitly suspends ledger test mode again.
- No hidden use of raw PTY writes for submit.
- No closing or disrupting Lucas's visible terminal work surface.

## Current State

- status=assigned-by-Lucas
- blocker=Max visibility blocked after Caesar gate; dev-lead PTY tail is fragment-dominated while Max appears stuck in Working state
- current_action=Caesar monitoring Max; no developer edit/assignment issued until Max semantic report or Lucas/Caesar recovery decision
- existing_terminal_instability_report=data/task-reports/terminal-instability-real-ledger-20260604.md
- active_9100_surface=currently shows terminal instability report; this task is linked there for 20:00 review

## Evidence Index

Pending:

- Max understanding check
- Developer assignment and understanding checks
- Areum ledger review
- Lux audit review
- test-port selection
- clone launch evidence
- OS attach/detach evidence
- sustained terminal display evidence
- final 20:00 report

## Live Log

- 2026-06-04T14:55 KST: Lucas clarified root cause: live 9001 is preserved because existing agents depend on it. New direction is to clone 9001-style backend on an arbitrary port and test OS agent attach/detach there through the ledger system.
- 2026-06-04T14:55 KST: Caesar stops direct coding and creates this task packet for Max/Areum/Lux operation.
- 2026-06-04T14:58 KST: Max ACK/UNDERSTANDING_CHECK received. Areum returned for fix: missing explicit owner chain, 9100 board summary format, Areum review outcome line, commit gate, rollback anchor. Lux ACK/UNDERSTANDING_CHECK received. Caesar updated this packet to address Areum's return.
- 2026-06-04T15:00 KST: Max reviewed updated packet as `approved_for_edit`. Areum reviewed updated packet as `ok_sign`. Lux returned for fix: missing human-visible evidence requirements after attach/detach, semantic delivery gate, developer UNDERSTANDING_APPROVED requirement, MANAGER_CHECK cadence/evidence format, live operator terminal usability QA, and final Lucas OK/pending gate. Caesar updated this packet to address Lux return.
- 2026-06-04T15:03 KST: Lux reviewed the second update as `ok_sign missing=none human_risk=none blocker=none`. Areum remained `ok_sign`. Max had been blocked waiting for Lux OK; Caesar gate now allows Max to run the developer understanding plan and propose owners. Source edits still require explicit developer understanding approval and scoped permission.
- 2026-06-04T15:06 KST: Caesar sent `approved_for_developer_understanding` gate to Max. WebSocket promptText/promptSubmit ACK succeeded, but after 2+ minutes Max did not produce `MANAGER_CHECK` or `MAX_PLAN`. Terminal reader showed `fragmentDominated=true`, tail dominated by `W/Wo/or/rk/ki/in/Wng/Wog` fragments, and Max still `Working`. Caesar records this as a visibility/coordination blocker and does not bypass Max into developer edit assignments.

## Current Gate State

```text
MAX_REVIEW task=OS-AGENT-ATTACH-CLONE-20260604 status=approved_for_edit evidence=D:\Lucas Core v0.1\data\task-reports\os-agent-attach-clone-ledger-20260604.md blocker=none next=developer-understanding-plan
AREUM_REVIEW task=OS-AGENT-ATTACH-CLONE-20260604 status=ok_sign missing=none blocker=none
LUX_AUDIT task=OS-AGENT-ATTACH-CLONE-20260604 status=ok_sign missing=none human_risk=none blocker=none
CAESAR_GATE task=OS-AGENT-ATTACH-CLONE-20260604 status=approved_for_developer_understanding reason=Lux/Areum ok; Max may assign inspect/planning and collect understanding checks before edit
MANAGER_VISIBILITY task=OS-AGENT-ATTACH-CLONE-20260604 status=blocked owner=dev-lead evidence=9001 dev-lead terminal tail fragmentDominated=true blocker=Max semantic MANAGER_CHECK/MAX_PLAN not visible after gate
```

## Restart-Safe Diary

Purpose: if 9001 restarts at any time, the next Caesar/Max/Areum/Lux/developer session must be able to continue without relying on terminal scrollback.

Current truth as of 2026-06-04T15:10 KST:

- Lucas direction: test OS-agent attach/detach on a 9001-style clone port first. Preserve live 9001 until a deliberate restart decision.
- Concept: LCC-created agents should run as managed background/PTY processes. If the control plane drops, agents become temporarily orphaned and then reattach. A random external CMD-launched Codex cannot be assumed recoverable if CMD is closed.
- Task packet: `data/task-reports/os-agent-attach-clone-ledger-20260604.md`.
- 20:00 KST expectation: Lucas can inspect 9100 and see concise progress, evidence, blockers, Lux OK/return state, and next decision.
- Areum gate: `ok_sign`.
- Lux gate: `ok_sign`.
- Caesar gate: approved Max to run developer understanding plan only, not source edits.
- Max state: visibility blocked after gate; dev-lead tail was fragment-dominated and no semantic `MANAGER_CHECK`/`MAX_PLAN` was visible after 2+ minutes.
- Current prohibition: no live 9001 restart, no source edit, no developer edit assignment, no production promotion unless Lucas/Caesar explicitly changes the gate.
- Existing live issue: terminal preview/tail instability comes from 9001 providing ANSI/preview fragments instead of a stable final human-visible screen buffer.
- Useful recovery evidence:
  - session logs/tails in live 9001 `/api/sessions`
  - system evidence under `data/system-logs/terminal-9000-cdp/`
  - active task reports under `data/task-reports/`
  - git commits through `08e9c98`
  - dirty files must be inspected before any commit/reset

Restart first action:

1. Read this file.
2. Read `data/task-reports/terminal-instability-real-ledger-20260604.md`.
3. Confirm live ports 9000/9001/9100 and any clone test port.
4. Read current git status.
5. Read session tails for Caesar, Max, Areum, Lux.
6. If Max remains visibility-blocked, either recover Max or explicitly record a Caesar/Lucas decision to reassign planning.
