import test from "node:test";
import assert from "node:assert/strict";
import { encodePromptForPtySubmit, normalizePromptForSubmit } from "./terminalPrompt.ts";

test("normalizePromptForSubmit leaves a single-line prompt unchanged", () => {
  assert.equal(normalizePromptForSubmit("hello terminal"), "hello terminal");
});

test("normalizePromptForSubmit removes trailing CRLF before submit", () => {
  assert.equal(normalizePromptForSubmit("hello terminal\r\n"), "hello terminal");
});

test("encodePromptForPtySubmit preserves multiline LF content and submits with Enter", () => {
  assert.equal(encodePromptForPtySubmit("line one\nline two"), "line one\nline two\r");
});

test("encodePromptForPtySubmit normalizes CRLF and bare CR to LF inside prompt content", () => {
  assert.equal(encodePromptForPtySubmit("line one\r\nline two\rline three"), "line one\nline two\nline three\r");
});

test("encodePromptForPtySubmit handles empty or only newline input as submit only", () => {
  assert.equal(encodePromptForPtySubmit(""), "\r");
  assert.equal(encodePromptForPtySubmit("\n"), "\r");
  assert.equal(encodePromptForPtySubmit("\r\n\r\n"), "\r");
});

test("encodePromptForPtySubmit preserves internal blank lines while trimming trailing newlines", () => {
  assert.equal(encodePromptForPtySubmit("line one\n\nline three\n"), "line one\n\nline three\r");
});

test("encodePromptForPtySubmit normalizes mixed CR and LF without dropping text", () => {
  assert.equal(
    encodePromptForPtySubmit("alpha\rbravo\r\ncharlie\ndelta\r\n"),
    "alpha\nbravo\ncharlie\ndelta\r"
  );
});

test("encodePromptForPtySubmit does not wrap prompt in bracketed paste or CSI sequences", () => {
  const encoded = encodePromptForPtySubmit("line one\nline two");

  assert.doesNotMatch(encoded, /\x1b\[200~/);
  assert.doesNotMatch(encoded, /\x1b\[201~/);
  assert.doesNotMatch(encoded, /\x1b\[/);
});
