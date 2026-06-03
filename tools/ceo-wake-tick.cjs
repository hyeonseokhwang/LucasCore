const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const apiBase = process.env.LCC_API_BASE || "http://127.0.0.1:9001";
const wakeCooldownMinutes = Number(process.env.CEO_WAKE_COOLDOWN_MINUTES || 10);
const staleOwnerMinutes = Number(process.env.CEO_STALE_OWNER_MINUTES || 12);
const statePath = path.join(root, "data", "ceo-wake-state.json");
const latestPath = path.join(root, "data", "ceo-wake-latest.json");
const eventsPath = path.join(root, "data", "ceo-wake-events.jsonl");
const workLedgerPath = path.join(root, "data", "work-ledger.json");
const pauseContextPath = path.join(root, "data", "ops-loop-pause-context.json");
const protectedAgentIds = new Set(["developer-7"]);

const fallbackOwners = {
  "terminal-input-text-loss-20260602": "developer-1",
  "terminal-buffer-instant-render-20260602": "developer-1",
  "hkl-auth-manual-handover-20260602": "hkl-handover-tf-1",
  "ops-progress-space-20260602": "ops-recorder",
  "decision-blocker-portal-20260602": "ops-recorder",
  "ceo-9100-board-cleanup-20260602": "ux-designer",
  "caesar-hourly-reporting": "ops-recorder",
  "ceo-support-qa-audit-ops-20260602": "developer-3",
};

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

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function minutesSince(value, now) {
  const ms = Date.parse(value || "");
  if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
  return (now - ms) / 60000;
}

