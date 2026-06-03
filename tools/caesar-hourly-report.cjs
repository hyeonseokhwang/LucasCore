const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const apiBase = process.env.LCC_API_BASE || "http://127.0.0.1:9001";
const canvasId = process.env.CAESAR_REPORT_CANVAS_ID || "caesar-hourly-reports";
const taskId = process.env.CAESAR_REPORT_TASK_ID || "caesar-hourly-reporting";
const patrolLatestPath = path.join(root, "data", "caesar-patrol-latest.json");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function api(pathname, options = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function activeTasks(ledger) {
  return (ledger.tasks || [])
    .filter((task) => !/done|completed|archived/i.test(String(task.status || "")))
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .slice(0, 8);
}

function summarizeSessions(sessions) {
  const byTeam = {};
  for (const session of sessions) {
    byTeam[session.team || "unknown"] ||= { total: 0, active: 0 };
    byTeam[session.team || "unknown"].total += 1;
    if (session.status === "active") byTeam[session.team || "unknown"].active += 1;
  }
  return byTeam;
}

function section(id, title, body) {
  return { id, title, body };
}

function formatTask(task) {
  return `- ${task.id}: ${task.status}, priority=${task.priority ?? "-"}${task.notes ? `\n  ${task.notes}` : ""}`;
}

function formatTeamSummary(byTeam) {
  return Object.entries(byTeam)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([team, value]) => `- ${team}: ${value.active}/${value.total} active`)
    .join("\n");
}

async function ensureTask() {
  await api(`/api/work-ledger/tasks/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    body: JSON.stringify({
      title: "Caesar hourly executive reports",
      status: "doing",
      priority: 150,
      reminder_minutes: 60,
      notes: `Hourly Caesar report space. Canvas: ${canvasId}. Reports summarize active ledgers, staffing, blockers, evidence, and next-hour actions.`
    })
  });
}

async function ensureCanvas() {
  const canvases = await api("/api/canvases");
  const existing = canvases.find((canvas) => canvas.id === canvasId);
  if (existing) return existing;
  return api("/api/canvases", {
    method: "POST",
    body: JSON.stringify({
      id: canvasId,
      title: "Caesar Hourly Reports",
      owner: "Caesar",
      canvas_type: "executive-report",
      members: ["ceo", "dev-lead"],
      linked_issues: [taskId, "portable-release-20260603", "hkl-auth-manual-handover-20260602"],
      content: [
        section("status", "Current Status", ""),
        section("active-ledgers", "Active Ledgers", ""),
        section("staffing", "Staffing", ""),
        section("blockers", "Blockers", ""),
        section("next-hour", "Next Hour", ""),
        section("evidence", "Evidence", "")
      ]
    })
  });
}

async function main() {
  const [ledger, sessions] = await Promise.all([
    api("/api/work-ledger"),
    api("/api/sessions")
  ]);
  const patrol = readJson(patrolLatestPath, null);
  await ensureTask();
  await ensureCanvas();

  const tasks = activeTasks(ledger);
  const byTeam = summarizeSessions(sessions);
  const blockers = [
    ...(patrol?.blockers || []),
    ...tasks.filter((task) => String(task.status).toLowerCase() === "blocked").map((task) => `blockedTask=${task.id}`)
  ];
  const hklTf = sessions.filter((session) => session.team === "hkl-handover-tf");
  const dev7 = sessions.find((session) => session.id === "developer-7");
  const now = new Date().toISOString();
  const content = [
    section(
      "status",
      "Current Status",
      `Report at ${now}\n\nOperating mode: ledger-first continuous operation.\n9001 preserved. developer-7 protected for Lucas direct work.\nPatrol status: ${patrol?.status || "unknown"}`
    ),
    section("active-ledgers", "Active Ledgers", tasks.map(formatTask).join("\n\n") || "No active ledger tasks."),
    section(
      "staffing",
      "Staffing",
      `${formatTeamSummary(byTeam)}\n\nHKL handover TF: ${hklTf.filter((session) => session.status === "active").length}/${hklTf.length} active\nDeveloper 7: ${dev7?.status || "missing"} (${dev7?.updated_at || "no timestamp"})`
    ),
    section("blockers", "Blockers", blockers.length ? blockers.map((item) => `- ${item}`).join("\n") : "No blockers reported by latest patrol."),
    section(
      "next-hour",
      "Next Hour",
      [
        "- Collect Max visible REPORT for ledger operations.",
        "- Collect HKL handover TF artifacts and merge into manual package.",
        "- Continue portable-release gates: memory, restart context, second-PC readiness, terminal UX evidence.",
        "- Keep developer-7 excluded from automated dispatch."
      ].join("\n")
    ),
    section(
      "evidence",
      "Evidence",
      [
        "- data/caesar-patrol-latest.json",
        "- data/agent-ops-events.jsonl",
        "- data/system-logs/agent-work-dispatcher-loop.log",
        "- data/system-logs/terminal-tab-isolation-20260602/report.json"
      ].join("\n")
    )
  ];

  await api(`/api/canvases/${encodeURIComponent(canvasId)}/content`, {
    method: "PUT",
    body: JSON.stringify(content)
  });

  const message = [
    `REPORT caesar-hourly at=${now}`,
    `state=${blockers.length ? "needs_attention" : "doing"}`,
    `active_ledgers=${tasks.map((task) => task.id).join(",") || "none"}`,
    `staffing=hkl_tf:${hklTf.filter((session) => session.status === "active").length}/${hklTf.length},dev7:${dev7?.status || "missing"}`,
    `blockers=${blockers.length ? blockers.join(";") : "none"}`,
    "next=collect Max/HKL TF reports and continue portable-release gates"
  ].join(" ");

  await api(`/api/canvases/${encodeURIComponent(canvasId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ author: "Caesar", body: message })
  });
  await api(`/api/work-ledger/tasks/${encodeURIComponent(taskId)}/events`, {
    method: "POST",
    body: JSON.stringify({ kind: "reported", body: `${message} canvas=${canvasId}` })
  });
  console.log(JSON.stringify({ ok: true, canvasId, taskId, message }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
