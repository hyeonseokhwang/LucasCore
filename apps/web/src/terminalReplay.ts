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

type TerminalDisplaySnapshot = {
  lines: string[];
  row: number;
  col: number;
  maxRows: number;
};

function ensureSnapshotRow(snapshot: TerminalDisplaySnapshot) {
  while (snapshot.lines.length <= snapshot.row) snapshot.lines.push("");
  if (snapshot.lines.length > snapshot.maxRows) {
    const overflow = snapshot.lines.length - snapshot.maxRows;
    snapshot.lines.splice(0, overflow);
    snapshot.row = Math.max(0, snapshot.row - overflow);
  }
}

function putSnapshotChar(snapshot: TerminalDisplaySnapshot, char: string) {
  ensureSnapshotRow(snapshot);
  const chars = Array.from(snapshot.lines[snapshot.row]);
  while (chars.length < snapshot.col) chars.push(" ");
  chars[snapshot.col] = char;
  snapshot.lines[snapshot.row] = chars.join("");
  snapshot.col += 1;
}

function parseCsiParams(value: string) {
  return value
    .replace(/^\?/, "")
    .split(";")
    .map((part) => Number.parseInt(part.trim(), 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function applySnapshotCsi(snapshot: TerminalDisplaySnapshot, params: string, command: string) {
  const values = parseCsiParams(params);
  const count = values[0] || 1;
  if (command === "H" || command === "f") {
    snapshot.row = Math.max(0, (values[0] || 1) - 1);
    snapshot.col = Math.max(0, (values[1] || 1) - 1);
    ensureSnapshotRow(snapshot);
  } else if (command === "A") {
    snapshot.row = Math.max(0, snapshot.row - count);
  } else if (command === "B") {
    snapshot.row += count;
    ensureSnapshotRow(snapshot);
  } else if (command === "C") {
    snapshot.col += count;
  } else if (command === "D") {
    snapshot.col = Math.max(0, snapshot.col - count);
  } else if (command === "K") {
    ensureSnapshotRow(snapshot);
    const mode = values[0] || 0;
    const chars = Array.from(snapshot.lines[snapshot.row]);
    if (mode === 2) {
      snapshot.lines[snapshot.row] = "";
    } else if (mode === 1) {
      snapshot.lines[snapshot.row] = `${" ".repeat(snapshot.col)}${chars.slice(snapshot.col).join("")}`;
    } else {
      snapshot.lines[snapshot.row] = chars.slice(0, snapshot.col).join("");
    }
  } else if (command === "J" && (values[0] || 0) === 2) {
    snapshot.lines = [""];
    snapshot.row = 0;
    snapshot.col = 0;
  }
}

export function terminalDisplaySnapshotForPreview(value: string, maxRows = TERMINAL_RENDER_LINE_LIMIT) {
  const snapshot: TerminalDisplaySnapshot = {
    lines: [""],
    row: 0,
    col: 0,
    maxRows
  };
  const chars = Array.from(value || "");
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (char === "\x1b") {
      const next = chars[index + 1];
      if (next === "[") {
        let cursor = index + 2;
        while (cursor < chars.length) {
          const command = chars[cursor];
          if (command >= "@" && command <= "~") {
            applySnapshotCsi(snapshot, chars.slice(index + 2, cursor).join(""), command);
            index = cursor;
            break;
          }
          cursor += 1;
        }
        if (cursor >= chars.length) break;
      } else if (next === "]") {
        let cursor = index + 2;
        while (cursor < chars.length) {
          if (chars[cursor] === "\x07") {
            index = cursor;
            break;
          }
          if (chars[cursor] === "\x1b" && chars[cursor + 1] === "\\") {
            index = cursor + 1;
            break;
          }
          cursor += 1;
        }
        if (cursor >= chars.length) break;
      } else {
        index += 1;
      }
      continue;
    }
    if (char === "\r") {
      snapshot.col = 0;
      continue;
    }
    if (char === "\n") {
      snapshot.row += 1;
      snapshot.col = 0;
      ensureSnapshotRow(snapshot);
      continue;
    }
    if (char === "\b") {
      snapshot.col = Math.max(0, snapshot.col - 1);
      continue;
    }
    if (char === "\t") {
      const spaces = 4 - (snapshot.col % 4);
      for (let space = 0; space < spaces; space += 1) putSnapshotChar(snapshot, " ");
      continue;
    }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(char)) continue;
    putSnapshotChar(snapshot, char);
  }
  return snapshot.lines
    .map((line) => line.trimEnd())
    .join("\r\n")
    .trim();
}

export function terminalPreviewTextForSnapshot(rawPreview: string, textPreview: string, maxRows = TERMINAL_RENDER_LINE_LIMIT) {
  if (/\x1b[\[\]]/.test(rawPreview)) {
    return sanitizeTerminalPreviewForSummary(terminalDisplaySnapshotForPreview(rawPreview, maxRows));
  }
  const textSnapshot = sanitizeTerminalPreviewForSummary(tailTerminalLines(textPreview || rawPreview, maxRows));
  if (textSnapshot) return textSnapshot;
  return sanitizeTerminalPreviewForSummary(terminalDisplaySnapshotForPreview(rawPreview, maxRows));
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
