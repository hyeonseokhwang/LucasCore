import test from "node:test";
import assert from "node:assert/strict";
import { isTerminalContainerReady, pickActiveTerminalSessionId, shouldAttachLiveTerminal } from "./terminalSurface.ts";

test("pickActiveTerminalSessionId prefers the current card when it still exists", () => {
  assert.equal(
    pickActiveTerminalSessionId(
      [
        { id: "dev-1", status: "active" },
        { id: "dev-2", status: "active" }
      ],
      "dev-2"
    ),
    "dev-2"
  );
});

test("pickActiveTerminalSessionId falls back to the first active session on reload", () => {
  assert.equal(
    pickActiveTerminalSessionId([
      { id: "dev-1", status: "stopped" },
      { id: "dev-2", status: "active" },
      { id: "dev-3", status: "active" }
    ]),
    "dev-2"
  );
});

test("pickActiveTerminalSessionId falls back to the first session when none are active", () => {
  assert.equal(
    pickActiveTerminalSessionId([
      { id: "dev-1", status: "exited" },
      { id: "dev-2", status: "stopped" }
    ]),
    "dev-1"
  );
});

test("pickActiveTerminalSessionId returns empty when no sessions exist", () => {
  assert.equal(pickActiveTerminalSessionId([]), "");
});

test("shouldAttachLiveTerminal allows only the selected active card to attach", () => {
  assert.equal(shouldAttachLiveTerminal("dev-1", "dev-1"), true);
  assert.equal(shouldAttachLiveTerminal("dev-2", "dev-1"), false);
  assert.equal(shouldAttachLiveTerminal("", "dev-1"), false);
});

test("isTerminalContainerReady requires positive width and height", () => {
  assert.equal(isTerminalContainerReady(320, 520), true);
  assert.equal(isTerminalContainerReady(0, 520), false);
  assert.equal(isTerminalContainerReady(320, 0), false);
});
