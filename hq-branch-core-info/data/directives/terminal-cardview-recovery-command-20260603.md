# Terminal Card View Recovery Command

Issued by: Caesar
Issued for: Max / Development Team
Mode: emergency
Ledger reference: disabled
Runtime constraint: preserve 9001 singleton

## Situation

Lucas reports that terminal card/fullscreen behavior remains unstable. The recent failure was not only a code issue; it was also a command-chain failure:

- Caesar and Max communication allowed "review" to be interpreted as "edit".
- Max changed protected terminal rendering code without a narrow `permission=edit` task card.
- Long system prompts can remain in the Codex PTY composer when newline/submit handling misses the final submit.
- Terminal rendering, fullscreen, popout, replay, newline, and submit behavior are protected contracts.

## Current Operating Rules

- Do not read or act from `data/work-ledger.json`, `data/ceo-command-ledger.json`, `data/execution-board.json`, or 9100.
- Work only from direct task cards issued by Lucas, Caesar, or Max.
- Every task must include `permission=inspect|edit|verify|commit`.
- If permission is omitted, treat it as `permission=inspect`.
- Developers must not edit source unless the assigned task card explicitly says `permission=edit`.
- For protected contracts, `permission=edit` still requires a short impact report before changing source.

## Lucas Terminal Model

The terminal is not a newly designed UI terminal. Codex under 9001 produces terminal text. LCC takes a tail/slice of that source and displays it.

Expected behavior:

- Card, fullscreen, and popout should show the same terminal source semantics.
- Container size can differ.
- Buffer/replay policy must be explicit and stable.
- Do not reintroduce raw PTY write bypass, bracketed paste submit, CSI Enter, or concatenated prompt+Enter strings.
- `prompt-text` and `prompt-submit` remain separated.

## Immediate Task Card For Max

task_id: terminal-cardview-recovery-20260603
owner: Max
permission: inspect
scope: terminal card/fullscreen/popout rendering and command-chain handoff only
files_allowed_to_read:

- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `apps/api/src/main.rs`
- `tools/terminal-stuck-input-watchdog.cjs`
- `data/system-logs/terminal-stuck-input-watchdog.log`
- `data/terminal-stuck-input-watchdog-events.jsonl`
- `data/terminal-tail-samples.jsonl`

must_not:

- Do not edit source.
- Do not assign developers to edit source.
- Do not commit.
- Do not restart 9001.
- Do not use ledger files.

required_report:

- `ACK terminal-cardview-recovery permission=inspect`
- `observed=<what is actually broken>`
- `probable_root=<rendering|replay|scroll|submit|handoff|unknown>`
- `proposed_task_cards=<specific inspect/edit/verify cards>`
- `protected_contract_impact=<none|terminal-render|terminal-submit|both>`
- `blocker=<none|...>`
- `next=<one next action>`

## Command-Chain Guard

Long PTY system prompts should end with a stable sentinel when auto-submit protection is intended:

`LCC_AUTO_SUBMIT_ON_STABLE_TAIL_V1`

The terminal stuck-input watchdog may press Enter-only if:

- the prompt tail is stable,
- it is a system-injected prompt,
- and the tail contains the sentinel or an explicit reply/submit instruction.

Use the sentinel for future long system prompts instead of relying on the watchdog to infer intent from a long body.
