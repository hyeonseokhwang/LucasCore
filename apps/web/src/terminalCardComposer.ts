const TERMINAL_CARD_DRAFT_STORAGE_PREFIX = "lcc-core-terminal-card-draft:";

export function terminalCardDraftStorageKey(sessionId: string) {
  return `${TERMINAL_CARD_DRAFT_STORAGE_PREFIX}${sessionId}`;
}

export function readTerminalCardDraft(
  storage: Pick<Storage, "getItem"> | null | undefined,
  sessionId: string
) {
  if (!storage || !sessionId) return "";
  try {
    return storage.getItem(terminalCardDraftStorageKey(sessionId)) || "";
  } catch {
    return "";
  }
}

export function writeTerminalCardDraft(
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
  sessionId: string,
  value: string
) {
  if (!storage || !sessionId) return;
  try {
    if (value) storage.setItem(terminalCardDraftStorageKey(sessionId), value);
    else storage.removeItem(terminalCardDraftStorageKey(sessionId));
  } catch {}
}

export function clipboardItemsContainImage(items: ArrayLike<{ type?: string | null }> | null | undefined) {
  if (!items) return false;
  return Array.from(items).some((item) => typeof item.type === "string" && item.type.startsWith("image/"));
}

export const TERMINAL_IMAGE_ATTACHMENT_BLOCKED_MESSAGE =
  "Grid image attach is not available yet in the terminal write API.";
