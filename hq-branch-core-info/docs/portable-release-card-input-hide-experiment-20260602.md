# Portable Release Card Input-Hide Experiment

Date: 2026-06-02 KST
Owner lane: developer-5
Ledger item: `portable-release-20260603`

## Goal

Propose a reversible experiment for low-resolution terminal-card density by hiding the inline composer in normal terminal cards while preserving input in these paths:

- selected terminal card
- fullscreen terminal modal
- popout terminal window

Do not delete the send path, prompt state, or terminal input protocol.

## Current code boundary

Inspected files:

- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `docs/portable-release-plan-20260602.md`

Relevant current paths:

- `TerminalCard` in `apps/web/src/main.tsx`
  - normal card footer always renders `select + textarea + send button`
  - selected state already exists via `selected` prop
  - live preview state already exists via `livePreview` prop
- `FullscreenTerminalModal` in `apps/web/src/main.tsx`
  - separate composer path
- `TerminalPopoutPage` in `apps/web/src/main.tsx`
  - separate composer path
- card layout in `apps/web/src/styles.css`
  - `.terminal-card` currently uses `grid-template-rows: 34px minmax(0, 1fr) 44px 26px`

## Proposed experiment

### Experiment rule

Hide the inline composer footer only for non-selected normal terminal cards.

Keep the composer visible for:

- `selected === true`
- fullscreen modal
- popout page

Optional safety variant:

- also keep the composer visible when `composerDirty === true` so an in-progress draft is never hidden

Recommended first condition:

```ts
const showInlineComposer = selected || composerDirty;
```

This is safer than `selected` only because it prevents draft loss confusion if the operator clicks away after typing.

### Rendering approach

In `TerminalCard`:

1. Introduce `showInlineComposer`.
2. Render the existing footer only when `showInlineComposer` is true.
3. Render a compact status footer when false.

Compact status footer contents should be display-only:

- current target session name
- short hint such as `Select card for input`
- existing status metadata if useful, but no new terminal text block

### CSS approach

Use a class-based layout change instead of deleting rows:

```ts
className={`terminal-card ... ${showInlineComposer ? "with-inline-composer" : "compact-footer"}`}
```

Then in CSS:

- `.terminal-card.with-inline-composer`
  - keep current `34px minmax(0, 1fr) 44px 26px`
- `.terminal-card.compact-footer`
  - use reduced footer height such as `34px minmax(0, 1fr) 28px 26px`

This keeps the experiment localized and easy to revert.

## Why this is reversible

- no API change
- no protocol change
- no prompt normalization change
- no fullscreen/popout change
- no removal of textarea/send/select code
- footer behavior can be reverted by removing one condition and the compact CSS class

## Rollback

Single-patch rollback:

1. Remove `showInlineComposer` condition from `TerminalCard`.
2. Always render the existing inline composer footer again.
3. Remove compact footer CSS classes and styles.

Expected rollback file scope:

- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`

No data migration, no backend restart, no ledger/schema change.

## QA definition

Developer-4 QA gate should verify all of these before acceptance.

### Functional

1. Non-selected normal card does not show textarea/send button.
2. Selected card still shows textarea/send button.
3. Fullscreen modal still shows textarea/send button.
4. Popout window still shows textarea/send button.
5. Input submit still works from selected card.
6. Input submit still works from fullscreen.
7. Input submit still works from popout.
8. Draft text is not hidden unexpectedly if `composerDirty` safeguard is enabled.

### Layout

1. Equal-fit layout shows more readable terminal area on low resolution.
2. Card footer remains legible and does not overlap controls.
3. Header badges and action buttons remain clickable.
4. No occlusion regression in normal grid view.

### Evidence

- desktop screenshot
- low-resolution or narrow viewport screenshot
- fullscreen screenshot
- popout screenshot if feasible
- DOM/text check proving hidden vs visible composer states
- console check
- `npm --prefix apps/web test`
- `npm --prefix apps/web run build`
- confirm `9001` PID unchanged

## Risks

- Hiding card input on non-selected cards may slow cross-card dispatch for operators who rely on inline send from every visible card.
- If draft preservation is not handled, switching selection could feel like input loss even if state is retained.
- Footer height reduction must not create a misleading clickable area where the composer used to exist.

## Recommendation

Proceed only as a QA-gated experiment patch, not as permanent removal.

Recommended first implementation:

- hide inline composer on non-selected normal cards
- preserve inline composer on `selected || composerDirty`
- leave fullscreen and popout unchanged
- add compact display-only footer instead of removing the footer area entirely
