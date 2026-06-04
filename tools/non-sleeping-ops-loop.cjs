#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const eventsPath = path.join(dataDir, "agent-ops-events.jsonl");
const workLedgerPath = path.join(dataDir, "work-ledger.json");
const statePath = path.join(dataDir, "non-sleeping-ops-loop-state.json");
const snapshotDir = path.join(dataDir, "session-context-snapshots");
const logDir = path.join(dataDir, "system-logs", "non-sleeping-ops-loop-20260602");
const ledgerReferenceDisabledPath = path.join(dataDir, "ledger-reference-disabled.json");

const args = new Set(process.argv.slice(2));
const once = args.has("--once") || args.has("--simulate");
const dryRun = args.has("--dry-run") || args.has("--simulate");
const simulate = args.has("--simulate");
const intervalMs = Math.max(10, Number(process.env.OPS_LOOP_INTERVAL_SECONDS || 60)) * 1000;
const apiBase = process.env.LCC_API_BASE || process.env.LCC_SESSION_API || "http://127.0.0.1:9001";
const protectedAgents = new Set(["developer-7"]);
const staleMs = Number(process.env.OPS_LOOP_STALE_MINUTES || 5) * 60 * 1000;

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

function isLedgerReferenceDisabled() {
  if (process.env.LCC_LEDGER_REFERENCE_DISABLED === "1") return true;
  try {
    return JSON.parse(fs.readFileSync(ledgerReferenceDisabledPath, "utf8")).disabled === true;
  } catch {
    return false;
  }
}

if (isLedgerReferenceDisabled()) {
  appendEvent({
    type: "ledger_reference_disabled",
    source: "non-sleeping-ops-loop",
    action: "exit_without_ledger_reference"
  });
  console.log("Ledger reference disabled; non-sleeping ops loop exits.");
  process.exit(0);
}

function cleanText(value) {
  return String(value || "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\r/g, "\n")
    .trim();
}

async function getSessions() {
  if (simulate) {
    return [
      { id: "developer-1", status: "active", preview_text: "blocked on terminal QA", updated_at: new Date(Date.now() - 8 * 60000).toISOString() },
      { id: "developer-2", status: "active", preview_text: "Write tests for @filename", updated_at: new Date(Date.now() - 9 * 60000).toISOString() },
      { id: "developer-7", status: "active", preview_text: "Lucas Android direct only 가나다라", updated_at: new Date(Date.now() - 20 * 60000).toISOString() }
    ];
  }
  const res = await fetch(`${apiBase}/api/sessions`);
  if (!res.ok) throw new Error(`sessions failed ${res.status}`);
  return res.json();
}

async function getPid(port) {
  if (process.platform !== "win32") return null;
  const { execFileSync } = require("child_process");
  try {
    const out = execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess`
    ], { encoding: "utf8" }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function activeItems() {
  const ledger = readJson(workLedgerPath, { tasks: [] });
  const tasks = Array.isArray(ledger.tasks) ? ledger.tasks : [];
  if (simulate) {
    tasks.push({ id: "ownerless-p0-sim", status: "doing", priority: "P0", title: "가나다라 ownerless simulation" });
  }
  return tasks.filter((task) => !/done|complete|archived/i.test(String(task.status || "")));
}

function classifySession(session) {
  const text = cleanText(session.preview_text || session.preview || "");
  const updatedAt = Date.parse(session.updated_at || session.log?.updated_at || 0);
  const stale = updatedAt ? Date.now() - updatedAt > staleMs : true;
  const blocked = /blocked|blocker|failed|error|capacity|cannot|stuck/i.test(text);
  const idle = /Write tests for @filename|Summarize recent commits|Implement \{feature\}|Improve documentation/i.test(text);
  return {
    id: session.id,
    status: session.status,
    stale,
    blocked,
    idle,
    noHeartbeat: stale && session.status === "active",
    preview: text.slice(-800)
  };
}

function compactPrompt(issue) {
  return `[ops-loop] item=${issue.itemId} reason=${issue.reason}. Read data/agent-ops-events.jsonl latest details. Report: ACK/doing/evidence/blocker/eta.`;
}

function snapshotSession(session, issue) {
  fs.mkdirSync(snapshotDir, { recursive: true });
  const file = path.join(snapshotDir, `${session.id}-${Date.now()}.json`);
  writeJson(file, {
    at: new Date().toISOString(),
    agentId: session.id,
    taskId: issue.itemId,
    reason: issue.reason,
    status: session.status,
    preview: cleanText(session.preview_text || session.preview || "").slice(-4000),
    resumeCriteria: "resume after non-sleeping ops-loop dispatch/result event is resolved"
  });
  return path.relative(root, file).replace(/\\/g, "/");
}

async function dispatch(session, issue) {
  if (protectedAgents.has(session.id)) {
    appendEvent({ type: "ops_loop_protected_agent_skipped", agentId: session.id, itemId: issue.itemId, reason: issue.reason });
    return { skipped: true, protected: true };
  }
  const snapshot = snapshotSession(session, issue);
  appendEvent({
    type: "ops_loop_context_snapshot_saved",
    agentId: session.id,
    itemId: issue.itemId,
    reason: issue.reason,
    snapshot
  });
  const prompt = compactPrompt(issue);
  appendEvent({
    type: dryRun ? "ops_loop_dispatch_dry_run" : "ops_loop_dispatch_sent",
    agentId: session.id,
    itemId: issue.itemId,
    reason: issue.reason,
    terminalPreview: prompt,
    snapshot
  });
  if (dryRun) return { dryRun: true, snapshot };
  const textRes = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(session.id)}/prompt-text`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: prompt })
  });
  if (textRes.ok) {
    const submitRes = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(session.id)}/prompt-submit`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ repeat: 1 })
    });
    if (!submitRes.ok) throw new Error(`${session.id} prompt-submit failed ${submitRes.status}`);
    return { sent: true, snapshot };
  }
  if (textRes.status !== 404 && textRes.status !== 405) throw new Error(`${session.id} prompt-text failed ${textRes.status}`);
  const res = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(session.id)}/write`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data: prompt })
  });
  if (!res.ok) throw new Error(`${session.id} dispatch failed ${res.status}`);
  return { sent: true, snapshot };
}

