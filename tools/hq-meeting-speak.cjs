#!/usr/bin/env node

const http = require("http");

const DEFAULT_HQ_URL = process.env.HQ_MEETING_API_URL || "http://localhost:9000";
const DEFAULT_MEETING_ID = process.env.HQ_MEETING_ID || "mtg-1780195037159";

function parseArgs(argv) {
  const options = {
    hq: DEFAULT_HQ_URL,
    meeting: DEFAULT_MEETING_ID,
    targets: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    const readValue = () => {
      if (next == null) throw new Error(`missing value for ${arg}`);
      index += 1;
      return next;
    };

    if (arg === "--hq") options.hq = readValue();
    else if (arg === "--meeting") options.meeting = readValue();
    else if (arg === "--author") options.author = readValue();
    else if (arg === "--body" || arg === "--content") options.content = readValue();
    else if (arg === "--thread" || arg === "--threadId") options.threadId = readValue();
    else if (arg === "--target") options.targets.push(readValue());
    else if (arg === "--targets") {
      const value = readValue();
      options.targets.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return [
    "Usage:",
    "  node tools/hq-meeting-speak.cjs --author <branch-author> --body <text> [options]",
    "",
    "Options:",
    "  --hq <url>             HQ API base. Default: http://localhost:9000",
    "  --meeting <id>         Meeting id. Default: mtg-1780195037159",
    "  --thread <msgId>       Parent thread message id",
    "  --target <name>        Repeatable target recipient",
    "  --targets <csv>        Comma-separated targets",
    "  --body <text>          Message body/content",
    "  --author <name>        Author, e.g. branch-lux"
  ].join("\n");
}

function requestJson(base, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let data = raw;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {}
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data });
            return;
          }
          reject(new Error(`${res.statusCode || 0} ${typeof data === "string" ? data : JSON.stringify(data)}`));
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!options.author) throw new Error("--author is required");
  if (!options.content || !options.content.trim()) throw new Error("--body is required");

  const payload = {
    author: options.author,
    body: options.content,
    content: options.content
  };
  if (options.threadId) payload.threadId = options.threadId;
  if (options.targets.length) payload.targets = options.targets;

  const response = await requestJson(options.hq, `/api/meetings/${encodeURIComponent(options.meeting)}/speak`, payload);
  process.stdout.write(`${JSON.stringify({ ok: true, meetingId: options.meeting, ...response.data })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
