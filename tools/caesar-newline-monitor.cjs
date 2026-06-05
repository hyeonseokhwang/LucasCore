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
const intervalMs = Math.max(1000, Number(process.env.CAESAR_NEWLINE_MONITOR_INTERVAL_MS || 5000));
const detectThresholdMs = Math.max(1000, Number(process.env.CAESAR_NEWLINE_DETECT_THRESHOLD_MS || 8000));
const repeatAlertMs = Math.max(10000, Number(process.env.CAESAR_NEWLINE_REPEAT_ALERT_MS || 120000));
const endAtMs = Number(process.env.CAESAR_NEWLINE_MONITOR_END_AT_MS || 0);
const once = process.argv.includes("--once");

const dataDir = path.join(root, "data");
const statePath = path.join(dataDir, "caesar-newline-monitor-state.json");
const eventsPath = path.join(dataDir, "caesar-newline-monitor-events.jsonl");
const runtimePath = path.join(dataDir, "caesar-newline-monitor-runtime.json");
const protectedSessions = new Set(["terminal-normalization-verify"]);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function appendEvent(event) {
  fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
  fs.appendFileSync(eventsPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8");
}

function stripAnsi(text) {
  return String(text || "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[()][A-Za-z0-9]/g, "")
    .replace(/\x1b[=>]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function normalizeLine(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function normalizeLines(text) {
  return stripAnsi(text)
    .split("\n")
    .map(normalizeLine);
}

function getSessionsArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(data?.sessions)) return data.sessions;
  return [];
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

async function getSessions() {
  const response = await fetch(`${apiBase}/api/sessions`);
  if (!response.ok) {
    throw new Error(`GET /api/sessions failed: ${response.status} ${await response.text()}`);
  }
  return getSessionsArray(await response.json());
}

function isDirectivePrompt(line) {
  return /^(?:›|âº|\?\?)\s+/.test(line);
}

function isQueuedInputLine(line) {
  return /^(?:↳|â³)\s+/.test(line);
}

function isReplyContract(line) {
  return /Reply\b|ACK\b|exactly one line|exactly two lines|Reply exactly|Reply one line|Reply visibly|state=ack|UNDERSTANDING_CHECK|POLICY_ACK/i.test(line);
}

function isAgentReply(line) {
  return /^(?:(?:•|â¢|\?\?)\s+)?(?:ACK|POLICY_ACK|UNDERSTANDING_CHECK|REPORT|HEARTBEAT|MANAGER_CHECK|DEV_CHANGE_CHECK|DEV_CHANGE_REPORT|AREUM_|MAX_|LUX_|TERMINAL_|CAESAR_)/.test(line);
}

function isCodexFooter(line) {
  return /gpt-5\.[0-9]/i.test(line) || /tab to queue message/i.test(line);
}

function summarizePrompt(lines, index) {
  return lines
    .slice(index, Math.min(index + 4, lines.length))
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
}

function detectInjectedNoEnter(session) {
  if (session.status !== "active" || !session.interactive || protectedSessions.has(session.id)) {
    return null;
  }

  const lines = normalizeLines(session.preview_text || session.preview || "").filter(Boolean);
  if (!lines.length) return null;

  const queuedIndex = lines.findIndex((line) => isQueuedInputLine(line));
  if (queuedIndex >= 0) {
    const block = lines.slice(Math.max(0, queuedIndex - 3));
    return {
      agentId: session.id,
      sessionName: session.name || session.id,
      updatedAt: session.updated_at || null,
      fingerprint: `${session.id}:queued-input-visible`,
      promptSummary: block.join(" ").slice(0, 500),
      evidenceFlags: ["queued-input-visible"],
      tail: block.join("\n").slice(-2000)
    };
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!isDirectivePrompt(line)) continue;
    const block = lines.slice(i);
    const blockText = block.join("\n");
    const promptSummary = summarizePrompt(lines, i);
    const requiresReply = block.some(isReplyContract);
    if (!requiresReply) continue;

    const postPromptReplies = block.slice(1).filter(isAgentReply);
    if (postPromptReplies.length > 0) {
      continue;
    }

    const evidenceFlags = [];
    if (block.some((entry) => /tab to queue message/i.test(entry))) evidenceFlags.push("queue-footer-visible");
    if (block.some((entry) => /^(?:•|â¢|\?\?)\s+Running\b/i.test(entry))) evidenceFlags.push("running-drift-without-required-reply");
    if (block.some((entry) => /^(?:◦|•|â¢|\?\?)\s+Working\b/i.test(entry))) evidenceFlags.push("working-footer-without-required-reply");
    if (block.some(isCodexFooter)) evidenceFlags.push("codex-footer-visible");

    return {
      agentId: session.id,
      sessionName: session.name || session.id,
      updatedAt: session.updated_at || null,
      fingerprint: `${session.id}:directive:${lines[i]}:${evidenceFlags.join(",")}`,
      promptSummary,
      evidenceFlags,
      tail: blockText.slice(-2000)
    };
  }

  return null;
}

async function promptSubmit(sessionId) {
  const submitResponse = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/prompt-submit`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ repeat: 1 })
  });
  if (submitResponse.ok) {
    return { method: "prompt-submit" };
  }
  if (submitResponse.status !== 404 && submitResponse.status !== 405) {
    throw new Error(`${sessionId} prompt-submit failed: ${submitResponse.status} ${await submitResponse.text()}`);
  }
  const fallbackResponse = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/write`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: "" })
  });
  if (!fallbackResponse.ok) {
    throw new Error(`${sessionId} fallback write-empty failed: ${fallbackResponse.status} ${await fallbackResponse.text()}`);
  }
  return { method: "write-empty-fallback" };
}

