# Ledger Ops Drill Virtual - 2026-06-03

## Status

- State: return-for-fix
- Owner: Caesar
- Mode: virtual-drill
- Product impact: none
- JSON ledger reference: off
- Lucas approval: pending

## Purpose

This is a virtual ledger-operation drill. It must not create real product work or source changes.

The purpose is to test whether file-backed ledger operation prevents these failures:

- context loss after restart or handoff
- vague task cards that cause interpretation drift
- agents starting work without understanding approval
- managers assigning and disappearing
- missing heartbeat or stuck-input detection
- missing QA evidence
- missing Caesar review
- reporting "done" without Lucas OK
- stale or conflicting ownership

## Virtual Scenario

Scenario ID: `VIRTUAL-LEDGER-DRILL-TERMINAL-FIT-001`

Pretend Lucas requested a harmless UI copy adjustment named:

`Virtual terminal status label wording review`

This scenario is intentionally non-executable. No source file may be edited.

The drill tests the process only:

1. Areum reviews this MD as the canonical task packet.
2. Areum checks whether the packet contains enough context, fields, owner rules, approval gates, and return-for-fix rules.
3. Audit Officer reviews both this packet and Areum's proposed operating model.
4. Caesar decides whether the virtual item is acceptable to operate or must be returned for fix.
5. If acceptable, Caesar issues a virtual assignment card to Max with permission `inspect` only.
6. Max must perform an understanding check, not implementation.
7. Caesar/Audit verify whether Max's response proves understanding before any work would start.

## Non-Negotiable Rules

- Do not edit product source.
- Do not read suspended JSON ledgers.
- Do not use 9100 ledger board for this drill.
- Do not assign developers to real work.
- Do not mark complete without Lucas OK.
- Every role must explicitly state whether it understands:
  - objective
  - forbidden actions
  - permission scope
  - evidence expected
  - reviewer/approval chain
  - blocker handling

## Permission Contract

- Areum: `permission=inspect`
- Audit Officer: `permission=inspect`
- Max, if later used: `permission=inspect`
- Developers: not used in this first drill unless Lucas approves expansion

If permission is omitted, default is `inspect` only.

## Acceptance Gates

Gate A: Packet Completeness

- The task packet explains Lucas intent, context, forbidden actions, scope, owner chain, evidence, approval, and return-for-fix conditions.

Gate B: Understanding Check

- Assignee must restate the task in their own words before any operation.
- Manager must approve the restatement or return it for correction.

Gate C: Manager Monitoring

- Manager must monitor ACK, understanding check, heartbeat, report, and blocker state.
- A missing ACK or heartbeat is a manager action item.

Gate D: Evidence

- Reports must cite this MD path and exact observed state.
- No "done" report is accepted without evidence.

Gate E: Final Review

- Caesar can only report `ready_for_lucas_review` or `return_for_fix`.
- Lucas alone gives final `OK_SIGN` for this drill.

## Areum Review Request

Areum must report:

```text
AREUM_REPORT ledger_ops_drill status=<accepted|return_for_fix> completeness=<...> missing_fields=<...> proposed_improvements=<...> blocker=<none|...>
```

## Audit Officer Review Request

Audit Officer must report:

```text
AUDIT_REPORT ledger_ops_drill status=<accepted|return_for_fix> findings=<...> gates=<...> risks=<...> required_corrections=<...> blocker=<none|...>
```

## Caesar Review Result

- RETURN_FOR_FIX.
- Reason: the packet is usable as a first drill item, but the live operation exposed monitoring gaps before a full Areum/Audit review could complete.
- Required correction before operating this pattern broadly:
  - Task dispatch must verify assignee session status before treating `prompt-text` or `prompt-submit` ACK as delivery.
  - A visible prompt containing the task card is not enough; the manager must verify transition to `Working` or a semantic ACK/REPORT.
  - If a session is `exited`, API ACK must not be interpreted as assignee receipt.
  - Retry/submit escalation must be recorded as an operational exception.
  - Areum/Audit reviews must be captured into this same task packet or task-scoped event fragments, not only terminal scrollback.

## Operation Log

- 2026-06-03: Caesar created virtual drill packet.
- 2026-06-03: Caesar sent inspect-only review task to Areum.
- 2026-06-03: Caesar attempted audit task while Audit Officer was `exited`; API returned prompt ACKs despite the exited state. Logged as monitoring gap.
- 2026-06-03: Caesar respawned Audit Officer on 9001 only; 9001 listener PID stayed `14540`.
- 2026-06-03: Caesar resent audit task and manually retried `prompt-submit repeat=2`; terminal tail still showed task cards at prompt without `Working` transition or semantic report. Logged as submit/monitoring gap.
- 2026-06-03: Caesar marked drill `return-for-fix` pending stronger delivery/ACK verification and task-scoped event capture.
