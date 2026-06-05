Objective

- Add a read-only branch agent visibility endpoint so HQ can see how many branch agents are active and what state they are in without opening terminal-control APIs.

Lucas Intent

- Lucas needs direct remote visibility into branch agent count and current activity because, in incidents like the current one, HQ cannot tell how many branch agents are still alive.
- The result must expose roster/count/status data, not terminal control.

Current Symptom / Evidence

- `9001` session control can become unavailable, and HQ currently lacks a dedicated branch-facing roster API.
- Existing inbound branch API only exposes:
  - `GET /api/branch/health`
  - `GET /api/branch/status`
  - `GET /api/branch/work-ledger`
  - `GET/POST /api/branch/messages`
- `docs/branch-inbound-ops.md` explicitly forbids exposing `/api/sessions` and `/ws/terminal` on the inbound port.

Why This Matters

- HQ needs to know total branch agents, active agents, stale/idle/blocked distribution, and last observed activity without relying on direct terminal access.
- This must remain usable even when the inbound process is separate from the live `9001` PTY backend.

Known Wrong Interpretations

- Do not expose raw `/api/sessions` on the inbound port.
- Do not add terminal write, attach, resize, log-tail, or websocket control to solve visibility.
- Do not assume `LCC_INBOUND_ONLY=1` shares in-memory live sessions with the main `9001` process.

Forbidden Actions

- No `/api/sessions` or `/ws/terminal` exposure on inbound.
- No terminal input/control endpoints.
- No restart/reload of `9001`.
- No unrelated ledger or UI refactor in this task.

Source Root / Files

- `apps/api/src/main.rs`
- `docs/branch-inbound-ops.md`

Protected Contracts

- Terminal newline/submit injection: untouched.
- Terminal render/replay/log control surface: must remain unexposed on inbound.
- Branch inbound security boundary: token-protected read-only API only.

Implementation Direction

- Add `GET /api/branch/agents`.
- Require `X-LCC-Token` like other protected branch endpoints.
- Build response from live `9001 /api/sessions` when reachable.
- Fall back to `data/agent-status-latest.json` snapshot when live `9001` is unavailable.
- Return compact roster fields for HQ: `id`, `name`, `team`, `status`, `pid`, `source`, `preview`, `last_activity`, plus summary counts and data source.

Understanding Check

- Objective in own words: create a safe branch roster API for HQ so they can remotely see how many branch agents are alive and what state they are in.
- Lucas intent in own words: visibility first; no remote terminal control; must help HQ answer “how many are up right now?”
- Forbidden paths in own words: no raw session API exposure, no PTY control, no `9001` restart, no broad UI changes.
- Planned files: `apps/api/src/main.rs`, `docs/branch-inbound-ops.md`
- Protected contracts touched: inbound security boundary only; terminal control boundary must remain closed.
- Acceptance checks: Rust tests pass, route documented, token gate preserved, inbound API returns roster summary without exposing control surfaces.
- Questions: none

Acceptance Evidence

- `cargo test --manifest-path apps/api/Cargo.toml`
- `cargo build --manifest-path apps/api/Cargo.toml`
- Targeted local inbound check on port `20088` with temporary token:
  - `GET /api/branch/agents` with token returned `ok=true`, `total_agents=6`, `active_agents=6`, `first_agent=dev-lead`
  - tokenless `GET /api/branch/agents` returned `401`
  - current response used snapshot-backed census path while reporting `session_source="9001 /api/sessions"` and `session_api_ok=false`

Live Progress

- 2026-06-05: task packet created from Lucas direct request and CTO branch-dev-lead design note.
- 2026-06-05: added `GET /api/branch/agents` to inbound and normal branch routes, implemented live-session-or-snapshot census builder, updated inbound ops doc, verified build/tests, and exercised the endpoint locally.
- 2026-06-05: `apps/api/src/main.rs` updated with `GET /api/branch/agents` and branch status count fields.
- 2026-06-05: source order implemented as live `9001 /api/sessions` first, snapshot fallback second.
- 2026-06-05: `docs/branch-inbound-ops.md` updated with endpoint contract and PowerShell example.
- 2026-06-05: `cargo check --manifest-path apps/api/Cargo.toml` passed.
- 2026-06-05: runtime HTTP verification is pending process reload; current `20086` process returned `404` for the new route and `20088` was not listening during the check.

Open Decisions / Blockers

- Runtime verification requires branch API / inbound process restart or redeploy so the new route is served by the running binary.
