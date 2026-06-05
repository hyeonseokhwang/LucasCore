Objective

- Add a precise timing probe for the `q74419` Equal-card blank investigation so the team can distinguish:
  - repeated `SIGWINCH` still firing after the supposed fix,
  - versus an initial blank/missing snapshot that only becomes visible after a later Codex redraw.

Lucas Intent

- Do not settle for "it was blank around T+2".
- Capture enough per-checkpoint evidence to separate transport/attach timing from later redraw timing.
- Keep the probe narrow and evidence-first so the team can say which hypothesis is true on the same Equal card.

Current Symptom / Evidence

- Existing artifact `data/system-logs/terminal-q74419-timing-probe/q74419-timing-probe-2026-06-04T20-07-46-521Z.json` already captures screenshots at `T=0/1/2/5/12s`.
- That artifact does not yet record the decisive per-card structure Lucas asked for, such as `nonEmptyRows` on the same Equal card at each checkpoint.
- CTO clarified the two active hypotheses:
  - `SIGWINCH` still occurs, so `q74419` had no real effect.
  - Or the card remains blank until a later redraw because the initial snapshot is missing or blank, then appears around `T+12`.

Why This Matters

- Screenshots alone do not separate "screen cleared later by resize" from "initial snapshot absent until later output".
- The next protected-contract decision depends on whether the failure is still attach/resize driven or is now an initial snapshot delivery problem.

Known Wrong Interpretations

- Do not treat any late visible text as proof that the initial attach path was healthy.
- Do not infer `SIGWINCH` only from visual blanking; capture whether rows were already non-empty before the collapse.
- Do not change newline/submit behavior for this task.
- Do not restart `9001` or disturb unrelated dirty changes just to add the probe.

Forbidden Actions

- No `9001` restart.
- No prompt-text / prompt-submit edits.
- No broad terminal replay refactor.
- No unrelated cleanup in already-dirty files.

Source Root / Files

- Source root: `G:\Lucas-Initiative\LucasCore`
- Primary inspection targets:
  - `apps/web/src/main.tsx`
  - `tools/terminal-work-cdp-resident-monitor.cjs`
  - existing probe output under `data/system-logs/terminal-q74419-timing-probe/`

Protected Contracts

- Terminal render/attach timing: touched if source edits are approved.
- Terminal newline/submit: must remain untouched.
- QA/evidence gate: any source change must produce direct artifact output.

Implementation Direction

1. Reuse the existing Equal-layout timing probe shape at `T=0/1/2/5/12s`.
2. At each checkpoint, record for the same target card:
   - `nonEmptyRows`
   - `totalRows`
   - `bodyTextLength`
   - `xterm viewport rows` when available
   - whether a visible clear-only state is present
   - API preview length for the same session
3. If feasible, also record whether a resize event or snapshot/output event landed before the checkpoint, so `blank-after-content` and `never-had-content-yet` are separable.
4. Keep the probe isolated to tooling or debug-only instrumentation.

Understanding Check

- Objective in own words: add checkpoint evidence that tells whether the Equal card had real non-empty rows before going blank, or whether it stayed empty until a later redraw.
- Lucas intent in own words: prove which of the two remaining `q74419` hypotheses is true with timestamped structure, not screenshots alone.
- Forbidden paths in own words: no runtime restart, no newline edits, no broad refactor, no assumption-driven diagnosis.
- Planned files in own words: likely the existing CDP/timing probe tooling plus, only if needed, the passive preview component for debug-only signals.
- Protected contracts in own words: terminal render/attach timing may be touched; newline/submit must not be touched.
- Acceptance in own words: one artifact for `T=0/1/2/5/12s` that shows `nonEmptyRows` and related card metrics clearly enough to classify the root cause.
- Questions: current meeting request omitted explicit `permission=edit`, so product/tool source changes remain pending policy approval.

Acceptance Evidence

- New or updated timing-probe artifact containing per-checkpoint `nonEmptyRows` and related Equal-card metrics.
- Exact classification note for the observed run:
  - `still-sigwinch-like`
  - `initial-snapshot-missing-or-blank`
  - or `mixed/needs-more-evidence`

Live Progress

- 2026-06-05: Policy boot and relevant terminal RCA packet reviewed before action.
- 2026-06-05: Existing `q74419` timing artifact inspected; screenshots-only output is insufficient for CTO's new discrimination requirement because it does not record per-card `nonEmptyRows`.
- 2026-06-05: Current meeting instruction requests the same Equal card to be sampled at `T=0 / T=1 / T=2 / T=5 / T=12` with `nonEmptyRows` to separate remaining hypotheses.
- 2026-06-05: No product or tooling source has been edited yet from this lane because the instruction text omitted explicit `permission=edit`; per policy this lane is currently in inspect mode pending approval.
- 2026-06-05: CTO timing-probe result for existing-content sessions (`dev-lead` lane) showed `nonEmptyRows > 0` at all checkpoints, including `T+2`, with reported sequences `T+0: [9,9,9,9,11]`, `T+2: [1,14,1,1,1]`, `T+12: [1,14,1,1,1]`. This is materially different from the earlier baseline (`T+2 blank`, `T+12 recovery`) and supports `q74419 PASS` for warm-session `SIGWINCH` race blocking.
- 2026-06-05: CTO then corrected the closure decision after Arum revalidation. Existing sessions remain `PASS`, but a fresh QA-created session (`branch-qa-q74419-...`) still shows `nc=0` through `T+12` despite backend preview length being non-zero. Scope is therefore narrowed from `P1-B` to a new fresh-session failure class.
- 2026-06-05: CTO registered `q74423` and assigned a new `P1-E` RCA lane: `fresh session selected-card blank`, where backend `previewLen=7638` is healthy but frontend xterm `nonEmptyRows=0` for the fresh selected card. Warm-session path is now considered passed; fresh-session path remains failing.

Open Decisions / Blockers

- Source edits are blocked pending an explicit task card or direct approval with `permission=edit`.
- If approval is granted, the lowest-risk implementation is to extend the existing timing-probe tooling artifact rather than instrument the live runtime first.
- Active RCA focus has shifted. The next inspect lane should answer CTO's `q74423 / P1-E` checklist for fresh sessions:
  - whether `attach` still happens with `cols=0` or without `cols/rows`,
  - whether snapshot payload shape differs for fresh sessions,
  - whether seed-vs-snapshot ordering leaves xterm with `nc=0` despite non-empty backend preview,
  - and whether selected-card behavior differs from Equal-card warm-session behavior.
