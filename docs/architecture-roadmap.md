# Architecture Roadmap

## Product Direction

LCC Core should remain a terminal-first local control plane for coordinating agent work.

The next product layer is Work Ledger: a durable record of tasks, decisions, evidence, reviews, and handoffs. Canvas and Peer Bridge can stay as operator surfaces, but Work Ledger should become the source of truth for auditable work history.

## Clean Architecture Target

Keep business rules independent from web routes, UI shape, local files, and future MSA deployment.

Recommended layers:

- `domain`: pure Work Ledger concepts and invariants.
- `application`: use cases that coordinate domain objects and ports.
- `adapters`: HTTP, WebSocket, CLI/session runtime, file storage, database storage, sync clients.
- `providers`: replaceable implementations selected by runtime config.

## Work Ledger Domain

Start with these domain entities:

- `WorkItem`: objective, owner, status, priority, branch, timestamps.
- `LedgerEvent`: append-only event for assignment, edit, review, decision, blocker, verification, handoff.
- `Actor`: HQ, dev-lead, developer, system.
- `Evidence`: command output, log excerpt, screenshot, file reference, test result, SHA, commit id.
- `Decision`: accepted, rejected, needs changes, deferred.

Domain rules:

- events are append-only
- every event has actor, time, label, and source
- implementation events must link to a work item
- review and release decisions must link to evidence
- blockers must record the required external decision or state change

## Application Layer

Initial use cases:

- `create_work_item`
- `assign_work_item`
- `append_ledger_event`
- `attach_evidence`
- `record_review`
- `close_work_item`
- `list_work_items`
- `timeline_for_work_item`
- `export_audit_bundle`

Application services should depend on ports, not concrete storage or sync code.

Core ports:

- `WorkLedgerRepository`
- `EvidenceStore`
- `SessionEventSource`
- `AuditExporter`
- `SyncProvider`

## Adapters

Keep adapters thin.

Initial adapters:

- HTTP routes for UI and API clients.
- WebSocket event adapter for live ledger updates.
- Terminal/session adapter that can convert relevant session events into ledger events.
- JSONL storage adapter for v0.1 local durability.
- File evidence adapter for screenshots, logs, and exported command output.

Later adapters:

- PostgreSQL repository.
- Object storage evidence backend.
- SaaS sync client.
- Remote worker event adapter.
- SSO/license auth adapter.

## Storage Provider Path

Use a provider boundary before changing databases.

Recommended sequence:

1. Define `WorkLedgerRepository` and `EvidenceStore` traits.
2. Implement local JSONL provider: `data/work-ledger.jsonl`.
3. Add snapshot/read-model file if list queries become expensive.
4. Add PostgreSQL provider behind the same traits.
5. Keep migration/export commands explicit and auditable.

Do not make Canvas storage the long-term ledger store. Canvas can reference ledger work items, but ledger data should have its own append-only storage model.

## Sync Provider Path

Sync should be event-based and optional.

Recommended sequence:

1. Keep local-only ledger as the default.
2. Define `SyncProvider` with push/pull event batches and conflict reporting.
3. Add signed event ids and monotonic per-node sequence numbers.
4. Support team sync through a SaaS provider or on-prem relay.
5. Treat conflicts as ledger events, not silent overwrites.

MSA integration should consume ledger events instead of reaching into local storage. The first stable integration contract should be an event schema, not a shared database.

## MSA Boundary

Future services can split along these lines:

- `runtime-service`: terminal/session lifecycle and streaming.
- `ledger-service`: work items, ledger events, audit export.
- `sync-service`: team replication and cloud relay.
- `auth-service`: account, license, SSO, policy.
- `artifact-service`: logs, screenshots, evidence blobs.

Keep LCC Core able to run as a local monolith by wiring the same ports to local providers.

## Next Actions

1. Add a Work Ledger domain module before adding more Canvas-specific persistence.
2. Introduce repository traits and a JSONL ledger provider.
3. Add API routes for work item list, timeline, event append, and evidence attach.
4. Link Peer Bridge messages to ledger events.
5. Add audit export from ledger events and evidence references.
6. Only then introduce PostgreSQL or sync providers.
