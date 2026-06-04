# LCC Terminal Source Tail Policy - 2026-06-04

## Purpose

This document fixes the terminal policy for all Lucas Initiative staff and agents.

The terminal issue must not be reinterpreted as a replay, scrollback, memory, transcript, cleanup, reconstruction, or UI styling problem. The terminal display contract is simple: LCC mirrors each running Codex terminal process stream and keeps only a compact volatile backend tail.

## Lucas Policy

1. Codex runs inside CMD.
2. The LCC terminal source is the live CMD/Codex terminal stream, retained as one volatile 4 Kbyte singleton per agent.
3. LCC keeps one singleton volatile tail per agent.
4. The singleton tail remains available even when tabs change or no terminal view is mounted.
5. The retained 4 Kbytes are volatile. Older text is discarded as new text arrives.
6. The terminal popup uses the same singleton tail source and only changes display size.
7. The terminal card view uses the same singleton tail source and only changes display size/layout because it is one item in the grid.
8. Opening another terminal view must not replay, recreate, reattach, or resize the existing terminal source. The source is shared; each view is an independent display item.

One-line contract:

```text
CMD Codex terminal stream -> live output events -> card/popup/fullscreen xterm.write(data)
backend keeps only a 4KB volatile singleton tail; frontend must not replay it by default
```

Refresh/open behavior:

- A newly opened or refreshed view attaches to the stream.
- It must not request or write prior output as replay.
- It may be blank until new terminal output arrives.
- The 4KB singleton is the retained backend state bound, not a default frontend replay requirement.

## Logs Are Separate

Terminal logs may be preserved until the regular memory system is introduced.

That log preservation is separate from terminal display:

- Logs are written to files or future DB/memory storage.
- Logs are for audit, transcript, debugging, and recovery.
- Logs are not the terminal display source.
- Terminal display must not read full logs, replay old logs, or use logs as scrollback memory.

The terminal display source is only the live terminal singleton tail.

## What Went Wrong

The simple tail policy was repeatedly expanded into the wrong problem:

- terminal cards became log tail viewers
- preview, replay, scrollback, transcript, and memory were mixed together
- large replay values such as 16KB, 32KB, or more were treated as defaults
- opening fullscreen/popout could trigger replay-like behavior
- old ACKs, test echoes, queued messages, and stale output remained visible
- terminal scrollback was treated like operational memory

This made the terminal noisy, stale, and misleading. It also caused agents to solve the wrong problem for days.

## Correct Mental Model

The terminal is a compact live work surface.

It is not:

- durable memory
- a transcript viewer
- a log browser
- a replay engine
- a source of restart context
- a per-view PTY attachment system

Each agent has one current terminal tail. All display surfaces render that same tail.

## Implementation Requirements

Runtime scope:

- Current Lucas LCC terminal work uses only 9000 web UI, 9001 terminal/core API, and 9100 dashboard.
- Do not use, restart, inspect, or route terminal work through 9002 unless Lucas explicitly restores 9002 for a separate task.
- Treat 9002 references in older handoff notes as stale for this terminal issue.
- 9001 default terminal display must not read OS-agent registry log files. OS-agent/file-log attach is an explicit opt-in path only, not the default LCC terminal source.

Backend:

- Maintain one bounded volatile tail buffer per session.
- The default terminal display tail size is 4KB.
- On new output, append to the session tail and discard bytes beyond the 4KB cap.
- Keep file log writing separate from display tail updates.
- Do not prefill display tail from old logs for normal UI display.
- Do not make view creation mutate, resize, replay, or reattach the PTY/session source.
- Do not list stale OS registry sessions as live terminal cards unless an explicit OS attach registry is configured for that run.

Frontend:

- Card, popup, and fullscreen must consume the same session tail source.
- Card and popup differ only by layout/size.
- Opening popup/fullscreen must not request old transcript replay.
- The default card should remain compact and readable.
- Default terminal display must preserve terminal form by writing live terminal output bytes to xterm. Do not tokenize paths, model names, URLs, status lines, or command output into LCC-styled spans.
- Do not regex-clean, summarize, snapshot, score, restyle, or reconstruct the default terminal view.
- Horizontal terminal output should fit the current view width. Do not expose a left-right scroll requirement for normal terminal viewing.
- Vertical scrolling is allowed and required when the 4KB singleton tail exceeds the visible height; content inside the retained 4KB tail must remain reachable by vertical scroll.
- Transcript, debug log, raw JSON, and long history must be behind drill-down/log access only.

## Forbidden Regressions

Do not:

- increase default terminal display source beyond 4KB without explicit Lucas approval
- use full log files as terminal display source
- replay terminal history when opening a card, popup, fullscreen, or another tab
- make card and popup use different source semantics
- treat scrollback as memory
- solve fragment/noise symptoms by adding broad UI filters while leaving the source model wrong
- make the default terminal view look like a styled dashboard, syntax-highlighted log, or plain white log instead of the real terminal form
- replay old terminal data into a newly opened/refreshed default terminal view
- add regex cleanup, synthetic Codex coloring, snapshot rendering, or terminal-output scoring to the default terminal view
- mix newline/submit fixes with terminal display source changes unless explicitly scoped

## Expected Verification

A terminal display change is not accepted unless evidence shows:

1. API/session state exposes a bounded 4KB tail source.
2. Live output events are written directly to xterm.
3. Card and popup attach to the same stream and differ only by display size/layout.
4. Opening popup/fullscreen does not trigger replay or source mutation.
5. Old log/transcript content is not injected into the default terminal view.
6. File logs still preserve evidence separately.
7. Browser screenshot/CDP evidence confirms live output appears without stale replay.
8. Tests or source checks prevent 16KB/32KB replay and reconstruction helpers from returning as the default display policy.

## Staff Instruction

All Lucas Initiative staff and agents must use this policy before touching terminal rendering, preview, replay, log, scrollback, or terminal QA code.

If a task says "fix terminal" but does not preserve this policy, stop and ask for correction before editing source.
