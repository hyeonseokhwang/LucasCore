#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requestedApiBase = process.env.LCC_API_BASE || "";
const apiBaseCandidates = Array.from(
  new Set(
    [requestedApiBase, "http://127.0.0.1:9000", "http://127.0.0.1:20086", "http://127.0.0.1:9001"].filter(Boolean)
  )
);
let apiBase = requestedApiBase || apiBaseCandidates[0];
let sessionId = process.env.LCC_NEWLINE_SMOKE_SESSION || "terminal-normalization-verify";
const createSession = process.env.LCC_NEWLINE_SMOKE_CREATE === "1";
const evidenceDir = path.join(root, "data", "system-logs", "terminal-normalization-20260604");
const evidencePath = path.join(evidenceDir, "newline-channel-smoke.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveApiBase() {
  for (const candidate of apiBaseCandidates) {
    try {
      const response = await fetch(`${candidate}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        apiBase = candidate;
        return candidate;
      }
    } catch {
      // Try the next known runtime candidate.
    }
  }
  throw new Error(`Unable to reach any API base: ${apiBaseCandidates.join(", ")}`);
}

async function api(pathname, options = {}) {
  const response = await fetch(`${apiBase}${pathname}`, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} failed: ${response.status} ${text}`);
  }
  return json;
}

async function createSmokeSession() {
  const id = `${sessionId}-${Date.now()}`;
  const session = await api("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      id,
      name: "Terminal Newline Smoke",
      team: "verification",
      cwd: "workspaces/ceo/repo",
      cmd: "codex.cmd",
      args: ["--model", "gpt-5.5", "--cd", ".", "--no-alt-screen", "--dangerously-bypass-approvals-and-sandbox"],
      model: "gpt-5.5"
    })
  });
  sessionId = id;
  await sleep(Number(process.env.LCC_NEWLINE_SMOKE_BOOT_WAIT_MS || 9000));
  return session;
}

function sessionPreview(session) {
  return String(session?.preview_text || session?.preview || "");
}

function hasSemanticReply(preview, marker) {
  return String(preview || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .some((line) => {
      if (!line.includes(`${marker} state=pass`)) return false;
      if (/Reply exactly|Reply one line|Reply visibly/i.test(line)) return false;
      return true;
    });
}

async function waitForMarker(marker, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastPreview = "";
  while (Date.now() < deadline) {
    const session = await api(`/api/sessions/${encodeURIComponent(sessionId)}`);
    lastPreview = sessionPreview(session);
    if (hasSemanticReply(lastPreview, marker)) {
      return { ok: true, updated_at: session.updated_at || null, previewTail: lastPreview.slice(-1600) };
    }
    await sleep(1500);
  }
  return { ok: false, updated_at: null, previewTail: lastPreview.slice(-1600) };
}

async function sendSplit(prompt) {
  await api(`/api/sessions/${encodeURIComponent(sessionId)}/prompt-text`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: prompt })
  });
  await api(`/api/sessions/${encodeURIComponent(sessionId)}/prompt-submit`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ repeat: 1 })
  });
}

async function sendWrite(prompt) {
  await api(`/api/sessions/${encodeURIComponent(sessionId)}/write`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: prompt })
  });
}

async function sendWsPrompt(prompt) {
  const wsUrl = apiBase.replace(/^http/i, "ws") + "/ws/terminal";
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket sendPrompt timed out"));
    }, 15000);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "attach", sessionId }));
      socket.send(JSON.stringify({ type: "sendPrompt", sessionId, prompt }));
    });
    socket.addEventListener("message", (event) => {
      let value = null;
      try {
        value = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (value?.type === "promptAck" && value?.sessionId === sessionId) {
        clearTimeout(timeout);
        socket.close();
        resolve();
      }
      if (value?.type === "error") {
        clearTimeout(timeout);
        socket.close();
        reject(new Error(value.message || "WebSocket terminal error"));
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket connection failed"));
    });
  });
}

function buildPrompt(channel, marker) {
  return `TERMINAL_NEWLINE_SMOKE channel=${channel} marker=${marker}\nReply exactly one line: ${marker} state=pass`;
}

async function runCase(channel, send) {
  const marker = `TERMINAL_NEWLINE_SMOKE_${channel}_${Date.now()}`;
  const prompt = buildPrompt(channel, marker);
  const startedAt = new Date().toISOString();
  await send(prompt, marker);
  const result = await waitForMarker(marker);
  return {
    channel,
    marker,
    startedAt,
    completedAt: new Date().toISOString(),
    semanticAck: result.ok,
    updated_at: result.updated_at,
    previewTail: result.previewTail
  };
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await resolveApiBase();
  const health = await api("/api/health");
  const createdSession = createSession ? await createSmokeSession() : null;
  const cases = [
    ["split", (prompt) => sendSplit(prompt)],
    ["write_plain", (prompt) => sendWrite(prompt)],
    ["write_trailing_lf", (prompt) => sendWrite(`${prompt}\n`)],
    ["write_trailing_crlf", (prompt) => sendWrite(`${prompt}\r\n`)],
    ["ws_sendPrompt", (prompt) => sendWsPrompt(prompt)]
  ];
  const results = [];
  for (const [channel, send] of cases) {
    results.push(await runCase(channel, send));
    await sleep(2000);
  }
  const report = {
    at: new Date().toISOString(),
    apiBaseRequested: requestedApiBase || null,
    apiBaseResolved: apiBase,
    apiBaseCandidates,
    sessionId,
    health,
    createdSession: createdSession
      ? {
          id: createdSession.id,
          name: createdSession.name,
          team: createdSession.team,
          status: createdSession.status
        }
      : null,
    ok: results.every((item) => item.semanticAck),
    results
  };
  fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  const report = {
    at: new Date().toISOString(),
    apiBaseRequested: requestedApiBase || null,
    apiBaseResolved: apiBase,
    apiBaseCandidates,
    sessionId,
    ok: false,
    error: error.message,
    stack: error.stack
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2), "utf8");
  console.error(error.stack || String(error));
  process.exit(1);
});
