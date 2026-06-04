## Objective

Confirm whether branch informational Markdown files are already committed and pushed, then prepare a single HQ-facing folder that consolidates branch LCC Core informational materials while excluding logs.

## Lucas Intent

Build HQ's initial branch LCC Core context from repository materials, not from scattered local paths, and make the upload set easy to browse from one folder.

## Current Symptom / Evidence

- User asked whether all branch `*.md` files are committed/pushed.
- User requested that informational materials be uploaded, excluding logs.
- User preferred one integrated folder.
- Current `git status --short --branch` shows `## main...origin/main`.
- Current `git branch -vv` shows `main` at `fc9992d` tracking `origin/main`.
- `git ls-files '*.md'` shows tracked Markdown across root, `docs/`, and `data/`.

## Why This Matters

HQ needs a stable, reviewable package for branch LCC Core bootstrap and handoff without mixing in volatile runtime logs or scattered local-only artifacts.

## Known Wrong Interpretations

- Do not treat `node_modules` README files as branch informational materials.
- Do not include runtime log directories just because they contain `.md` checklists.
- Do not rewrite or move original source documents out of their existing paths.
- Do not assume untracked workspace scratch files should be promoted.

## Forbidden Actions

- No deletion of existing docs.
- No inclusion of `data/system-logs/`, `workspaces/`, `node_modules/`, or `*.log` runtime artifacts in the HQ package.
- No restart or runtime process changes.
- No protected terminal newline/submit contract changes.

## Source Root / Files

- Source root: `D:\Lucas Core v0.1`
- In scope:
  - `AGENTS.md`
  - `README.md`
  - root `*.md` branch handoff docs
  - `docs/**/*.md`
  - `data/**/*.md` excluding runtime/system-log evidence folders
- Planned output:
  - `hq-branch-core-info/README.md`
  - mirrored copies of selected markdown files under `hq-branch-core-info/`

## Protected Contracts

- Policy ACK boot
- Commit/QA gate discipline
- No terminal submit/render behavior changes

## Implementation Direction

1. Confirm tracked/pushed state for relevant Markdown.
2. Create a single top-level HQ package folder.
3. Copy selected informational Markdown into that folder while preserving readable structure.
4. Add an index README describing source, exclusions, and folder layout.
5. Commit and push the packaging change.

## Understanding Check

UNDERSTANDING_CHECK hq-branch-info-package-20260604 owner=codex objective=Verify branch Markdown tracking/push state and create one HQ-facing folder that consolidates informational materials lucas_intent=HQ should be able to bootstrap branch LCC Core from one clean folder without runtime logs forbidden=no logs; no runtime restarts; no source-doc relocation; no node_modules/workspace scratch promotion files=AGENTS.md,README.md,docs/**/*.md,data/**/*.md,hq-branch-core-info/**/* protected=policy-ack,commit-gate acceptance=git confirms current sync; package folder exists with curated markdown and README; commit pushed questions=none

## Acceptance Evidence

- Git tracking/sync evidence
- Package folder tree
- Commit hash and push result

## Live Progress

- 2026-06-04: policy files read and ACK path satisfied
- 2026-06-04: git sync and markdown inventory inspection in progress

## Open Decisions / Blockers

- None currently
