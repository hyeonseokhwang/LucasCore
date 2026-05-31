# Lucas LCC Core v0.1

Lightweight Lucas Command Center core for local and on-premise multi-agent operation.

`Lucas-Initiative` is the heavy production system. This repository is the productized core: a smaller Rust + Bun implementation that can later ship as SaaS or an on-premise desktop/server bundle.

## Architecture

- `apps/api`: Rust Axum control plane
  - session lifecycle API
  - terminal write/output streaming
  - canvas workspace API
  - local JSON persistence for v0.1
- `apps/web`: Bun + Vite + React operator UI
  - terminal fleet grid
  - agent-to-agent prompt injection
  - canvas workspace with sections, participants, and messages

## v0.1 Scope

- Spawn local shell-backed agent sessions.
- Show sessions in a dense terminal grid.
- Send prompts to one session.
- Send agent-to-agent messages using:

```text
[FROM {senderId} TO {targetId}] {content}
```

- Create canvases.
- Edit canvas sections.
- Add canvas messages.
- Invite terminal agents to a canvas.

## Commands

```bash
bun install
cargo run --manifest-path apps/api/Cargo.toml
bun --cwd apps/web dev
```

These bare commands are for local smoke checks and may use tool defaults. Use the port lanes below for stable, protected live, or testbed operation.

## Port Policy

LCC uses separate Web UI and Agent/API processes. Keep the port split explicit:

| Lane | Web UI | Agent/API | Policy |
| --- | ---: | ---: | --- |
| Stable/prod | `9000` | `9001` | normal stable lane |
| Current/live legacy | n/a | `9002` | protected; do not restart or replace without Lucas approval |
| Development/testbed | `9003` | `9004` | active development and verification lane |

Stage policy:

- Stage 1: agents are Agent/API child PTYs managed by the Rust API.
- Stage 2: OS-resident attach/detach is allowed only after Stage 1 is stable.
- Product default: installer/bootstrap automation must preserve `9000` as the screen server and `9001` as the Agent/API server.

The web app uses same-origin `/api` and `/ws` paths when no origin is configured, and supports explicit Agent/API origins when the UI is served elsewhere. For stable/prod:

```powershell
.\scripts\start-lcc-core.ps1
```

This starts the Web UI on `http://127.0.0.1:9000` and points API/WS traffic at `http://127.0.0.1:9001` / `ws://127.0.0.1:9001`.
The root `bun run dev` command uses the same bootstrap.

For the `9003` / `9004` Stage 1 testbed, run the screen and Agent/API server as separate processes:

```powershell
.\scripts\start-9003-stage1.ps1
```

This starts the Web UI on `http://127.0.0.1:9003` and points API/WS traffic at `http://127.0.0.1:9004` / `ws://127.0.0.1:9004`.

Stage 2 verifier scripts keep the `9003` testbed name, but the validation target is `9004` for the Agent/API process. They must preserve the `9002` PID while checking restart survival, and should not be executed until the API-side attach implementation is complete.

For compatibility only, the API can also serve the built web bundle if `LCC_SERVE_WEB=1` is set before starting the Rust server.

On Windows before restarting the shell after installation:

```powershell
.\scripts\bun.ps1 install
.\scripts\bun.ps1 run build
.\scripts\check-api.ps1
.\scripts\dev-api.ps1
```

Run the API elevated when spawned agents need Administrator privileges:

```powershell
.\scripts\dev-api-admin.ps1
```

Open:

```text
http://127.0.0.1:9000
```

The default Rust Agent/API development command runs on:

```text
http://127.0.0.1:9001
```

For policy lanes, set `LCC_API_PORT` explicitly before starting the API process. Stable/prod is `9001` for Agent/API and `9000` for Web UI. Do not use or recycle `9002` unless Lucas approves the live legacy restart.

## API

```text
GET    /api/health
GET    /api/sessions
POST   /api/sessions
DELETE /api/sessions/:id
POST   /api/sessions/:id/write
GET    /ws/terminal

GET    /api/canvases
POST   /api/canvases
GET    /api/canvases/:id
PATCH  /api/canvases/:id
GET    /api/canvases/:id/content
PUT    /api/canvases/:id/content
GET    /api/canvases/:id/messages
POST   /api/canvases/:id/messages
POST   /api/canvases/:id/invite
```

## Product Direction

The core must stay independent from the heavy `Lucas-Initiative` deployment.

Planned boundaries:

- `session_provider`: local shell, Codex CLI, remote worker, hosted SaaS worker
- `auth_provider`: local single-user, license key, SaaS account
- `storage_provider`: JSON for v0.1, PostgreSQL for production
- `runtime_policy`: max agents, allowed commands, workspace root, audit logging
- `distribution`: on-premise bundle first, SaaS control plane later

Operational policy:

- `docs/command-chain-policy-20260531.md`: authority, delegation, direct-control, and emergency recovery rules
- `docs/peer-bridge-ops.md`: routed message labels and report format
- `docs/agent-state-management-policy-20260531.md`: task state flow, PTY reporting, and command-mode binding
- `docs/lcc-v0.1-migration-checklist-20260531.md`: HQ-style migration target for lightweight grid, single active terminal/chat, and log-tail boundaries
- `docs/lcc-v0.1-ux-smoke-checklist-20260531.md`: smoke procedure and large-log verification for the migration target

The on-premise target is a user with their own Codex Pro license. LCC Core should orchestrate local agent sessions without owning that user's OpenAI credentials.
