import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTerminalPreviewForSummary, tailTerminalLines } from "./terminalReplay.ts";

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

test("sanitizeTerminalPreviewForSummary strips OSC title sequences", () => {
  assert.equal(sanitizeTerminalPreviewForSummary("\u001b]0;Lucas Core\u0007prompt"), "prompt");
});

test("sanitizeTerminalPreviewForSummary preserves readable lines", () => {
  assert.equal(sanitizeTerminalPreviewForSummary("alpha\r\nbeta\tgamma\n"), "alpha\r\nbeta\tgamma");
});
