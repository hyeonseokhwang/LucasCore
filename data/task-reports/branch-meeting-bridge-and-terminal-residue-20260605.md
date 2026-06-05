Objective

- Restore a real branch-to-HQ meeting speak path for HQ meeting `mtg-1780195037159` and patch the branch-only terminal residue issue so branch terminals match HQ behavior closely enough for Lux PASS review.

Lucas Intent

- HQ corrected the earlier interpretation: participant handshake and empty participant-registration notices are not proof of real branch speech.
- PASS now requires PTY signature visibility plus DM or meeting E2E response from actual branch Codex sessions.
- Branch-side agents need an explicit, repeatable way to speak into HQ meeting threads without manual token leakage or fake local-only acknowledgements.
- Branch terminal residue/ghost rendering was also identified as a branch-only defect and must be analyzed against HQ xterm behavior and patched narrowly.

Current Symptom / Evidence

- SRE reports branch API `:20086` currently has six active sessions: `ceo`, `dev-lead`, `lux`, `arum`, `developer-1`, `developer-2`.
- The remaining blocker is not spawn count but the missing speech bridge: branch Codex sessions do not yet know or reliably use a branch-side helper that forwards real messages into HQ meeting `mtg-1780195037159`.
- Existing helper `tools/branch-hq-bridge.cjs` mirrors branch session preview text into HQ meeting speak and forwards HQ meeting content back into branch PTY prompts, but its current behavior is too broad for author-authenticated operational use and has no explicit one-shot speak helper for branch Codex sessions.
- Branch terminal residue/ghosting is reported on branch only; suspected areas include xterm preview lifecycle, alt-screen/reset behavior, replay/snapshot handling, scrollback, and layout/fit timing.

Why This Matters

- HQ needs an operationally trustworthy branch speech path, not a dashboard illusion.
- Terminal residue undermines branch operator trust and makes PTY evidence ambiguous during Lux verification.

Known Wrong Interpretations

- Do not treat empty participant registration notices as branch speech.
- Do not treat session spawn success as meeting E2E completion.
- Do not patch terminal newline/submit behavior as a shortcut to solve a rendering residue issue.
- Do not route this work through 9002 or fabricate HQ success without real API response evidence.

Forbidden Actions

- Do not expose tokens or persist secret values.
- Do not bypass the protected `prompt-text` / `prompt-submit` contract.
- Do not make unrelated UI restyles or broad terminal architecture changes.
- Do not restart 9001 or change protected contracts unless explicitly required and approved.

Source Root / Files

- Source root: `G:\Lucas-Initiative\LucasCore`
- Planned task packet / evidence:
  - `data/task-reports/branch-meeting-bridge-and-terminal-residue-20260605.md`
- Planned implementation files:
  - `tools/branch-hq-bridge.cjs`
  - `tools/hq-meeting-speak.cjs`
  - `data/agent-boot-prompts.json`
  - `scripts/start-lcc-agents.ps1`
  - `apps/web/src/main.tsx`
  - `apps/web/src/terminalSurface.ts`
  - `apps/web/src/terminalSurface.test.ts`

Protected Contracts

- Terminal newline/submit injection: branch speech instructions delivered to sessions must continue to use separate `prompt-text` and `prompt-submit`.
- Terminal render/replay: branch residue patch must stay within preview attach/snapshot/reset behavior and must not regress existing replay assumptions.
- Policy ACK boot flow: boot prompts remain mandatory and must not lose the policy-first contract.

Implementation Direction

- Add or harden a branch-side meeting speak helper so branch sessions can emit real HQ meeting messages through a narrow, explicit CLI path.
- Update boot guidance so branch executive lanes know the approved meeting speak command and when to use it.
- Tighten the branch HQ bridge behavior so it is useful for operations without over-claiming authorship from arbitrary preview text.
- Compare branch xterm preview lifecycle against the existing HQ-oriented preview path and patch residue at the smallest viable surface, ideally in snapshot/reset/clear handling plus focused tests.

Understanding Check Questions

- Objective understood: restore a true branch meeting speak path and patch branch-only terminal residue.
- Lucas intent understood: prove real branch speech and clean branch rendering, not just handshake or spawn success.
- Forbidden paths understood: no secret disclosure, no fake success, no raw PTY submit bypass, no unrelated UI churn.
- Questions: none.

Acceptance Evidence

- Branch speech helper or bridge path exists and is documented in branch boot guidance.
- Local verification shows the helper builds/runs syntactically and targets `POST /api/meetings/:id/speak` through the approved path.
- Branch terminal residue patch has source-level justification and automated verification where practical.
- Final evidence note records residual risk if live HQ E2E cannot be executed directly from this session.

Live Progress

- 2026-06-05: Mandatory policy set re-read; `POLICY_ACK` issued; ledger reference confirmed enabled.
- 2026-06-05: Existing `hq-meeting-self-intro` task report read; it covered an earlier auth/blocker-only operation path and is no longer sufficient for the current implementation scope.
- 2026-06-05: Relevant files identified: `tools/branch-hq-bridge.cjs`, `scripts/start-lcc-agents.ps1`, `data/agent-boot-prompts.json`, `apps/web/src/main.tsx`, terminal preview/replay helpers, and HQ external guide references.
- 2026-06-05: Root causes narrowed: `start-lcc-agents.ps1` still hard-coded `ledger_reference=disabled` and lacked `lux/arum` spawn catalog entries; terminal attach snapshot lacked a full clear prefix before replaying ANSI state, which can leave stale cells visible when the current screen shrinks.
- 2026-06-05: Implemented `tools/hq-meeting-speak.cjs`, updated bridge prompts and boot prompts to teach branch executive identities the approved HQ speak helper, and added `lux/arum` to the spawn catalog.
- 2026-06-05: Verification passed for `node --check tools/hq-meeting-speak.cjs`, `node --check tools/branch-hq-bridge.cjs`, PowerShell parse of `scripts/start-lcc-agents.ps1`, and `cargo test terminal_attach_snapshot_includes_full_clear_prefix -- --nocapture`.

Open Decisions / Blockers

- Need to inspect the exact HQ meeting API request shape and existing branch bridge assumptions before editing.
- Need to confirm whether the residue root cause is lifecycle/reset logic or a layout/CSS mismatch before choosing the patch.
