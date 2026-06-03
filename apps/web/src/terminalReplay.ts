export const TERMINAL_RENDER_LINE_LIMIT = 150;

export function tailTerminalLines(value: string, limit = TERMINAL_RENDER_LINE_LIMIT) {
  if (limit <= 0) return "";
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length <= limit) return value;
  return lines.slice(-limit).join("\r\n");
}

export function sanitizeTerminalPreviewForSummary(value: string) {
  return value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[PX^_][\s\S]*?\x1b\\/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\[[^\r\n]*/g, "")
    .replace(/\x1b[()#%*+\-.\/][0-9A-Za-z]/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\r\n")
    .trim();
}

export function repairTerminalReplayForXterm(value: string) {
  return repairTerminalStreamForXterm(value, "").text;
}

export function repairTerminalStreamForXterm(value: string, pending = "") {
  const combined = `${pending}${value}`;
  let output = "";
  let nextPending = "";
  for (let index = 0; index < combined.length; index += 1) {
    const char = combined[index];
    if (char !== "\x1b") {
      output += char;
      continue;
    }

    if (index === combined.length - 1) {
      nextPending = "\x1b";
      break;
    }

    if (combined[index + 1] !== "[") {
      output += char;
      continue;
    }

    let cursor = index + 2;
    while (cursor < combined.length) {
      const next = combined[cursor];
      if (next === "\r" || next === "\n" || next === "\x1b") break;
      if (next >= "@" && next <= "~") {
        output += combined.slice(index, cursor + 1);
        index = cursor;
        break;
      }
      if (!((next >= "0" && next <= "?") || (next >= " " && next <= "/"))) {
        while (cursor < combined.length && combined[cursor] !== "\r" && combined[cursor] !== "\n" && combined[cursor] !== "\x1b") {
          cursor += 1;
        }
        break;
      }
      cursor += 1;
    }

    if (cursor >= combined.length) {
      nextPending = combined.slice(index);
      break;
    }

    if (combined[cursor] === "\r" || combined[cursor] === "\n" || combined[cursor] === "\x1b") {
      index = cursor - 1;
    }
  }
  return { text: output, pending: nextPending };
}
