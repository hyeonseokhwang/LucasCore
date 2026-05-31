export const TERMINAL_RENDER_LINE_LIMIT = 150;

export function tailTerminalLines(value: string, limit = TERMINAL_RENDER_LINE_LIMIT) {
  if (limit <= 0) return "";
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length <= limit) return value;
  return lines.slice(-limit).join("\r\n");
}
