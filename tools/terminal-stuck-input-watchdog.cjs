#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const apiBase = process.env.LCC_API_BASE || "http://127.0.0.1:9001";
const intervalMs = Math.max(500, Number(process.env.TERMINAL_STUCK_INPUT_INTERVAL_MS || 1000));
const thresholdMs = Math.max(1000, Number(process.env.TERMINAL_STUCK_INPUT_THRESHOLD_MS || 2000));
const once = process.argv.includes("--once");
const dryRun = process.argv.includes("--dry-run");
const dataDir = path.join(root, "data");
const statePath = path.join(dataDir, "terminal-stuck-input-watchdog-state.json");
const eventsPath = path.join(dataDir, "terminal-stuck-input-watchdog-events.jsonl");
const samplesPath = path.join(dataDir, "terminal-tail-samples.jsonl");
const protectedAgents = new Set(["ceo", "developer-7"]);
const promptTailLines = Math.max(6, Number(process.env.TERMINAL_STUCK_INPUT_TAIL_LINES || 12));
const sampleTailChars = Math.max(120, Number(process.env.TERMINAL_TAIL_SAMPLE_CHARS || 500));
const anomalyThresholdMs = Math.max(2000, Number(process.env.TERMINAL_TAIL_ANOMALY_THRESHOLD_MS || 5000));
const anomalyCooldownMs = Math.max(5000, Number(process.env.TERMINAL_TAIL_ANOMALY_COOLDOWN_MS || 30000));
const autoSubmitSentinel = "LCC_AUTO_SUBMIT_ON_STABLE_TAIL_V1";

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

function appendSample(sample) {
  fs.mkdirSync(path.dirname(samplesPath), { recursive: true });
  fs.appendFileSync(samplesPath, `${JSON.stringify({ at: new Date().toISOString(), ...sample })}\n`, "utf8");
}

function stripAnsi(value) {
  return String(value || "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\r/g, "\n");
}

function normalizeText(value) {
  return stripAnsi(value)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function unwrapSessions(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(data?.sessions)) return data.sessions;
  return [];
}

async function getSessions() {
  const response = await fetch(`${apiBase}/api/sessions`);
  if (!response.ok) throw new Error(`sessions failed: ${response.status} ${await response.text()}`);
  return unwrapSessions(await response.json());
}

async function getSession(sessionId) {
  const sessions = await getSessions();
  return sessions.find((session) => session.id === sessionId) || null;
}

function isIdleTemplate(text) {
  return /Write tests for @filename|Find and fix a bug in @filename|Summarize recent commits|Improve documentation|Explain this codebase|Implement \{feature\}|Use \/skills to list available skills|Run \/review on my current changes/i.test(
    text
  );
}

function isSystemInjectedPrompt(text) {
  return /\[(?:CAESAR|MAX|LUCAS|SYSTEM|OPS|LCC)(?:->[A-Z0-9_-]+)?\]|\[(?:CAESAR|MAX|LUCAS|SYSTEM|OPS|LCC)->ALL\]|\bENTERPRISE-LEDGER-REFERENCE-OFF\b|\bledger_reference\s*=\s*disabled\b|\bpermission_default\s*=\s*inspect\b|\bParallel development permission contract\b|\bLucas ordered\b|\bEffective immediately\b|\bReply ACK\b/i.test(
    text
  );
}

function hasTailSubmitDirective(text) {
  const tail = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join("\n");
  if (new RegExp(`\\b${autoSubmitSentinel}\\b`).test(tail)) return true;
  if (/\bReply\b|\bReply first\b|\bPOLICY_ACK\b|\bACK\b.*\bblocker\b|\bsubmit\b|prompt-submit|press\s+enter|\bEnter\b/i.test(tail)) {
    return true;
  }
  return /\bReply\b|\bReply first\b|\bPOLICY_ACK\b|\bACK\b.*\bblocker\b|\bsubmit\b|prompt-submit|press\s+enter|\bEnter\b|응답|회신|대답|제출|엔터/i.test(
    tail
  );
}

function isOperationalPrompt(text) {
  return /\[(OPS_WAKE|REPORT_REQUEST|REPORT|INFO)\]|\[LCC BOOT[^\]]*\]|\b(CEO_WAKE|CEO_ESCALATION|POLICY_ACK|DEV_CHANGE_CHECK|DEV_CHANGE_REPORT|ACK|DECISION|REPORT|HEARTBEAT|INFO)\b|item\s*=|item\s*\/|source_event_id\s*=|Task:/i.test(
    text
  );
}

function tailFromPreview(session) {
  const text = stripAnsi(session.preview_text || session.preview || "");
  const lines = text.split("\n");
  let promptIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^\s*(?:>|›|âº|\?\?)\s*/.test(lines[index])) {
      promptIndex = index;
      break;
    }
    if (/^\s*(?:[>›]|[?？]{2})\s*/.test(lines[index])) {
      promptIndex = index;
      break;
    }
  }

  const tail =
    promptIndex >= 0
      ? lines.slice(promptIndex, promptIndex + promptTailLines).join("\n")
      : lines.slice(-promptTailLines).join("\n");

  return {
    text,
    tail,
    normalized: normalizeText(tail),
    promptIndex,
    lineCount: lines.length
  };
}