function latestSessionActivityAt(session) {
  const updatedAt = Date.parse(session?.updated_at || "");
  const logUpdatedAt = Date.parse(session?.log?.updated_at || "");
  const latest = Math.max(
    Number.isFinite(updatedAt) ? updatedAt : 0,
    Number.isFinite(logUpdatedAt) ? logUpdatedAt : 0
  );
  return latest > 0 ? new Date(latest).toISOString() : null;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`);
  return response.json();
}

async function getSessions() {
  const data = await getJson(`${apiBase}/api/sessions`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.value)) return data.value;
  return [];
}

function localWorkTasks() {
  const ledger = readJson(workLedgerPath, { tasks: [] });
  const tasks = Array.isArray(ledger.tasks) ? ledger.tasks : [];
  return tasks.filter((task) => !/done|complete|completed|archived/i.test(String(task.status || "")));
}

async function workTasks() {
  try {
    const data = await getJson(`${apiBase}/api/work-ledger`);
    const tasks = Array.isArray(data) ? data : Array.isArray(data.tasks) ? data.tasks : [];
    if (tasks.length > 0) return tasks.filter((task) => !/done|complete|completed|archived/i.test(String(task.status || "")));
  } catch {
    // The local file is authoritative fallback while the API contract is being hardened.
  }
  return localWorkTasks();
}

function taskPriority(task) {
  const raw = Number(task.priority ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function ownerOf(task) {
  const explicit = String(task.owner || "").trim();
  if (explicit) return explicit;
  return fallbackOwners[task.id] || null;
}

function sessionById(sessions) {
  return new Map(sessions.map((session) => [session.id, session]));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function readPauseContext() {
  const raw = readJson(pauseContextPath, { handoffs: [] });
  return {
    updatedAt: raw.updatedAt || null,
    handoffs: normalizeArray(raw.handoffs).map((entry) => ({
      taskId: String(entry.taskId || "").trim(),
      previousOwner: String(entry.previousOwner || entry.owner || "").trim(),
      state: String(entry.state || "").trim(),
      changedFiles: normalizeArray(entry.changedFiles),
      evidence: normalizeArray(entry.evidence),
      blocker: String(entry.blocker || "").trim(),
      next: String(entry.next || "").trim(),
      resumeCriteria: String(entry.resumeCriteria || "").trim(),
      sessionStopped: Boolean(entry.sessionStopped),
      pausedAt: String(entry.pausedAt || entry.at || "").trim(),
    })),
  };
}

function hasPauseWithContext(entry, staleOwner) {
  return Boolean(
    entry &&
    entry.taskId === staleOwner.taskId &&
    entry.previousOwner === staleOwner.owner &&
    entry.state &&
    entry.evidence.length > 0 &&
    entry.blocker &&
    entry.next &&
    entry.resumeCriteria
  );
}

function summarizePause(entry) {
  return {
    taskId: entry.taskId,
    previousOwner: entry.previousOwner,
    state: entry.state || "handoff",
    blocker: entry.blocker || "none",
    next: entry.next || null,
    resumeCriteria: entry.resumeCriteria || null,
    pausedAt: entry.pausedAt || null,
    evidenceCount: entry.evidence.length,
    changedFileCount: entry.changedFiles.length,
    sessionStopped: Boolean(entry.sessionStopped),
  };
}

function detectRisks(tasks, sessions, now) {
  const byId = sessionById(sessions);
  const staleOwners = [];
  const pauseContext = readPauseContext();
  for (const task of tasks) {
    const owner = ownerOf(task);
    if (!owner || protectedAgentIds.has(owner)) continue;
    const session = byId.get(owner);
    if (!session) {
      staleOwners.push({ taskId: task.id, owner, reason: "owner-session-missing" });
      continue;
    }
    const age = minutesSince(latestSessionActivityAt(session), now);
    if (age >= staleOwnerMinutes) {
      staleOwners.push({
        taskId: task.id,
        owner,
        reason: "owner-stale",
        ageMinutes: Number(age.toFixed(1)),
      });
    }
  }

  const activeP0 = tasks
    .filter((task) => taskPriority(task) >= 120 || /p0|terminal|ceo|ops|stabil/i.test(`${task.id} ${task.title || ""}`))
    .sort((a, b) => taskPriority(b) - taskPriority(a))
    .slice(0, 8)
    .map((task) => ({
      id: task.id,
      status: task.status || "todo",
      owner: ownerOf(task),
      priority: taskPriority(task),
      title: task.title || task.id,
    }));

  const unresolvedStaleOwners = [];
  const pausedWithContext = [];
  for (const staleOwner of staleOwners) {
    const handoff = pauseContext.handoffs.find((entry) => hasPauseWithContext(entry, staleOwner));
    if (handoff) pausedWithContext.push(summarizePause(handoff));
    else unresolvedStaleOwners.push(staleOwner);
  }

  return {
    activeP0,
    staleOwners: unresolvedStaleOwners,
    pausedWithContext,
    pauseContextUpdatedAt: pauseContext.updatedAt,
  };
}

async function writeSession(sessionId, text) {
  const textResponse = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/prompt-text`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: text }),
  });
  if (textResponse.ok) {
    const submitResponse = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/prompt-submit`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ repeat: 1 }),
    });
    if (!submitResponse.ok) throw new Error(`${sessionId} prompt-submit failed: ${submitResponse.status} ${await submitResponse.text()}`);
    return;
  }
  if (textResponse.status !== 404 && textResponse.status !== 405) {
    throw new Error(`${sessionId} prompt-text failed: ${textResponse.status} ${await textResponse.text()}`);
  }
  const response = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/write`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: text }),
  });
  if (!response.ok) throw new Error(`${sessionId} write failed: ${response.status} ${await response.text()}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const submitResponse = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/write`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: "" }),
  });
  if (!submitResponse.ok) throw new Error(`${sessionId} fallback submit failed: ${submitResponse.status} ${await submitResponse.text()}`);
}

function compactListCount(items) {
  return Array.isArray(items) ? items.length : 0;
}

