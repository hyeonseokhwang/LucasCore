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
bun run dev
```

```bash
cargo run --manifest-path apps/api/Cargo.toml
```

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
http://127.0.0.1:5173
```

The Rust API runs on:

```text
http://127.0.0.1:9000
```

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

The on-premise target is a user with their own Codex Pro license. LCC Core should orchestrate local agent sessions without owning that user's OpenAI credentials.