function findIssues(sessions, items) {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const classifications = sessions.map(classifySession);
  const issues = [];
  for (const item of items) {
    const owner = item.owner || item.assignee || item.agentId;
    if (!owner) {
      issues.push({ itemId: item.id, title: item.title || item.id, reason: "ownerless-active-item", owner: "dev-lead" });
      continue;
    }
    const session = byId.get(owner);
    if (!session) issues.push({ itemId: item.id, reason: "no-heartbeat", owner });
  }
  for (const c of classifications) {
    if (protectedAgents.has(c.id)) {
      issues.push({ itemId: "protected-agent", reason: "dev7-exclusion-check", owner: c.id });
      continue;
    }
    if (c.blocked) issues.push({ itemId: "session-health", reason: "blocked", owner: c.id });
    else if (c.idle) issues.push({ itemId: "session-health", reason: "idle", owner: c.id });
    else if (c.noHeartbeat) issues.push({ itemId: "session-health", reason: "no-heartbeat", owner: c.id });
  }
  return issues;
}

async function tick() {
  const pid9001 = await getPid(9001);
  const sessions = await getSessions();
  const items = activeItems();
  const issues = findIssues(sessions, items);
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const dispatches = [];
  appendEvent({ type: "ops_loop_scan_started", dryRun, simulate, intervalSeconds: intervalMs / 1000, pid9001, activeItems: items.length, sessions: sessions.length });
  for (const issue of issues) {
    const target = sessionById.get(issue.owner) || sessionById.get("dev-lead") || sessions.find((s) => !protectedAgents.has(s.id));
    if (!target) {
      appendEvent({ type: "ops_loop_escalation_needed", issue, reason: "no-dispatch-target" });
      continue;
    }
    dispatches.push({ issue, result: await dispatch(target, issue) });
  }
  const afterPid9001 = await getPid(9001);
  const result = { ok: true, dryRun, simulate, pid9001, afterPid9001, protectedAgents: [...protectedAgents], issues, dispatches };
  appendEvent({ type: "ops_loop_scan_completed", ...result });
  writeJson(statePath, { at: new Date().toISOString(), ...result });
  if (simulate) writeJson(path.join(logDir, "dry-run.json"), result);
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
  appendEvent({ type: "ops_loop_error", message: error.message, stack: error.stack });
  console.error(error.stack || String(error));
  process.exit(1);
});
