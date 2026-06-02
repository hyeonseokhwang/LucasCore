# HQ Memory System Benchmark - 2026-06-01

## Inspected HQ Sources

- `D:\Lucas-Initiative-HQ\command-center\server\routes\memory.ts`
- `D:\Lucas-Initiative-HQ\command-center\server\db\schema-memory.ts`
- `D:\Lucas-Initiative-HQ\command-center\server\services\auto-memory.ts`
- `D:\Lucas-Initiative-HQ\command-center\server\services\memory-*`
- `D:\Lucas-Initiative-HQ\command-center\server\routes\tasks.ts`
- `D:\Lucas-Initiative-HQ\command-center\server\routes\meetings.ts`
- `D:\Lucas-Initiative-HQ\command-center\server\services\task-queue.ts`
- `D:\Lucas-Initiative-HQ\llm-village\src\npc\memory.mjs`

## Reusable Patterns

- Append-only memory stream is enough for the first reliable recovery layer.
- Memory entries need `agent`, `layer`, `scope`, `kind/category`, `importance`, `source`, `ledger/task linkage`, and evidence attribution.
- Recovery should merge personal memory, team/global memory, active task state, and recent events.
- HQ memory has richer DB features: vector search, compaction, transfer, reconsolidation, spaced review, and auto-memory hooks.
- Meeting/task events should generate memory automatically, but LCC should first expose a small durable API and avoid DB migration risk.

## Rejected For First LCC Cut

- Full PostgreSQL/Drizzle migration.
- Embedding/vector search.
- Spaced repetition and reconsolidation.
- Global team memory broadcasting.
- Automatic capture from all terminal output.

These are useful later, but they are too broad for the first restart-memory reliability patch.

## LCC First Cut

Implemented in `apps/api/src/main.rs`:

- `LCC_MEMORY_PATH`, default `data/memory-ledger.jsonl`.
- `GET /api/memory` with filters: `agent_id`, `scope`, `layer`, `kind`, `topic`, `search`, `limit`, `include_archived`.
- `POST /api/memory` to append a memory entry.
- `GET /api/memory/recover/:agent_id` to return personal memories, team/global memories, active work-ledger tasks, recent work-ledger events, and the restart report contract.

## Missing Acceptance Criteria

- API acceptance:
  - `GET /api/memory` must return stable JSON for filter-only reads and preserve append order unless an explicit sort is later introduced.
  - `POST /api/memory` must reject malformed payloads, preserve UTF-8/Korean text, and append exactly one JSONL line per accepted write.
  - `GET /api/memory/recover/:agent_id` must always return the recovery contract fields for personal memory, shared/team memory, active tasks, recent work-ledger events, and restart instructions even when one section is empty.
- Runtime acceptance:
  - No 9001 restart is required for memory API review, smoke, or documentation work.
  - Restart-risk notes must identify the touched runtime, current listener PID, and whether recovery depends on existing file-ledger state.
- Evidence acceptance:
  - QA must include one append/read smoke, one invalid-input rejection check, one UTF-8/Korean round-trip check, and one recovery response sample tied to a concrete agent id.
  - Commit readiness requires both the QA evidence set and the restart-risk note already referenced by the `memory-system-hq` ledger item.

## Proposed Evidence Index Fields

- `evidence_id`: stable identifier for cross-linking doc, ledger, and memory entries.
- `kind`: `api-smoke`, `invalid-input`, `utf8-roundtrip`, `recovery-sample`, `runtime-note`, `screenshot`, `test`, or `build`.
- `path`: local artifact path when file-backed evidence exists.
- `summary`: one-line statement of what the evidence proves.
- `source_agent`: reporting session id such as `developer-4` or `developer-8`.
- `linked_task_ids`: related work-ledger ids such as `memory-system-hq`.
- `linked_memory_ids`: appended memory entry ids when the evidence validates a concrete record.
- `endpoint_or_command`: exact API route or shell command used to produce the artifact.
- `captured_at`: ISO timestamp.
- `verified_by`: reviewer or QA owner when evidence is second-checked.
- `risk_note`: residual caveat, especially if the evidence is file-only or does not cover restart behavior.

## Commit Boundary Notes

1. Keep API/storage review fixes separate from any web recovered-context panel work.
2. Keep auto-memory writers for work-ledger and meeting events in a separate commit from the first-cut manual API.
3. Keep QA artifacts and restart-risk documentation in their own commit or final gate commit so Max can verify readiness without mixing unrelated UI/API edits.
4. Do not fold developer-7 remote-debug lane work into any memory-system commit boundary.

## Next Phases

1. Add web UI surface for recovered context per agent.
2. Add automatic memory writes from work-ledger events and meeting messages.
3. Add compaction summaries for long-running agents.
4. Add migration path to DB-backed storage if file-ledger volume becomes painful.
5. Add search scoring: recency + importance + keyword match, then optional embeddings.
