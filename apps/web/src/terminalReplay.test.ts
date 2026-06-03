import test from "node:test";
import assert from "node:assert/strict";
import { repairTerminalReplayForXterm, repairTerminalStreamForXterm, sanitizeTerminalPreviewForSummary, tailTerminalLines, terminalDisplaySnapshotForPreview, terminalPreviewTextForSnapshot, terminalRuntimeTailTextForDisplay } from "./terminalReplay.ts";

test("tailTerminalLines leaves short output unchanged", () => {
  assert.equal(tailTerminalLines("a\r\nb\r\nc", 5), "a\r\nb\r\nc");
});

test("tailTerminalLines keeps only the requested tail lines", () => {
  assert.equal(tailTerminalLines("a\nb\nc\nd", 2), "c\r\nd");
});

test("tailTerminalLines normalizes mixed line endings in trimmed output", () => {
  assert.equal(tailTerminalLines("a\rb\r\nc\nd", 3), "b\r\nc\r\nd");
});

test("tailTerminalLines returns empty output for non-positive limits", () => {
  assert.equal(tailTerminalLines("a\nb", 0), "");
});

test("sanitizeTerminalPreviewForSummary strips ANSI CSI sequences", () => {
  assert.equal(sanitizeTerminalPreviewForSummary("\u001b[32mready\u001b[0m\r\n\u001b[Kdone"), "ready\r\ndone");
});

test("sanitizeTerminalPreviewForSummary strips partial CSI tails before xterm replay", () => {
  assert.equal(sanitizeTerminalPreviewForSummary("ready\r\n\u001b[35;1"), "ready");
  assert.equal(sanitizeTerminalPreviewForSummary("ready\r\n\u001b[└─ corrupted tail"), "ready");
});

test("sanitizeTerminalPreviewForSummary strips OSC title sequences", () => {
  assert.equal(sanitizeTerminalPreviewForSummary("\u001b]0;Lucas Core\u0007prompt"), "prompt");
});

test("sanitizeTerminalPreviewForSummary preserves readable lines", () => {
  assert.equal(sanitizeTerminalPreviewForSummary("alpha\r\nbeta\tgamma\n"), "alpha\r\nbeta\tgamma");
});

test("terminalRuntimeTailTextForDisplay preserves runtime tail lines without screen reconstruction", () => {
  const input = [
    "MANAGER_CHECK terminal-cardview state=doing",
    "next=verify runtime PTY tail",
    "\u001b[70;1HW\u001b[70;1HWo\u001b[70;1HWorking"
  ].join("\r\n");
  assert.equal(
    terminalRuntimeTailTextForDisplay(input, 20),
    "MANAGER_CHECK terminal-cardview state=doing\r\nnext=verify runtime PTY tail\r\nWWoWorking"
  );
});

test("terminalRuntimeTailTextForDisplay strips ANSI while keeping line order", () => {
  const input = "\u001b[32mready\u001b[0m\r\n\u001b[31mRan test\u001b[0m\r\nWorking";
  assert.equal(terminalRuntimeTailTextForDisplay(input, 20), "ready\r\nRan test\r\nWorking");
});

test("terminalRuntimeTailTextForDisplay removes only trailing spinner fragment lines", () => {
  const input = "meaningful report\r\nWorking (12m)\r\n\r\n◦in3\r\n\r\nWng\r\nWog\r\n\r\nor\r\nrk\r\n";
  assert.equal(terminalRuntimeTailTextForDisplay(input, 20), "meaningful report\r\nWorking (12m)");
});

test("terminalRuntimeTailTextForDisplay removes trailing single-letter spinner tail", () => {
  const input = "gpt-5.5 medium · D:\\Lucas Core v0.1\\workspaces\\ceo\\repoGoal achieved\r\nrk\r\nki\r\nin\r\nng\r\n•g";
  assert.equal(terminalRuntimeTailTextForDisplay(input, 20), "gpt-5.5 medium · D:\\Lucas Core v0.1\\workspaces\\ceo\\repoGoal achieved");
});

test("terminalRuntimeTailTextForDisplay removes repeated standalone spinner blocks", () => {
  const input = "report line\r\nW\r\nWo\r\nor\r\n•\r\nrk\r\nki\r\nin7\r\nWng\r\nWog\r\nnext line";
  assert.equal(terminalRuntimeTailTextForDisplay(input, 20), "report line\r\nnext line");
});

test("terminalDisplaySnapshotForPreview keeps the current cursor-overwritten text", () => {
  const input = "ready\r\n\u001b[3;1HWorking\u001b[3;1HW\u001b[3;1HWo\u001b[3;1HWorking";
  const output = terminalDisplaySnapshotForPreview(input, 10);
  assert.match(output, /ready/);
  assert.match(output, /Working/);
  assert.doesNotMatch(output, /\r\nW\r\nWo/);
});

test("terminalDisplaySnapshotForPreview does not accumulate spinner fragments as lines", () => {
  const input = "\u001b[10;1HW\u001b[10;1HWo\u001b[10;1Hor\u001b[10;1Hrk\u001b[10;1HWorking";
  assert.equal(terminalDisplaySnapshotForPreview(input, 20), "Working");
});

test("terminalPreviewTextForSnapshot uses text preview when raw cursor snapshot is only spinner state", () => {
  const raw = "\u001b[70;1HW\u001b[70;1HWo\u001b[70;1HWorking";
  const text = "MANAGER_CHECK terminal-cardview-snapshot-recovery state=doing\r\nnext=verify\r\n› Run /review on my current changes";
  assert.equal(
    terminalPreviewTextForSnapshot(raw, text, 20),
    "MANAGER_CHECK terminal-cardview-snapshot-recovery state=doing\r\nnext=verify\r\n› Run /review on my current changes"
  );
});

test("terminalPreviewTextForSnapshot still uses raw cursor snapshot when it has meaningful screen content", () => {
  const raw = "ready\r\n\u001b[3;1HWorking\u001b[3;1HW\u001b[3;1HWo\u001b[3;1HWorking";
  const text = "W\r\nWo\r\nor\r\nrk";
  assert.equal(terminalPreviewTextForSnapshot(raw, text, 20), "ready\r\n\r\nWorking");
});

test("repairTerminalReplayForXterm preserves valid ANSI and removes broken CSI tails", () => {
  assert.equal(repairTerminalReplayForXterm("\u001b[32mready\u001b[0m"), "\u001b[32mready\u001b[0m");
  assert.equal(repairTerminalReplayForXterm("ok\r\n\u001b[└─ bad\r\nnext"), "ok\r\n\r\nnext");
  assert.equal(repairTerminalReplayForXterm("ok\r\n\u001b[35;1"), "ok\r\n");
});

test("repairTerminalStreamForXterm carries split CSI sequences across chunks", () => {
  const first = repairTerminalStreamForXterm("ok\r\n\u001b[35", "");
  assert.equal(first.text, "ok\r\n");
  assert.equal(first.pending, "\u001b[35");
  const second = repairTerminalStreamForXterm(";1mready", first.pending);
  assert.equal(second.text, "\u001b[35;1mready");
  assert.equal(second.pending, "");
});
