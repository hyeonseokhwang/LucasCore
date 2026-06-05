Objective

- Run RCA for `q74423 / P1-E`: a fresh QA-created session shows a blank selected terminal card in the browser even though the backend preview is non-empty.

Lucas Intent

- Keep the newly fixed warm-session path separate from the remaining fresh-session failure.
- Identify whether the fresh selected-card blank is caused by zero-dimension attach, snapshot/seed ordering, or a frontend render path that never paints the non-empty backend preview.
- Do not collapse this back into the already-passed `q74419` warm-session result.

Current Symptom / Evidence

- CTO corrected the earlier closure decision.
- Warm existing-content sessions (`dev-lead`, `lux`, `arum`, `branch-ceo`) now show `nonEmptyRows > 0` through `T+2`, so the previous `SIGWINCH` race lane is considered resolved for that class.
- Fresh QA-created session `branch-qa-q74419-...` still shows `frontend xterm nc=0` through `T+12` while backend `previewLen=7638` remains non-zero.
- The remaining failure is therefore: `fresh session selected-card blank`, not the earlier warm-session Equal-card blank.

Why This Matters

- The operator surface still lies for newly created sessions: backend state exists, but the selected browser terminal paints nothing.
- If warm and fresh paths are mixed together, the team can incorrectly reopen a solved race or overlook a still-broken fresh-session render path.

Known Wrong Interpretations

- Do not treat `q74419` as wholly failed. The warm-session timing result changed and must remain recorded as `PASS` for that scope.
- Do not claim frontend rendering is healthy just because backend `previewLen` is non-zero.
- Do not assume the root cause is still `SIGWINCH`; the fresh-session failure class may now be attach-without-dimensions or seed/snapshot ordering.
- Do not touch newline/submit behavior.

Forbidden Actions

- No `9001` restart.
- No prompt-text / prompt-submit changes.
- No broad replay refactor.
- No unrelated cleanup in already-dirty product files.

Source Root / Files

- Source root: `G:\Lucas-Initiative\LucasCore`
- Primary inspection targets:
  - `apps/web/src/main.tsx`
  - `apps/api/src/main.rs`
  - `data/task-reports/terminal-passive-preview-blank-20260605.md`
  - `data/task-reports/q74419-precision-timing-probe-20260605.md`

Protected Contracts

- Terminal render/attach path: touched by RCA, protected for any later code edit.
- Terminal replay/snapshot seeding: likely involved, protected.
- Terminal newline/submit: must remain untouched.

Implementation Direction

1. Verify whether the fresh selected-card attach can still be sent with `cols=0`, `rows=0`, or no dimensions.
2. Compare warm-session and fresh-session attach/message ordering:
   - `attach`
   - first `snapshot` / `output`
   - initial preview seed write
   - first visible non-empty xterm rows
3. Check whether fresh-session snapshot data is blank/clear-only while backend preview text is already non-empty.
4. Keep the first pass evidence-only unless explicit `permission=edit` is issued.

Understanding Check

- Objective in own words: explain why a newly created session can have backend preview text but still render an empty selected terminal card.
- Lucas intent in own words: keep the warm-session `q74419` win intact while isolating the still-failing fresh-session render path.
- Forbidden paths in own words: no restart, no newline edits, no broad replay redesign, no assumption-based closure.
- Files in own words: inspect `apps/web/src/main.tsx`, `apps/api/src/main.rs`, and the current task/evidence markdown first.
- Protected contracts in own words: terminal attach/render/seeding is in scope; newline/submit is not.
- Acceptance in own words: identify a concrete failing path for fresh sessions and record whether it is zero-dim attach, blank snapshot, seed miss, or another render ordering issue.
- Questions: current meeting excerpt did not include explicit `permission=edit`, so this lane stays in inspect mode for product source changes.

Acceptance Evidence

- RCA note answering CTO's checklist items with code references and observed evidence.
- Clear classification of the failure path:
  - `zero-dim-attach`
  - `blank-snapshot-with-nonempty-preview`
  - `seed-miss-or-late-seed`
  - `other`

Live Progress

- 2026-06-05: Policy boot and relevant terminal RCA packets reviewed before action.
- 2026-06-05: CTO corrected the earlier `q74419 PASS + P1-B CLOSED` claim. Warm-session path stays passed; fresh-session path remains failing and is reclassified as `q74423 / P1-E`.
- 2026-06-05: Local source inspection found a remaining zero-dimension attach fallback in [apps/web/src/main.tsx](/abs/path/G:/Lucas-Initiative/LucasCore/apps/web/src/main.tsx:2740). `doAttach()` omits `cols/rows` when xterm size is still zero, and two fallback branches can still invoke it anyway: `if (!c) { doAttach(); return; }` and the 2-second safety timeout. This matches CTO's first RCA checklist item and is a concrete fresh-session suspect.
- 2026-06-05: The same component skips blank `snapshot` payloads before seeding the session as attached in [apps/web/src/main.tsx](/abs/path/G:/Lucas-Initiative/LucasCore/apps/web/src/main.tsx:2811). If a fresh-session attach yields a clear-only or whitespace-only snapshot and the selected-card path had no meaningful `initialPreviewText` painted yet, xterm can remain visually empty even though backend preview becomes non-empty later.
- 2026-06-05: Backend attach handling in [apps/api/src/main.rs](/abs/path/G:/Lucas-Initiative/LucasCore/apps/api/src/main.rs:2848) only applies resize before the first snapshot when both `cols` and `rows` are present. If frontend fallback attach omits them, the backend will proceed without a size correction and then emit the current display snapshot path as-is.
- 2026-06-05: No product source edits have been made from this RCA lane. Current status is inspect-only pending explicit edit permission.

Open Decisions / Blockers

- Need direct evidence from a failing fresh selected-card run to confirm whether attach actually leaves with zero dimensions or without `cols/rows`.
- Need to confirm whether the failing selected-card path had meaningful `initialPreviewText` at mount time, or whether it remained empty until a blank snapshot was ignored.
- Product source changes remain blocked until explicit `permission=edit` is granted for this lane.
