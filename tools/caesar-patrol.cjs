const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const apiBase = process.env.LCC_API_BASE || "http://127.0.0.1:9001";
const ledgerPath = path.join(root, "data", "ceo-command-ledger.json");
const idleLedgerPath = path.join(root, "data", "agent-idle-ledger.json");
const opsEventLogPath = path.join(root, "data", "agent-ops-events.jsonl");
const patrolLogPath = path.join(root, "data", "caesar-patrol-events.jsonl");
const patrolLatestPath = path.join(root, "data", "caesar-patrol-latest.json");
const ledgerReferenceDisabledPath = path.join(root, "data", "ledger-reference-disabled.json");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return { ...fallback, __error: error.message };
  }
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
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
  const event = {
    at: new Date().toISOString(),
    kind: "caesar_patrol_disabled",
    reason: "ledger-reference-disabled",
    status: "disabled",
    next: "Do not inspect ledger files until Lucas restores ledger reference."
  };
  appendJsonl(patrolLogPath, event);
  writeJson(patrolLatestPath, event);
  console.log("Ledger reference disabled; Caesar patrol exits without ledger inspection.");
  process.exit(0);
}

function tailLines(file, count) {
  try {
    const text = fs.readFileSync(file, "utf8");
    return text.trim().split(/\r?\n/).slice(-count);
  } catch {
    return [];
  }
}

async function getSessions() {
  const response = await fetch(`${apiBase}/api/sessions`);
  if (!response.ok) throw new Error(`GET /api/sessions failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function summarizeSessions(sessions) {
  const watched = sessions.filter((session) => ["development", "android-qa", "executive"].includes(session.team));
  const exited = watched.filter((session) => session.status !== "active");
  const byTeam = {};
  for (const session of watched) {
    byTeam[session.team] ||= { total: 0, active: 0, nonActive: 0 };
    byTeam[session.team].total += 1;
    if (session.status === "active") byTeam[session.team].active += 1;
    else byTeam[session.team].nonActive += 1;
  }
  return {
    byTeam,
    exited: exited.map((session) => ({
      id: session.id,
      name: session.name,
      team: session.team,
      status: session.status,
      model: session.model || null,
    })),
  };
}

function summarizeIdleLedger() {
  const ledger = readJson(idleLedgerPath, { agents: {} });
  const agents = ledger.agents || {};
  const idleLike = Object.entries(agents)
    .map(([id, value]) => ({
      id,
      state: value.currentState || "unknown",
      taskId: value.currentTaskId || null,
      idleMinutes: Number(((value.totalIdleMs || 0) / 60000).toFixed(1)),
      waitingMinutes: Number(((value.totalWaitingMs || 0) / 60000).toFixed(1)),
      blockedMinutes: Number(((value.totalBlockedMs || 0) / 60000).toFixed(1)),
      dispatchCount: value.dispatchCount || 0,
      lastDispatchAgeMinutes: value.lastDispatchAgeMinutes ?? null,
    }))
    .filter((agent) => ["idle", "waiting", "blocked", "stale"].includes(agent.state))
    .sort((a, b) => (b.idleMinutes + b.blockedMinutes + b.waitingMinutes) - (a.idleMinutes + a.blockedMinutes + a.waitingMinutes));
  return { error: ledger.__error || null, idleLike };
}

function summarizeLedger() {
  const ledger = readJson(ledgerPath, { directives: [] });
  if (ledger.__error) {
    return {
      parseOk: false,
      error: ledger.__error,
      activeCount: null,
      progress100NotDone: [],
    };
  }
  const directives = Array.isArray(ledger.directives) ? ledger.directives : [];
  const isDone = (item) => /done|complete|completed|archived|\uC644\uB8CC/i.test(String(item.status || ""));
  return {
    parseOk: true,
    error: null,
    activeCount: directives.filter((item) => !isDone(item)).length,
    progress100NotDone: directives
      .filter((item) => Number(item.progress || 0) >= 100 && !isDone(item))
      .map((item) => ({
        id: item.id,
        title: item.title || item.id,
        status: item.status || null,
        progress: Number(item.progress || 0),
        owner: item.owner || null,
      })),
  };
}

function summarizeTerminalAnomalies() {
  const events = [];
  for (const line of tailLines(opsEventLogPath, 400)) {
    try {
      const event = JSON.parse(line);
      if (["terminal_input_anomaly_detected", "prompt_redirected_to_ledger_for_terminal_safety"].includes(event.type)) {
        events.push(event);
      }
    } catch {
      // ignore malformed runtime log lines
    }
  }
  return {
    recentInputAnomalies: events
      .filter((event) => event.type === "terminal_input_anomaly_detected")
      .slice(-10)
      .map((event) => ({
        at: event.at,
        agentId: event.agentId,
        taskId: event.taskId,
        anomalies: event.anomalies || [],
        longestLine: event.longestLine || null,
      })),
    recentSafeRedirects: events
      .filter((event) => event.type === "prompt_redirected_to_ledger_for_terminal_safety")
      .slice(-10)
      .map((event) => ({
        at: event.at,
        agentId: event.agentId,
        dispatchId: event.dispatchId,
        terminalBytes: event.terminalBytes,
      })),
  };
}

async function main() {
  const at = new Date().toISOString();
  const sessions = await getSessions();
  const report = {
    at,
    kind: "caesar_patrol",
    apiBase,
    sessions: summarizeSessions(sessions),
    idle: summarizeIdleLedger(),
    ledger: summarizeLedger(),
    terminal: summarizeTerminalAnomalies(),
  };

  const blockers = [];
  if (report.sessions.exited.length > 0) blockers.push(`nonActiveSessions=${report.sessions.exited.map((s) => s.id).join(",")}`);
  if (!report.ledger.parseOk) blockers.push("ledgerJsonParseError");
  if (report.ledger.progress100NotDone.length > 0) blockers.push(`progress100NotDone=${report.ledger.progress100NotDone.map((item) => item.id).join(",")}`);
  if (report.idle.idleLike.length >= 2) blockers.push(`idleLikeAgents=${report.idle.idleLike.length}`);
  if (report.terminal.recentInputAnomalies.length > 0) blockers.push(`recentTerminalAnomalies=${report.terminal.recentInputAnomalies.length}`);

  report.status = blockers.length ? "needs_attention" : "ok";
  report.blockers = blockers;

  appendJsonl(patrolLogPath, report);
  writeJson(patrolLatestPath, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const event = {
    at: new Date().toISOString(),
    kind: "caesar_patrol",
    status: "error",
    error: error.message || String(error),
  };
  appendJsonl(patrolLogPath, event);
  writeJson(patrolLatestPath, event);
  console.error(JSON.stringify(event, null, 2));
  process.exitCode = 1;
});