async function notifyCaesar(message) {
  const textResponse = await fetch(`${apiBase}/api/sessions/ceo/prompt-text`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: message })
  });
  if (textResponse.ok) {
    const submitResponse = await fetch(`${apiBase}/api/sessions/ceo/prompt-submit`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ repeat: 1 })
    });
    if (!submitResponse.ok) {
      throw new Error(`ceo prompt-submit failed: ${submitResponse.status} ${await submitResponse.text()}`);
    }
    return { method: "ceo-prompt-text+submit" };
  }
  const fallbackResponse = await fetch(`${apiBase}/api/sessions/ceo/write`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: message })
  });
  if (!fallbackResponse.ok) {
    throw new Error(`ceo write failed: ${fallbackResponse.status} ${await fallbackResponse.text()}`);
  }
  return { method: "ceo-write-fallback" };
}

function buildCaesarMessage(detection, submitResult) {
  return [
    `CAESAR_NEWLINE_ALERT agent=${detection.agentId} state=injected_command_without_submit enter_action=${submitResult.method} blocker=none`,
    `evidence=session=${detection.agentId};updated_at=${detection.updatedAt || "unknown"};flags=${detection.evidenceFlags.join(",") || "none"};prompt=${detection.promptSummary}`,
    `instruction=Keep watchdog running. On every repeat case, re-submit Enter immediately. System injections must use prompt-text then prompt-submit as one paired operation; do not concatenate raw command+newline.`
  ].join("\n");
}

async function tick() {
  const state = readJson(statePath, { sessions: {} });
  if (!state.sessions) state.sessions = {};
  const sessions = await getSessions();
  const now = Date.now();
  const seen = new Set();
  const detections = [];

  for (const session of sessions) {
    const detection = detectInjectedNoEnter(session);
    if (!detection) {
      delete state.sessions[session.id];
      continue;
    }

    seen.add(session.id);
    const previous = state.sessions[session.id];
    if (!previous || previous.fingerprint !== detection.fingerprint) {
      state.sessions[session.id] = {
        fingerprint: detection.fingerprint,
        firstSeenAt: now,
        lastSeenAt: now,
        lastAlertAt: 0,
        lastEnterAt: 0,
        promptSummary: detection.promptSummary,
        evidenceFlags: detection.evidenceFlags
      };
      appendEvent({
        type: "newline_issue_detected",
        agentId: detection.agentId,
        updatedAt: detection.updatedAt,
        promptSummary: detection.promptSummary,
        evidenceFlags: detection.evidenceFlags,
        tail: detection.tail
      });
      continue;
    }

    previous.lastSeenAt = now;
    const ageMs = now - previous.firstSeenAt;
    const alertDue = ageMs >= detectThresholdMs && (previous.lastAlertAt === 0 || now - previous.lastAlertAt >= repeatAlertMs);
    if (!alertDue) continue;

    let submitResult = { method: "not-run" };
    let submitError = null;
    let notifyResult = { method: detection.agentId === "ceo" ? "self-session-no-notify" : "not-run" };
    let notifyError = null;
    try {
      submitResult = await promptSubmit(session.id);
      previous.lastEnterAt = now;
    } catch (error) {
      submitError = error.message;
    }

    if (detection.agentId !== "ceo") {
      try {
        notifyResult = await notifyCaesar(buildCaesarMessage(detection, submitResult));
        previous.lastAlertAt = now;
      } catch (error) {
        notifyError = error.message;
      }
    } else {
      previous.lastAlertAt = now;
    }

    const event = {
      type: "newline_issue_escalated",
      agentId: detection.agentId,
      ageMs,
      promptSummary: detection.promptSummary,
      evidenceFlags: detection.evidenceFlags,
      enterAction: submitResult.method,
      enterError: submitError,
      notifyAction: notifyResult.method,
      notifyError,
      tail: detection.tail
    };
    detections.push(event);
    appendEvent(event);
  }

  for (const sessionId of Object.keys(state.sessions)) {
    if (!seen.has(sessionId) && !sessions.find((session) => session.id === sessionId)) {
      delete state.sessions[sessionId];
    }
  }

  const runtime = {
    at: new Date().toISOString(),
    ok: true,
    apiBaseRequested: requestedApiBase || null,
    apiBaseResolved: apiBase,
    apiBaseCandidates,
    intervalMs,
    detectThresholdMs,
    repeatAlertMs,
    endAtMs,
    activeSessionCount: sessions.length,
    trackedIssueCount: Object.keys(state.sessions).length,
    detections
  };
  state.updatedAt = runtime.at;
  state.lastRuntime = runtime;
  writeJson(statePath, state);
  writeJson(runtimePath, runtime);
  console.log(JSON.stringify(runtime, null, 2));
}

async function main() {
  await resolveApiBase();
  while (true) {
    if (endAtMs > 0 && Date.now() >= endAtMs) {
      appendEvent({ type: "monitor_stop", reason: "end_at_reached", endAtMs });
      break;
    }
    await tick();
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().catch((error) => {
  appendEvent({ type: "monitor_error", message: error.message, stack: error.stack });
  console.error(error.stack || String(error));
  process.exit(1);
});
