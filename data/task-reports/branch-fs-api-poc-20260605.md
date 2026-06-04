Objective

- Build a read-only inbound file and git inspection API for branch LucasCore access so HQ can inspect files through API calls instead of direct filesystem reads.

Lucas Intent

- HQ must not directly read LucasCore files. Future remote PC scenarios need a narrow API-mediated file access path.
- The PoC must expose read/list/diff/log only, protected by `X-LCC-Token` using `LCC_BRANCH_INBOUND_TOKEN`.

Scope

- Source root: `G:\Lucas-Initiative\LucasCore`
- Files changed:
  - `apps/api/src/main.rs`
  - `ecosystem.config.cjs`

Forbidden Actions

- No write, edit, delete, upload, or shell execution endpoint.
- No absolute paths.
- No `..` path traversal.
- No `.git`, `.env`, secret, token, credential, or private path segment reads.
- Do not persist real token values.

Implementation Summary

- Added inbound-only routes:
  - `GET /api/branch/files/read`
  - `GET /api/branch/files/list`
  - `GET /api/branch/files/diff`
  - `GET /api/branch/git/log`
- Added path validation helper for LucasCore-root relative paths.
- Added read-only git command helper for `diff` and `log`.
- Added `branch-inbound-20088` as the fourth PM2 ecosystem app with `LCC_INBOUND_ONLY=1`.

Acceptance Evidence

- `cargo test --manifest-path apps/api/Cargo.toml`: PASS, 31/31.
- `node --check ecosystem.config.cjs`: PASS.
- Local 20088 inbound server started with temporary non-production token `poc-token`.
- Curl checks:
  - read `AGENTS.md`: `ok=true`, `total_lines=63`, `truncated=true`.
  - list `apps/api/src`: `ok=true`, entries include `main.rs`.
  - diff `b5a6ff7..1fac6bf` for `apps/api/src/main.rs`: `ok=true`, diff body returned.
  - git log `apps/api/src/main.rs`: `ok=true`, commits array returned.
  - traversal `../AGENTS.md`: HTTP 400, `path traversal is not allowed`.

Residual Risk

- This PoC uses the existing API binary with `LCC_INBOUND_ONLY=1`; deployment still needs PM2 environment token provisioning.
- Git diff/log accept hex commit hashes only; branch names are intentionally not accepted in the PoC.

Next Action

- Commit the scoped API and ecosystem changes, then report commit hash and diff evidence to HQ meeting.
