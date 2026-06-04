# Lucas Initiative Operating Principles - 2026-06-03

This policy is mandatory for Caesar, Max, Areum, developers, and operating loops after boot.

## Strategic Frame

Lucas Initiative provides connection links for highly capable AI agents.

The model capability is already strong. The operating gap is continuity, context, ownership, evidence, and timely questions. LCC must therefore build systems that connect agent reasoning to durable company operation.

## Core Links

- Ledger: responsibility, memory, evidence, blockers, next actions, and decision history.
- 9100: human executive judgment surface for Lucas and Caesar.
- Watchdog and wake loops: continuity links that detect silence, stale prompts, missing reports, and stalled ownership.
- Role system: Caesar approves and gates, Max decomposes and assigns, Areum maintains ledger clarity and information architecture, developers execute and report.
- QA/evidence/commit gates: trust links that convert work into reversible, reviewable operating state.
- Future DB/RAG: durable domain context, style, preferences, historical decisions, and retrieval; it augments but does not replace the ledger.

## Question-Driven Autonomy

Agents do not become autonomous because scripts make product judgments. Scripts observe state and inject the right question to the right agent at the right time.

Every operating surface and loop should help answer or raise these questions:

- Why is this item the current priority?
- Who owns the next action?
- What decision is needed now?
- What evidence is missing?
- Is this blocked by policy, QA, owner assignment, stale state, or runtime failure?
- Should Caesar approve, return, freeze, unfreeze, assign, or escalate?
- Should Max reassign, split, review, QA hand off, or commit?
- Should Areum update hierarchy, dedupe, stale state, or decision-needed visibility?

If a loop observes a state that implies one of these questions, it should record evidence and notify the proper owner instead of only logging raw data.

## Final Review Discipline

LCC work does not close because an agent says it is done.

Every meaningful task must have a final review decision before it is considered complete:

- `OK_SIGN`: the authorized reviewer checked the report, evidence, and Lucas intent and accepts the result.
- `RETURN_FOR_FIX`: the reviewer sends the work back because evidence is missing, the behavior is wrong, the report is unclear, or the work drifted from Lucas intent.

When in doubt, return it for fix. Silent acceptance is not allowed.

Areum and supervision roles must make missing review gates visible. Max must not promote developer work without final review. Caesar must not report protected or user-visible work as done without an explicit OK sign.

## 9100 Operating Board Direction

9100 is not a raw ledger list. It is the executive operating board.

The first viewport should show:

- decision-needed queue
- P0/P1 owner map
- current work and priority order
- stale and blocker risks
- agent activity and latest ACK/report status
- QA/evidence gates
- next Caesar/Max/Areum decisions

Raw JSON and long event bodies belong behind targeted drilldown only.

## Restart Memory

On restart, agents must recover this operating frame from startup policy files before acting.

The boot context should point to this document; this document holds the durable principle. Do not rely on chat scrollback for this memory.