function classifyPreview(session) {
  const tail = tailFromPreview(session);
  const working = /Working \(/i.test(tail.text);
  const idleTemplate = isIdleTemplate(tail.normalized);
  const systemInjectedPrompt = isSystemInjectedPrompt(tail.normalized);
  const tailSubmitDirective = hasTailSubmitDirective(tail.normalized);
  const autoSubmittableSystemPrompt = systemInjectedPrompt && tailSubmitDirective;
  const protectedAgent = protectedAgents.has(session.id) && !autoSubmittableSystemPrompt;
  const operationalPrompt = autoSubmittableSystemPrompt || (!systemInjectedPrompt && isOperationalPrompt(tail.normalized));
  let tailState = "ignored";

  if (session.status !== "active") tailState = "inactive";
  else if (protectedAgent) tailState = "protected";
  else if (working) tailState = "working";
  else if (!tail.normalized) tailState = "empty";
  else if (idleTemplate) tailState = "idle-template";
  else if (operationalPrompt) tailState = "candidate";
  else tailState = "non-operational";

  return {
    ...tail,
    working,
    protectedAgent,
    idleTemplate,
    systemInjectedPrompt,
    tailSubmitDirective,
    operationalPrompt,
    tailState,
    fingerprint: tail.normalized ? hash(tail.normalized) : null
  };
}

function runSelfTest() {
  const systemPrompt = `[CAESAR->ALL][ENTERPRISE-LEDGER-REFERENCE-OFF]
Lucas ordered enterprise-wide ledger reference OFF until the current issue is fixed.
Reply ACK ledger_reference=disabled permission_default=inspect blocker=none.`;
  const classified = classifyPreview({
    id: "ceo",
    status: "active",
    preview_text: `› ${systemPrompt}`
  });
  if (classified.tailState !== "candidate") {
    throw new Error(`system injected prompt should be candidate, got ${classified.tailState}`);
  }
  if (!classified.systemInjectedPrompt) {
    throw new Error("system injected prompt marker was not detected");
  }
  if (!classified.tailSubmitDirective) {
    throw new Error("tail submit directive was not detected");
  }
  const noSubmitDirective = classifyPreview({
    id: "ceo",
    status: "active",
    preview_text: "› [CAESAR->ALL][INFO]\nThis is a system notice only."
  });
  if (noSubmitDirective.tailState === "candidate") {
    throw new Error("system notice without tail submit directive should not auto-submit");
  }
  const sentinelPrompt = classifyPreview({
    id: "ceo",
    status: "active",
    preview_text: `âº [SYSTEM->ALL][INFO]\nSystem notice.\n${autoSubmitSentinel}`
  });
  if (sentinelPrompt.tailState !== "candidate") {
    throw new Error(`sentinel prompt should be candidate, got ${sentinelPrompt.tailState}`);
  }
  const idle = classifyPreview({
    id: "developer-1",
    status: "active",
    preview_text: "› Implement {feature}"
  });
  if (idle.tailState !== "idle-template") {
    throw new Error(`idle template should remain idle-template, got ${idle.tailState}`);
  }
  console.log("terminal-stuck-input-watchdog self-test passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

function candidateFromPreview(session) {
  const classified = classifyPreview(session);
  if (classified.tailState !== "candidate") return null;

  const normalized = classified.normalized;

  return {
    fingerprint: classified.fingerprint,
    preview: normalized.slice(0, 1200)
  };
}

async function submitEnter(sessionId) {
  const before = await getSession(sessionId);
  const beforeCandidate = before ? candidateFromPreview(before) : null;
  const splitResponse = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/prompt-submit`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ repeat: 1 })
  });
  if (splitResponse.ok) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const after = await getSession(sessionId);
    const afterCandidate = after ? candidateFromPreview(after) : null;
    if (!beforeCandidate || !afterCandidate || afterCandidate.fingerprint !== beforeCandidate.fingerprint) {
      return { method: "prompt-submit" };
    }

    const enterFallbackResponse = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/write`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ data: "" })
    });
    if (!enterFallbackResponse.ok) {
      throw new Error(`${sessionId} write-empty fallback failed: ${enterFallbackResponse.status} ${await enterFallbackResponse.text()}`);
    }
    return { method: "prompt-submit+write-empty-fallback" };
  }
  if (splitResponse.status !== 404 && splitResponse.status !== 405) {
    throw new Error(`${sessionId} prompt-submit failed: ${splitResponse.status} ${await splitResponse.text()}`);
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
  const response = await fetch(`${apiBase}/api/sessions/ceo/write`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ prompt: message })
  });
  if (!response.ok) {
    throw new Error(`ceo notify failed: ${response.status} ${await response.text()}`);
  }
  return { method: "ceo-write" };
}