function shouldSend(state, key, now, urgent) {
  if (urgent && key.endsWith("EscalationAt")) {
    const last = state[key] || 0;
    return (now - last) / 60000 >= Math.min(wakeCooldownMinutes, 3);
  }
  const last = state[key] || 0;
  return (now - last) / 60000 >= wakeCooldownMinutes;
}

function stableFingerprint(snapshot) {
  return JSON.stringify({
    status: snapshot.status,
    activeTaskCount: snapshot.activeTaskCount,
    activeP0: snapshot.activeP0.map((task) => ({
      id: task.id,
      status: task.status,
      owner: task.owner,
      priority: task.priority,
    })),
    staleOwners: snapshot.staleOwners.map((item) => ({
      taskId: item.taskId,
      owner: item.owner,
      reason: item.reason,
    })),
    pausedWithContext: snapshot.pausedWithContext.map((item) => ({
      taskId: item.taskId,
      previousOwner: item.previousOwner,
      state: item.state,
    })),
  });
}

async function main() {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const state = readJson(statePath, {});
  const sessions = await getSessions();
  const tasks = await workTasks();
  const risks = detectRisks(tasks, sessions, now);
  const urgent = risks.staleOwners.length > 0;
  const snapshot = {
    at,
    kind: "ceo_wake_tick",
    apiBase,
    sessionCount: sessions.length,
    activeTaskCount: tasks.length,
    activeP0: risks.activeP0,
    staleOwners: risks.staleOwners,
    pausedWithContext: risks.pausedWithContext,
    pauseContextUpdatedAt: risks.pauseContextUpdatedAt,
    protected: ["developer-7"],
    status: urgent ? "attention" : "ok",
    next: urgent
      ? "Max must wake/reassign stale owner with pause-with-context, then QA/Audit verify."
      : risks.pausedWithContext.length > 0
        ? "Pause-with-context recorded; QA/Audit should verify handoff completeness before further reassignment."
        : "Continue patrol/dispatcher loop and terminal stabilization follow-up.",
  };

  const fingerprint = stableFingerprint(snapshot);
  const changed = fingerprint !== state.lastFingerprint;
  snapshot.changed = changed;

  appendJsonl(eventsPath, snapshot);
  writeJson(latestPath, snapshot);

  if (changed || shouldSend(state, "lastCeoWakeAt", now, urgent)) {
    await writeSession(
      "ceo",
      [
        `CEO_WAKE status=${snapshot.status} changed=${changed} active_tasks=${tasks.length}`,
        `p0_count=${compactListCount(risks.activeP0)} stale_count=${compactListCount(risks.staleOwners)} paused_count=${compactListCount(risks.pausedWithContext)}`,
        `next=${snapshot.next}`,
        "evidence=data/ceo-wake-latest.json"
      ].join("\n")
    );
    state.lastCeoWakeAt = now;
  }

  if (risks.staleOwners.length > 0 && shouldSend(state, "lastMaxEscalationAt", now, true)) {
    const staleSummary = risks.staleOwners
      .slice(0, 3)
      .map((item) => `${item.owner}/${item.taskId}/${item.reason}`)
      .join("; ");
    await writeSession(
      "dev-lead",
      [
        "CEO_ESCALATION owner-stale",
        `stale_count=${risks.staleOwners.length} sample=${staleSummary}`,
        "next=wake-or-reassign-with-pause-context",
        "evidence=data/ceo-wake-latest.json; preserve=9001,developer-7"
      ].join("\n")
    );
    state.lastMaxEscalationAt = now;
  }

  state.lastFingerprint = fingerprint;
  state.updatedAt = at;
  writeJson(statePath, state);
  console.log(JSON.stringify(snapshot, null, 2));
}

main().catch((error) => {
  const event = {
    at: new Date().toISOString(),
    kind: "ceo_wake_tick",
    status: "error",
    error: error.message || String(error),
  };
  appendJsonl(eventsPath, event);
  writeJson(latestPath, event);
  console.error(JSON.stringify(event, null, 2));
  process.exitCode = 1;
});
