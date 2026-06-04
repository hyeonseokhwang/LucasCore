# Command Chain Policy - 2026-05-31

This policy defines who commands, who executes, who verifies, and how exceptions are recorded in LCC Core multi-agent operations.

## Authority Model

Authority order:

1. Lucas / HQ
2. Chief Min
3. Dev Lead
4. Assigned developer or tester agents

Operational default:

```text
Lucas / HQ -> Chief Min -> Dev Lead -> Developer(s) -> Dev Lead -> Chief Min -> Lucas / HQ
```

When Lucas explicitly takes direct control of the development team:

```text
Lucas / HQ -> Developer(s)
Chief Min -> policy, audit, runtime visibility, and command-chain maintenance only
Dev Lead -> optional reviewer or coordinator if Lucas asks
```

## Role Boundaries

Lucas / HQ:

- sets business priority, final acceptance criteria, and emergency overrides
- may directly command any agent
- may suspend normal delegation at any time

Chief Min:

- keeps command chain, policy, evidence, and runtime visibility coherent
- may define test scenarios and acceptance gates
- must not execute developer tasks when Lucas has taken direct control
- must not issue competing developer instructions while Lucas is directly commanding the team
- may perform emergency runtime recovery only when visibility or control is unavailable

Dev Lead:

- decomposes Chief Min or Lucas objectives into developer assignments
- prevents duplicate or conflicting work
- reviews reports and verifies whether evidence meets acceptance criteria
- is not the default implementer
- remains accountable after issuing an assignment; Dev Lead must monitor ACK, heartbeat, live session output, blockers, and evidence until the task is completed, blocked, stopped, or cleanly handed off

Developers:

- execute assigned tasks
- report evidence, blockers, and residual risk
- do not silently switch scope
- stop and ask for priority resolution when commands conflict

Test Agents:

- run isolated verification, stress, or reproduction tasks
- do not make product changes unless explicitly promoted to developer role
- report raw evidence before interpretation

## Command Modes

### Normal Mode

Chief Min routes work through Dev Lead.

Rules:

- Developers should not receive implementation instructions directly from Chief Min unless Dev Lead is unavailable.
- Dev Lead owns assignment, review, and final developer summary.
- Chief Min owns acceptance against Lucas's objective.

### Lucas Direct Control Mode

Triggered when Lucas says he will control the developers directly or gives direct developer instructions.

Rules:

- Chief Min stops sending work orders to Dev Lead or developers unless Lucas asks.
- Chief Min may still inspect local state, update policy, check service health, and maintain evidence.
- Chief Min may answer status questions using observed facts, but must distinguish observed facts from developer claims.
- Chief Min must not launch, stop, attach, detach, or respawn agents unless Lucas asks or the control plane is unreachable.
- If Chief Min already performed a direct action before the mode was clarified, Chief Min must disclose it and hand control back.

### Emergency Recovery Mode

Triggered only when:

- control plane is unreachable
- no developer terminal can receive instructions
- runtime visibility is lost
- security containment requires immediate action
- Lucas explicitly orders immediate direct execution

Required recovery note:

```text
[chief-min-direct][emergency-recovery]
Reason:
State before:
Commands/processes/files touched:
State after:
Handoff:
```

## Conflict Resolution

If commands conflict:

1. Lucas / HQ instruction wins.
2. Newer Lucas instruction overrides older Lucas instruction.
3. Direct Lucas-to-developer instruction suspends Chief Min-to-Dev Lead routing for that scope.
4. Dev Lead resolves developer-to-developer conflicts.
5. Developers must not choose between conflicting orders silently.

Conflict report format:

```text
[blocker][command-conflict]
received_from:
conflict:
current_state:
requested_resolution:
```

## Evidence Requirements

Every meaningful action must be attributable.

Minimum evidence:

- issuer
- assignee
- command or task id
- affected session/process/file/API
- verification output
- residual risk

## Manager Monitoring Duty

