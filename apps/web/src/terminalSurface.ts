type SessionLike = {
  id: string;
  status: string;
  preview?: string;
};

export const TERMINAL_SUMMARY_LINE_LIMIT = 12;

export function pickActiveTerminalSessionId(sessions: SessionLike[], currentId?: string) {
  if (currentId && sessions.some((session) => session.id === currentId)) {
    return currentId;
  }

  const firstActive = sessions.find((session) => session.status === "active");
  return firstActive?.id ?? sessions[0]?.id ?? "";
}

export function shouldAttachLiveTerminal(sessionId: string, activeSessionId: string) {
  return sessionId.length > 0 && sessionId === activeSessionId;
}
