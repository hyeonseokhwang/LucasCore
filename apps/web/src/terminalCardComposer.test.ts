import test from "node:test";
import assert from "node:assert/strict";
import {
  clipboardItemsContainImage,
  readTerminalCardDraft,
  terminalCardDraftStorageKey,
  writeTerminalCardDraft
} from "./terminalCardComposer.ts";

test("terminal card draft storage key is namespaced per session", () => {
  assert.equal(terminalCardDraftStorageKey("developer-3"), "lcc-core-terminal-card-draft:developer-3");
});

test("terminal card draft reads missing storage as empty", () => {
  assert.equal(readTerminalCardDraft(null, "developer-3"), "");
});

test("terminal card draft round-trips through storage", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    }
  };

  writeTerminalCardDraft(storage, "developer-3", "alpha\nbeta");
  assert.equal(readTerminalCardDraft(storage, "developer-3"), "alpha\nbeta");

  writeTerminalCardDraft(storage, "developer-3", "");
  assert.equal(readTerminalCardDraft(storage, "developer-3"), "");
});

test("terminal card image detection returns true only for image clipboard items", () => {
  assert.equal(
    clipboardItemsContainImage([
      { type: "text/plain" },
      { type: "image/png" }
    ]),
    true
  );
  assert.equal(clipboardItemsContainImage([{ type: "text/plain" }, { type: "text/html" }]), false);
  assert.equal(clipboardItemsContainImage(undefined), false);
});
