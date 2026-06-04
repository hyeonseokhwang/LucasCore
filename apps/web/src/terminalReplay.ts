export const TERMINAL_RENDER_LINE_LIMIT = 150;

export function tailTerminalLines(value: string, limit = TERMINAL_RENDER_LINE_LIMIT) {
  if (limit <= 0) return "";
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length <= limit) return value;
  return lines.slice(-limit).join("\r\n");
}

export function tailStringByUtf8Bytes(value: string, maxBytes: number) {
  if (maxBytes <= 0) return "";
  const encoder = new TextEncoder();
  if (encoder.encode(value).byteLength <= maxBytes) return value;
  let output = "";
  let bytes = 0;
  for (const char of Array.from(value).reverse()) {
    const charBytes = encoder.encode(char).byteLength;
    if (bytes + charBytes > maxBytes) break;
    output = `${char}${output}`;
    bytes += charBytes;
  }
  return output;
}
