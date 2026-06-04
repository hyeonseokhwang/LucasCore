# Spring MSA Researcher 4 Checklist And Report Template - 2026-05-31

Owner: Spring MSA Researcher 4
Handoff target: Joon MSA
Schedule: 2026-05-31 20:00 KST Spring MSA study
Audience: Lucas

## 1. Lucas Confirmation Questions

Use these after the lesson or as checkpoints during the 20:00 KST session.

1. What is the main difference between a modular monolith and MSA?
2. Why should LCC Core not be split into MSA immediately?
3. Which LCC Core capability is the strongest first service candidate, and why?
4. What data should `ledger-service` own?
5. What must `runtime-service` not directly access if `ledger-service` owns the ledger database?
6. When is an API Gateway useful in a Spring MSA design?
7. When are Config Server and Discovery useful, and when are they overkill?
8. When should services use REST, and when should they publish events?
9. Why are cross-service database transactions risky?
10. Why should `LedgerEventCreated` include `trace_id` and `schema_version`?

## 2. Practice Tasks

### Practice A: `LedgerEventCreated` Schema

Lucas writes a small event schema with these fields:

- `event_id`
- `event_type`
- `schema_version`
- `occurred_at`
- `producer`
- `actor`
- `work_item_id`
- `trace_id`
- `payload`

Acceptance checklist:

- Includes every required field.
- Uses `ledger-service` as producer for ledger events.
- Explains what `trace_id` is used for.
- Explains why schema versioning is needed.
- Keeps the payload business-specific instead of hiding all meaning in a generic string.

### Practice B: Service Ownership Table

Lucas fills this table for `runtime-service`, `ledger-service`, and `sync-service`.

| Service | Owns | Must not access directly | Communicates by |
| --- | --- | --- | --- |
| `runtime-service` | | | |
| `ledger-service` | | | |
| `sync-service` | | | |

Acceptance checklist:

- Each service has one clear responsibility.
- Each service owns only its own data.
- At least one forbidden direct access is listed for each service.
- Communication uses API or event, not shared database access.
- `runtime-service -> ledger-service -> sync-service` flow is understandable.

## 3. Scoring Checklist

Mark each item as `pass`, `partial`, or `miss`.

| Check | Expected answer |
| --- | --- |
| MSA definition | Responsibility, data ownership, and deployment boundary separation |
| Current LCC Core direction | Local monolith now, modular boundaries first |
| First stable contract | `LedgerEvent` event schema before network extraction |
| Data ownership rule | Services do not read or write each other's databases directly |
| Communication rule | API for commands/queries, events for state changes |
| Spring mapping | Boot app, controller, service/application layer, repository/port, actuator |
| Gateway judgment | Useful for external entrypoint, routing, auth handoff, traffic policy |
| Discovery/config judgment | Add when deployment/config complexity requires it |
| Transaction judgment | Prefer local transaction, outbox/saga/eventual consistency across services |
| LCC Core service candidates | runtime, ledger, sync, auth, artifact |

Minimum pass:

- Lucas can explain the MSA definition in his own words.
- Lucas can name why LCC Core should not split immediately.
- Lucas can complete at least Practice A or Practice B with no critical data ownership error.

## 4. Post-Study REPORT Template

```text
[Spring MSA Study REPORT][2026-05-31 20:00 KST]
Status:
Completed/Missed/Blocked:
Lucas understanding:
Covered topics:
Practice A - LedgerEventCreated:
Practice B - Service ownership table:
Scoring checklist:
Open questions:
Next instruction:
Evidence:
```

## 5. Handoff Note For Joon MSA

Use this checklist as the 20:00 KST session verification sheet. If HQ/Haneul history remains unavailable, proceed with the local fallback lesson plan in `docs/spring-msa-lesson-plan-lucas-20260531.md` and record the completed/missed/blocked result with the post-study REPORT template above.
