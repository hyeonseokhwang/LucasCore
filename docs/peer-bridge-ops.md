# Peer Bridge Operations

## Purpose

Peer Bridge is the operator protocol for coordinating HQ, branch leads, and developer agents in LCC Core.

The protocol keeps command flow explicit, makes audit trails reconstructable, and protects terminal visibility as the primary operator surface.

## Message Labels

Use bracketed labels at the start of routed messages.

- `[HQ -> dev-lead]`: HQ objective, priority, scope, or approval request.
- `[dev-lead -> HQ]`: lead summary, risk report, decision request, or final status.
- `[dev-lead -> developer-N]`: implementation, investigation, review, or verification task.
- `[developer-N -> dev-lead]`: result report, blocker, evidence, or handoff.
- `[branch:<name>]`: branch or workstream identifier.
- `[audit]`: evidence collection, verification, review notes, or trace reconstruction.
- `[blocker]`: condition that prevents progress without a decision or external state change.
- `[handoff]`: concise state transfer for another agent or future session.

Labels should be stable enough that an operator can reconstruct who asked for what, who acted, and what evidence was produced.

## Dev-Lead Policy

The dev-lead coordinates and reviews. The dev-lead is not the default implementer.

Dev-lead responsibilities:

- translate HQ goals into scoped developer tasks
- assign work to developer agents
- keep implementation work out of the lead terminal unless explicitly required
- review developer reports for correctness, scope, risk, and test coverage
- escalate blockers and approval decisions to HQ
- produce concise status summaries from developer evidence

Developer agents are responsible for implementation, local investigation, focused fixes, and verification.

## Developer Report Format

Developer reports to dev-lead should be short and evidence-based.

Required fields:

- `Status`: completed, partial, blocked, or needs review.
- `Scope`: files, modules, or behavior touched.
- `Changes`: concrete summary of implementation or investigation result.
- `Verification`: commands, tests, screenshots, logs, or manual checks performed.
- `Risks`: untested paths, assumptions, follow-up work, or known limitations.
- `Files`: changed files with line references when available.

For no-edit investigation tasks, replace `Changes` with `Findings` and list the inspected evidence.

## Audit Expectations

Every operationally meaningful action should leave enough evidence to answer:

- who issued the task
- who performed the work
- what changed or was inspected
- why the action was taken
- how the result was verified
- what risk remains

Audit notes should prefer concrete artifacts: file paths, line numbers, command names, log excerpts, screenshots, test names, commit ids, and SHA hashes.

Developers must not hide failed checks. A failed command, skipped test, or unavailable environment is part of the audit trail.

Dev-lead reports should separate developer claims from lead review conclusions.

## Terminal-First UI Rule

The terminal viewport is the primary UI for LCC Core operations.

UI chrome should not compete with terminal visibility. Headers, toolbars, sidebars, canvases, and auxiliary controls should be collapsible or compact when terminal work is active.

Recovery controls must remain reachable after collapsing UI chrome. At minimum, operators need access to controls that restore hidden panels, stop runaway sessions, inspect logs, and recover navigation.

Design priority order:

1. keep active developer terminals visible
2. keep recovery controls reachable
3. keep dev-lead coordination visible but compact
4. move secondary navigation and creation controls behind collapse, focus, or modal surfaces

The dev-lead terminal should not dominate the default terminal layout because the lead coordinates and reviews while developer agents implement.
