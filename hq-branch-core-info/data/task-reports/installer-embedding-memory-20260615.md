# LCC Core v0.1 Installer With Embedding Memory - 2026-06-15 Target

## Objective

Ship LCC Core v0.1 as an installable local instance by 2026-06-15, including embedding-backed memory and OpenAI API key setup.

## Lucas Intent

Lucas wants the first distributable LCC Core v0.1 to be installable, not only developer-run from the repository. The installer must include the memory system, and that memory system must include embeddings backed by a user-provided OpenAI API key.

## Product Scope

- Local installable LCC Core v0.1 instance.
- 9000 web UI.
- 9001 core API and terminal backend.
- 9100 ledger dashboard.
- Existing file-based boot recovery and daily-memory recovery.
- Embedding-backed long-term memory.
- OpenAI API key onboarding, validation, and local secure storage.
- Restart recovery that combines daily memory, task reports, ledger events, and embedding retrieval.

## Non-Negotiable Boundaries

- Do not hard-code an OpenAI API key in source, packaged defaults, test fixtures, or logs.
- Do not print full API keys in terminal, browser console, files, or ledger reports.
- Do not use terminal scrollback as authoritative long-term memory.
- Do not restart live 9001 outside the existing controlled deploy gate.
- Do not merge installer, memory, and terminal changes into one unreviewable commit.

## Architecture Direction

Memory must have two layers:

1. File recovery layer: current daily-memory, task reports, directives, and ledger events.
2. Embedding retrieval layer: indexed memory chunks with source attribution, timestamps, trust level, and retrieval ranking.

The installer must initialize required local directories, configuration, migrations, logs, and first-run API key setup. API key storage should use an OS secret store where practical, with encrypted local fallback only if necessary.

## Delivery Plan

1. Finish terminal normalization live deploy and verify split-submit behavior.
2. Inventory current runtime ports, data paths, build artifacts, and startup scripts.
3. Choose installer packaging path for Windows-first v0.1.
4. Design memory schema, chunking, source trust, and retention policy.
5. Implement OpenAI API key setup and validation.
6. Implement embedding ingestion for approved memory sources.
7. Implement memory search/recover integration.
8. Add installer initialization, migration, backup, and restore behavior.
9. Run restart drill from installed instance.
10. Produce release evidence and operator notes.

## Milestones

- 2026-06-05: terminal deploy closed and installer architecture packet approved.
- 2026-06-07: installer shell and runtime path model working.
- 2026-06-09: OpenAI API key setup and embedding storage prototype working.
- 2026-06-11: memory ingestion and retrieval integrated with recovery API.
- 2026-06-13: installed-instance restart drill and regression pass.
- 2026-06-15: v0.1 installable package ready for Lucas review.

## Acceptance Evidence

- Fresh install can start 9000, 9001, and 9100.
- First-run setup accepts and validates a user OpenAI API key without exposing it.
- Memory ingestion creates embedding records from approved sources.
- Recovery API returns file recovery plus relevant embedding retrieval.
- Caesar and Max recover correct context after installed-instance restart.
- Installer uninstall/update path preserves or backs up user memory.
- Regression evidence includes terminal submit, memory recovery, ledger dashboard, installer start/stop, and no-secret-leak checks.

## Current State

- File-based human-grade memory recovery is complete.
- Embedding-backed memory is not implemented yet.
- Terminal normalization source fix and guarded deploy script are ready, but live 9001 deploy still needs explicit Lucas approval.
- This packet upgrades the product target to include embedding memory in the v0.1 installer by 2026-06-15.

## Next Action

Keep terminal deploy gate first, then open installer and embedding-memory design/decomposition under Max with Caesar/Lux supervision.
