import test from "node:test";
import assert from "node:assert/strict";
import {
  chunkTerminalWrite,
  enqueueTerminalWriteItems,
  isTerminalControlResponse,
  shiftTerminalWriteItem,
  XTERM_MAX_QUEUED_BYTES,
  XTERM_WRITE_CHUNK_BYTES
} from "./xtermWriteQueue.ts";

test("chunkTerminalWrite splits writes into 1KB chunks", () => {
  const chunks = chunkTerminalWrite("a".repeat(XTERM_WRITE_CHUNK_BYTES * 2 + 17));
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, XTERM_WRITE_CHUNK_BYTES);
  assert.equal(chunks[1].length, XTERM_WRITE_CHUNK_BYTES);
  assert.equal(chunks[2].length, 17);
});

test("enqueueTerminalWriteItems bounds the transient queue to 32KB by dropping oldest chunks", () => {
  const result = enqueueTerminalWriteItems([], 0, "a".repeat(XTERM_MAX_QUEUED_BYTES + XTERM_WRITE_CHUNK_BYTES), {
    kind: "output"
  });

  assert.equal(result.queuedBytes, XTERM_MAX_QUEUED_BYTES);
  assert.equal(result.queue.length, XTERM_MAX_QUEUED_BYTES / XTERM_WRITE_CHUNK_BYTES);
  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0]?.data.length, XTERM_WRITE_CHUNK_BYTES);
});

test("enqueueTerminalWriteItems keeps the newest chunk even when a single write exceeds the cap", () => {
  const result = enqueueTerminalWriteItems([], 0, "a".repeat(XTERM_MAX_QUEUED_BYTES * 2), {
    kind: "output"
  });

  assert.ok(result.queue.length > 0);
  assert.ok(result.queuedBytes <= XTERM_MAX_QUEUED_BYTES);
  assert.equal(result.queue.at(-1)?.data.length, XTERM_WRITE_CHUNK_BYTES);
});

test("replay reset can clear stale output before enqueueing fresh replay", () => {
  const stale = enqueueTerminalWriteItems([], 0, "stale-output", { kind: "output" });
  const replay = enqueueTerminalWriteItems([], 0, "fresh-replay", { kind: "replay", stickToBottom: true });

  assert.equal(stale.queue.length > 0, true);
  assert.deepEqual(
    replay.queue.map((item) => ({ data: item.data, kind: item.kind, stickToBottom: item.stickToBottom })),
    [{ data: "fresh-replay", kind: "replay", stickToBottom: true }]
  );
});

test("output and system writes are both backpressured by the same bounded queue", () => {
  const output = enqueueTerminalWriteItems([], 0, "o".repeat(XTERM_MAX_QUEUED_BYTES - XTERM_WRITE_CHUNK_BYTES), {
    kind: "output"
  });
  const combined = enqueueTerminalWriteItems(output.queue, output.queuedBytes, "s".repeat(XTERM_WRITE_CHUNK_BYTES * 2), {
    kind: "system"
  });

  assert.equal(combined.queuedBytes, XTERM_MAX_QUEUED_BYTES);
  assert.equal(combined.dropped.length, 1);
  assert.equal(combined.dropped[0]?.kind, "output");
  assert.equal(combined.queue.at(-1)?.kind, "system");
});

test("isTerminalControlResponse detects terminal-generated CSI responses", () => {
  assert.equal(isTerminalControlResponse("\x1b[35;1R"), true);
  assert.equal(isTerminalControlResponse("\x1b[0n"), true);
  assert.equal(isTerminalControlResponse("\x1b[?1;2c"), true);
  assert.equal(isTerminalControlResponse("\x1b[A"), false);
  assert.equal(isTerminalControlResponse("Summarize recent commits"), false);
});

test("shiftTerminalWriteItem decrements queued bytes as the RAF drain advances", () => {
  const queued = enqueueTerminalWriteItems([], 0, "abc", { kind: "output" });
  const shifted = shiftTerminalWriteItem(queued.queue, queued.queuedBytes);

  assert.equal(shifted.item?.data, "abc");
  assert.equal(shifted.queuedBytes, 0);
  assert.equal(shifted.queue.length, 0);
});
