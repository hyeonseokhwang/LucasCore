# Product Boundaries

## Heavy System

`Lucas-Initiative` remains the production command center used by Lucas. It can contain deep integrations, private operational workflows, and experimental daemon code.

## LCC Core

`lucas-lcc-core` is the clean product surface.

It should provide:

- local multi-agent orchestration
- a dense but understandable operator UI
- canvas-centered work records
- minimal install requirements
- clear extension points for SaaS and on-premise deployment

It should not require:

- Lucas private daemon code
- private production data
- hardcoded GitHub paths
- shared OpenAI credentials

## On-Premise Model

The user supplies their own Codex Pro or compatible CLI access. LCC Core controls process lifecycle, prompt routing, workspace context, and result collection.

Credentials stay on the user's machine.

## SaaS Model

The SaaS version can add:

- account and license management
- hosted coordination metadata
- encrypted team sync
- optional remote runners
- billing and usage limits

The local agent runtime should remain replaceable so the same UI can operate local, remote, or hybrid fleets.
