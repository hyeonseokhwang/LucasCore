import test from "node:test";
import assert from "node:assert/strict";
import { repairTerminalReplayForXterm, repairTerminalStreamForXterm, sanitizeTerminalPreviewForSummary, tailTerminalLines } from "./terminalReplay.ts";

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