async function tick() {
  const state = readJson(statePath, { sessions: {}, anomalies: {} });
  if (!state.sessions) state.sessions = {};
  if (!state.anomalies) state.anomalies = {};
  const now = Date.now();
  const sessions = await getSessions();
  const seen = new Set();
  const actions = [];
  const alerts = [];

  for (const session of sessions) {
    seen.add(session.id);
    const classified = classifyPreview(session);
    const previous = state.sessions[session.id];
    const previousAnomaly = state.anomalies[session.id];
    const candidateAgeMs =
      previous && previous.fingerprint === classified.fingerprint ? now - previous.firstSeenAt : 0;
    const anomalyAgeMs =
      previousAnomaly && previousAnomaly.fingerprint === classified.fingerprint ? now - previousAnomaly.firstSeenAt : 0;

    appendSample({
      agentId: session.id,
      status: session.status,
      tailState: classified.tailState,
      fingerprint: classified.fingerprint,
      candidateAgeMs,
      anomalyAgeMs,
      thresholdMs,
      intervalMs,
      anomalyThresholdMs,
      promptTailLines,
      promptIndex: classified.promptIndex,
      lineCount: classified.lineCount,
      normalizedBytes: Buffer.byteLength(classified.normalized || "", "utf8"),
      tail: (classified.normalized || "").slice(0, sampleTailChars)
    });

    const candidate = candidateFromPreview(session);
    if (!candidate) {
      delete state.sessions[session.id];
      const shouldTrackAnomaly =
        session.status === "active" &&
        !classified.protectedAgent &&
        !classified.working &&
        classified.tailState !== "idle-template" &&
        classified.tailState !== "empty" &&
        Boolean(classified.normalized);

      if (!shouldTrackAnomaly) {
        delete state.anomalies[session.id];
        continue;
      }

      if (!previousAnomaly || previousAnomaly.fingerprint !== classified.fingerprint) {
        state.anomalies[session.id] = {
          fingerprint: classified.fingerprint,
          firstSeenAt: now,
          lastSeenAt: now,
          lastAlertAt: null,
          tailState: classified.tailState,
          preview: classified.normalized.slice(0, 1200)
        };
        continue;
      }

      previousAnomaly.lastSeenAt = now;
      previousAnomaly.tailState = classified.tailState;
      previousAnomaly.preview = classified.normalized.slice(0, 1200);
      const alertDue =
        anomalyAgeMs >= anomalyThresholdMs &&
        (!previousAnomaly.lastAlertAt || now - previousAnomaly.lastAlertAt >= anomalyCooldownMs);
      if (alertDue) {
        const alert = {
          type: "terminal_tail_anomaly_alert",
          agentId: session.id,
          tailState: classified.tailState,
          ageMs: anomalyAgeMs,
          fingerprint: classified.fingerprint,
          preview: previousAnomaly.preview
        };
        appendEvent(alert);
        try {
          Object.assign(
            alert,
            await notifyCaesar(
              `[WATCHDOG_ALERT] terminal tail anomaly agent=${session.id} state=${classified.tailState} ageMs=${anomalyAgeMs} fingerprint=${classified.fingerprint} evidence=data/terminal-tail-samples.jsonl next=Caesar review pattern/submit handling or assign owner.`
            )
          );
        } catch (error) {
          alert.notifyError = error.message;
          appendEvent({ type: "terminal_tail_anomaly_notify_failed", ...alert });
        }
        previousAnomaly.lastAlertAt = now;
        alerts.push(alert);
      }
      continue;
    }

    delete state.anomalies[session.id];
    if (!previous || previous.fingerprint !== candidate.fingerprint) {
      state.sessions[session.id] = {
        fingerprint: candidate.fingerprint,
        firstSeenAt: now,
        lastSeenAt: now,
        submittedAt: null,
        preview: candidate.preview
      };
      appendEvent({
        type: "stuck_input_candidate_seen",
        agentId: session.id,
        thresholdMs,
        fingerprint: candidate.fingerprint,
        preview: candidate.preview
      });
      continue;
    }

    previous.lastSeenAt = now;
    const ageMs = now - previous.firstSeenAt;
    if (!previous.submittedAt && ageMs >= thresholdMs) {
      const action = { agentId: session.id, ageMs, fingerprint: previous.fingerprint, preview: previous.preview };
      if (dryRun) {
        action.method = "dry-run";
      } else {
        Object.assign(action, await submitEnter(session.id));
      }
      previous.submittedAt = now;
      actions.push(action);
      appendEvent({ type: "stuck_input_enter_submitted", ...action });
    }
  }

  for (const id of Object.keys(state.sessions)) {
    if (!seen.has(id)) delete state.sessions[id];
  }

  const result = {
    at: new Date().toISOString(),
    ok: true,
    apiBase,
    thresholdMs,
    intervalMs,
    anomalyThresholdMs,
    sessionCount: sessions.length,
    actions,
    alerts
  };
  state.updatedAt = result.at;
  state.lastResult = result;
  writeJson(statePath, state);
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  do {
    await tick();
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (true);
}

main().catch((error) => {
  appendEvent({ type: "stuck_input_watchdog_error", message: error.message, stack: error.stack });
  console.error(error.stack || String(error));
  process.exit(1);
});
