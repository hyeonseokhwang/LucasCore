# Development Architecture Policy - 2026-06-03

This policy is mandatory for LCC development after agent boot.

## Objective

Build and change LCC so each logic area remains independently understandable, testable, and replaceable. Future MSA extraction must stay possible without rewriting unrelated features.

## Required Boundaries

- Domain rules stay independent from UI, PTY, HTTP, storage, and process orchestration.
- Application/use-case code coordinates domain rules and ports; it should not contain view layout or transport details.
- Adapters handle concrete HTTP, WebSocket, PTY, file, browser, OS, and external-service behavior.
- UI components compose state and presentation; they should not own backend protocol rules.
- Operations tooling must not bypass product contracts such as terminal submit protocol, ledger state rules, policy ACK, QA gates, or commit gates.

## Frozen Contracts

When a feature is accepted with tests/evidence, treat it as a frozen contract.

Any later change that touches that contract must:

- name the impacted feature or ledger item
- describe the boundary being changed
- run the feature's regression tests and relevant integration checks
- record evidence in `data/work-ledger.json`
- commit only the scoped verified unit

## Protected Contract Registry

Some contracts are operationally critical and must be treated as protected even while related work remains in progress. Before changing code in or around these areas, developers and reviewers must check the ledger, name the impacted contract, and confirm the regression suite.

Current protected contracts:

- Terminal newline/submit injection: command text injection and Enter submit are separate operations. The accepted direction is `prompt-text` / `prompt-submit` with separate ACKs. Do not concatenate text and submit Enter into one fragile string path, do not use bracketed paste or CSI Enter for submit, and do not bypass the product contract through raw PTY writes without explicit Caesar approval.
- Terminal render/replay: live rendering, replay tailing, scrollback limits, and xterm control-response filtering must not be changed as incidental UI work.
- Ledger execution gates: ledger edit freeze, approval gates, event dispatch, and polling watchdog behavior must not be bypassed by ad hoc automation.
- Policy ACK boot: agents must read required policy/ledger files before implementation work.
- Commit and QA gates: verified scoped commits only; UI work needs screenshot/CDP, DOM/text, console, and viewport evidence where feasible.

If a protected contract is touched:

- stop broad implementation and report the impacted contract
- get Dev Lead/Caesar approval before changing behavior
- run the named regression checks
- record evidence and residual risk in the work ledger
- keep the commit scoped to the protected contract or split it from unrelated work

## Terminal Newline/Submit Contract

The terminal newline/submit path is P0 because it controls whether agents receive instructions.

Required behavior:

- Preserve internal LF in command text.
- Normalize CRLF and bare CR in text to LF.
- Trim trailing newlines before submit.
- Inject command text and Enter submit as separate operations.
- Require text ACK and submit ACK before clearing the composer or marking dispatch success.
- Keep `prompt-submit repeat=2` as emergency/manual behavior only, not the default.
- Shift+Enter in the 9000 composer remains native textarea multiline editing; plain Enter submits.

Regression checks must include the terminal prompt submit unit tests, web composer tests, web build, and 9000 runtime evidence after API reload when protocol behavior changes.

## MSA Readiness

Before adding a new shared dependency or cross-feature call, ask whether that dependency would block extracting the feature into a separate service later.

Prefer:

- explicit interfaces over direct imports across unrelated features
- small data contracts over shared mutable state
- versionable API/event shapes over implicit coupling
- feature-owned tests over broad incidental coverage

## Runtime Adjustability

Operationally sensitive limits must not require a singleton backend restart when practical.

Examples include terminal replay bytes, visible scrollback rows, polling intervals, stuck-input thresholds, wake-loop cooldowns, and UI retention windows.

Prefer:

- runtime config, local settings, API-settable state, or environment-backed reloadable policy over hardcoded constants
- bounded min/max validation for every adjustable value
- visible evidence of the active value in diagnostics or status files
- safe defaults that can be tuned during operation

If a change still requires restarting `9001`, record why dynamic adjustment is not practical and provide a lower-risk fallback path first.

## Developer Reporting

Developer reports must include:

- boundary touched
- contract or regression suite run
- evidence path or command output
- residual coupling risk
- next action or blocker
