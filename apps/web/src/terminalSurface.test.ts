import test from "node:test";
import assert from "node:assert/strict";
import { pickActiveTerminalSessionId, shouldAttachLiveTerminal } from "./terminalSurface.ts";

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

test("shouldAttachLiveTerminal allows only the selected active card to attach", () => {
  assert.equal(shouldAttachLiveTerminal("dev-1", "dev-1"), true);
  assert.equal(shouldAttachLiveTerminal("dev-2", "dev-1"), false);
  assert.equal(shouldAttachLiveTerminal("", "dev-1"), false);
});
