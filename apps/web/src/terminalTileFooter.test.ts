import test from "node:test";
import assert from "node:assert/strict";
import { shouldSubmitTerminalTileComposer, stopTerminalTileFooterMouseDown } from "./terminalTileFooter.ts";

function createComposerEvent(overrides: Partial<Parameters<typeof shouldSubmitTerminalTileComposer>[0]> = {}) {
  let stopped = 0;
  let prevented = 0;
  const event = {
    key: "Enter",
    shiftKey: false,
    nativeEvent: { isComposing: false },
    stopPropagation: () => {
      stopped += 1;
    },
    preventDefault: () => {
      prevented += 1;
    },
    ...overrides
  };

  return {
    event,
    get stopped() {
      return stopped;
    },
    get prevented() {
      return prevented;
    }
  };
}

test("terminal grid tile footer Enter submits and prevents the native newline", () => {
  const probe = createComposerEvent();

  assert.equal(shouldSubmitTerminalTileComposer(probe.event), true);
  assert.equal(probe.stopped, 1);
  assert.equal(probe.prevented, 1);
});

test("terminal grid tile footer Shift+Enter keeps multiline editing", () => {
  const probe = createComposerEvent({ shiftKey: true });

  assert.equal(shouldSubmitTerminalTileComposer(probe.event), false);
  assert.equal(probe.stopped, 1);
  assert.equal(probe.prevented, 0);
});

test("terminal grid tile footer ignores Enter while IME composition is active", () => {
  const probe = createComposerEvent({ nativeEvent: { isComposing: true } });

  assert.equal(shouldSubmitTerminalTileComposer(probe.event), false);
  assert.equal(probe.stopped, 1);
  assert.equal(probe.prevented, 0);
});

test("terminal grid tile footer ignores non-Enter keys without stealing focus flow", () => {
  const probe = createComposerEvent({ key: "a" });

  assert.equal(shouldSubmitTerminalTileComposer(probe.event), false);
  assert.equal(probe.stopped, 1);
  assert.equal(probe.prevented, 0);
});

test("terminal grid tile footer mouse down does not bubble to the tile activator", () => {
  let stopped = 0;

  stopTerminalTileFooterMouseDown({
    stopPropagation: () => {
      stopped += 1;
    }
  });

  assert.equal(stopped, 1);
});