Managers must treat assignment as the start of supervision, not the end of the task.

Every active task must have one integrated markdown task file. This file is the command-chain context pack, progress note, evidence index, and final report for that task. It prevents restart context loss and command drift between Caesar, Max, and developers.

The file must be self-contained enough for a new assignee to execute without chat history. A terse backlog-style note is not sufficient for development work where intent can be misread.

Required checks:

- create or update the integrated task file before assignment or source edits
- preserve Lucas's original intent and visible symptom in plain language
- list wrong interpretations already seen and explicitly forbid them
- name the source root and files only after verifying where real source lives
- ensure assignees read that file before acting
- require assignees to restate the task in their own words before implementation
- approve, correct, or reject the restatement before allowing edits
- confirm assignee ACK within 30 seconds
- verify visible progress or heartbeat at least every 3 minutes while work is active
- inspect live terminal/session output and evidence directly before accepting a report
- intervene when a task has no visible work, no heartbeat, unclear owner, missing evidence, or stale blocker
- record or report the intervention as reassign, stop, escalate, unblock, or accept

Max owns this duty for developer work. Caesar owns this duty for Max and for emergency command-chain coherence. A manager may delegate execution, but not monitoring accountability.

## Understanding Check Gate

Parallel development must not proceed from instruction directly to implementation.

Before edit permission is exercised, the assignee must report:

```text
UNDERSTANDING_CHECK <task-id> owner=<session-id> objective=<own words> lucas_intent=<own words> forbidden=<list> files=<paths> protected=<contracts> acceptance=<checks> questions=<none|...>
```

Manager response:

```text
UNDERSTANDING_APPROVED <task-id> manager=<session-id> assignee=<session-id> permission=edit
UNDERSTANDING_CORRECTION <task-id> manager=<session-id> assignee=<session-id> correction=<what was misunderstood> next=<revise|ask|stop>
```

Rules:

- If the assignee cannot restate the task, they must ask questions before editing.
- If the restatement misses Lucas intent or forbidden actions, the manager must stop implementation and correct it.
- Tests passing does not satisfy this gate. The question is whether the intended behavior was understood before code changed.
- Repeated failure to pass the understanding check means the manager must reassign or take direct recovery action.

## Integrated Task File Quality Gate

Managers must write task files as operational packets, not ledger shorthand.

Required sections for non-trivial work:

```text
Objective
Lucas Intent
Current Symptom / Evidence
Why This Matters
Known Wrong Interpretations
Forbidden Actions
Source Root / Files
Protected Contracts
Implementation Direction
Understanding Check Questions
Acceptance Evidence
Live Progress
Open Decisions / Blockers
```

Rules:

- Include enough context that the next agent does not need to infer from the task title.
- Quote or paraphrase the key Lucas instruction in behavior terms, not just technical labels.
- Record previous failed interpretations so they are not repeated.
- Do not say only "fix terminal replay" when the user's intent is "do not replay on view creation."
- If the task file cannot answer what success looks like, it is not ready for assignment.

Runtime actions require:

- target port or service
- target process id before and after, when applicable
- endpoint or UI URL
- attach/detach/start/stop outcome

## Approval Gates

The following require explicit Lucas or Dev Lead approval unless already assigned:

- adding new long-running agents
- terminating active developer agents
- changing model assignments
- changing runtime port ownership
- switching a port from API-only to API+web
- modifying command-chain policy
- marking a feature complete

## Unratified Work

Any action taken outside the current command mode is unratified until reviewed.

Review outcomes:

- `accepted`: keep result
- `needs-verification`: run assigned validation
- `rollback-requested`: revert or neutralize
- `superseded`: leave artifact but stop relying on it

## Startup Reminder

At the start of any multi-agent operation, Chief Min should state the active command mode:

```text
Command mode: Normal
Command mode: Lucas Direct Control
Command mode: Emergency Recovery
```

The mode remains active until Lucas changes it or the emergency is resolved.
