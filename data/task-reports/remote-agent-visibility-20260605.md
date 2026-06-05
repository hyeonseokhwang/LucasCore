Objective

- Add a remote-readable branch agent census endpoint so HQ can see how many branch agents exist and what their latest visible state is without relying on the 9000 UI.

Lucas Intent

- When branch runtime is unstable, Lucas still needs a direct way to answer "how many agents are active right now" from a remote surface.
- The answer must not depend on reading raw PTY terminals or guessing from chat. It should come from a narrow API summary.

Current Symptom / Evidence

- Current branch visibility depends on local `9000` UI or direct `9001 /api/sessions`.
- If HQ is remote, or if the local UI is unavailable, there is no simple count of branch agents.
- Inbound branch API already exists for HQ-safe read-only access, but it does not expose branch agent census.

Why This Matters

- HQ cannot supervise staffing, outages, or restart state if branch active-agent count is invisible.
- Count, status, and recent preview are operational data, not optional convenience.

Known Wrong Interpretations

- Do not expose full `/api/sessions` from the inbound port.
- Do not expose terminal write, resize, delete, PTY stats, or log tail control just to answer agent count.
- Do not claim exact live state when the underlying session source is unavailable; degraded mode must be explicit.

Forbidden Actions

- No write/edit/delete/shell endpoints on inbound API.
- No token bypass.
- No changes to prompt-text / prompt-submit behavior.
- No 9001 restart for this task.

Source Root / Files

- Source root: `G:\Lucas-Initiative\LucasCore`
- Planned files:
  - `apps/api/src/main.rs`
  - `docs/branch-inbound-ops.md`

Protected Contracts

- Terminal newline/submit injection: not touched.
- Terminal render/replay: not touched.
- Branch inbound token gate: must remain enforced for protected branch APIs.

Implementation Direction

1. Add `GET /api/branch/agents`.
2. Require `X-LCC-Token`.
3. Reuse live session views when available.
4. If this process has no sessions, try the local branch session API and report whether that upstream was reachable.
5. Return a minimal agent schema: `id/status/pid/preview/last_activity` plus safe context fields needed for HQ counting.
6. Keep a degraded flag when live session API is unavailable instead of pretending the count is authoritative.

Understanding Check

- Objective: expose a remote branch-agent census endpoint for HQ.
- Lucas intent: HQ must be able to know how many branch agents are active without local UI dependence.
- Forbidden: no raw session API exposure, no token bypass, no prompt contract changes, no runtime restart.
- Files: `apps/api/src/main.rs`, `docs/branch-inbound-ops.md`.
- Protected: branch inbound auth only; terminal protected contracts untouched.
- Acceptance: token-gated `/api/branch/agents` returns branch agent count and per-agent summary; tests/build remain green.
- Questions: none.

Acceptance Evidence

- Branch inbound route exists and requires token.
- Response includes total/active counts and per-agent summary.
- When local session source is unavailable, response marks upstream status clearly.
- `cargo test --manifest-path apps/api/Cargo.toml` passes.

Live Progress

- 2026-06-05: Policy boot completed and live branch outage confirmed: 9001 not responding while 9000/9100 listeners remained partially present.
- 2026-06-05: Existing inbound-only branch API and file-inspection PoC reviewed.
- 2026-06-05: Existing 9100 board reviewed; it summarizes ledger state but not branch agent census.
- 2026-06-05: CTO direction narrowed scope to `GET /api/branch/agents` based on processed session data.
- 2026-06-05: Added `GET /api/branch/agents` to both normal and inbound routes in `apps/api/src/main.rs`.
- 2026-06-05: Implemented branch agent census response with counts plus per-agent `id/name/team/status/pid/source/preview/last_activity`.
- 2026-06-05: Inbound mode now prefers local `9001 /api/sessions`; if unavailable it falls back to `data/agent-status-latest.json` snapshot and marks the response degraded through `session_api`.
- 2026-06-05: `GET /api/branch/status` now includes `agent_total`, `agent_active`, `agent_session_source`, and upstream session-api state.
- 2026-06-05: Verification passed: `cargo fmt --manifest-path apps/api/Cargo.toml`; `cargo test --manifest-path apps/api/Cargo.toml` with 31/31 passing.

Open Decisions / Blockers

- Inbound-only runtime does not own terminal sessions in memory, so branch agent census must distinguish local-memory mode from proxied-session mode.
