# Ledger Operating Drill After Terminal Recovery - 2026-06-04

## Status

- owner: Caesar
- mode: tabletop drill
- source of truth: this MD report only
- JSON ledger reference: not used
- runtime impact: none
- backup before drill: `5c937fd Stop terminal views resizing source PTY`
- result: pass with required process changes

## Purpose

This drill verifies whether file-based ledger operation can prevent the failure pattern seen during terminal recovery:

1. The original intent was clear to Lucas but was diluted while moving through Caesar, Max, and developers.
2. Developers acted before proving they understood the task.
3. Review focused on activity evidence, but missed whether the visible user problem was actually resolved.
4. Approval and rejection gates were not explicit enough, so incomplete work looked finished.

The goal is not to create real work. The goal is to prove the operating process catches these gaps before source changes spread.

## Protected Context

Terminal recovery exposed the following protected contracts:

- Source terminal state must be owned by the running PTY/Codex session, not by web card dimensions.
- Card, popout, and fullscreen views may render independently, but must not mutate source PTY size unless explicitly authorized.
- Browser refresh or popout open must not force another view to reload, replay, or change terminal shape.
- Command injection and Enter submit remain separated.
- UI verification must use visible evidence, not only tests.

## Drill Task Card

```text
[CAESAR->MAX][DRILL terminal-view-contract-20260604] permission=inspect mode=tabletop
Context:
Lucas says the source is one CMD/Codex terminal tail. Each LCC view only displays that source.
The view may fit itself locally, but must not resize or rewrite the source PTY.

Task:
1. Restate the requirement in your own words.
2. List the protected contracts touched.
3. State what evidence would prove the requirement is met.
4. Do not edit source. Report blockers.

Reply format:
ACK drill=<id> understood=<yes|no> source=<one-pty-tail> view=<independent-render-only>
protected=<contracts> evidence=<checks> blocker=<none|...>
```

## Expected Max Understanding

Max must report:

- The terminal source is one PTY/Codex tail, not one tail per card.
- Views are independent renderers.
- A card width must not become the source terminal width.
- A popout refresh must not rerender or resize the card.
- Any source edit touching terminal rendering requires explicit permission and regression evidence.

If any item is missing, Caesar rejects the task before development starts.

## Expected Developer Understanding

Each developer must report the same requirement at the file/function level:

- `HqTerminalPreview` is a viewer.
- WebSocket `attach` must not send `cols` and `rows` from passive views.
- `FitAddon.fit()` can fit local xterm dimensions, but must not imply source PTY resize.
- Popout, fullscreen, and cards should share source content while preserving independent local layout.

If a developer says "replay is the source" or "card size should resize the terminal session", the task is rejected and reassigned after clarification.

## Acceptance Gate

Before Caesar can mark the work complete:

- Unit regression passes for terminal replay/sanitizer behavior.
- Web build passes.
- 9001 singleton is preserved.
- 9000 may be restarted only for web update.
- CDP or screenshot evidence shows card view.
- CDP or screenshot evidence shows popout view.
- Opening or refreshing one view does not visibly force the other view into card-width output.
- Lucas approval is required for final acceptance. Without Lucas approval, status remains `needs-review`.

## Backout Gate

Immediate rejection conditions:

- Any patch reintroduces browser view resize as the default source PTY behavior.
- Any patch uses snapshot preview as the normal terminal source.
- Any patch treats replay storage as the canonical runtime source.
- Any patch edits terminal submit/newline paths without explicit approval.
- The visible terminal still collapses to short fragments such as `W`, `Wo`, `Wor`, or `?2026h`.

## Drill Result

The current fixed commit matches the intended direction:

- commit: `5c937fd Stop terminal views resizing source PTY`
- changed file: `apps/web/src/main.tsx`
- behavior changed: passive terminal views no longer send `cols` or `rows` on attach
- preserved: local xterm fit/render behavior
- preserved: 9001 source session

Verification recorded during the fix:

- `npm --prefix apps/web test -- terminalReplay`: passed
- `npm --prefix apps/web run build`: passed
- 9001 listener remained active
- 9000 web was restarted for the updated frontend
- card screenshot captured
- popout screenshot captured

## Gaps Found

1. Ledger entries must include the "why", not only the "what".
   A terse work item allowed Max/developers to optimize around implementation details instead of Lucas's source/view model.

2. Understanding must be collected before edit permission.
   A manager should not assign edit work until each assignee has repeated the protected contract correctly.

3. Manager monitoring must be continuous.
   A single instruction is not enough. Managers must inspect visible terminal tails and developer reports until completion or escalation.

4. Evidence must be user-problem evidence.
   Tests are necessary but insufficient. This class of issue requires card and popout visual checks.

5. Approval is a separate gate.
   Work is not complete merely because the agent reports success. Lucas can reject the result, and the ledger status must reflect that.

## Process Change

For future ledger-driven work, each MD ledger item must contain:

- full context
- explicit non-goals
- protected contracts
- permission level
- exact owner
- expected understanding reply
- edit gate
- verification gate
- approval gate
- backout conditions
- final evidence
- lessons learned

Managers must update the MD file as the task moves. If the file is not current, the task is not current.

## Caesar Decision

The tabletop drill passes as a process definition.

Operational rule to carry forward:

Before Max or a developer edits protected source, Caesar must see a written understanding check in the task MD and reject vague acknowledgements.

