const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ledgerPath = path.join(root, "data", "ceo-command-ledger.json");
const port = Number(process.env.CEO_LEDGER_PORT || 9100);

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("done")) return "done";
  if (normalized.includes("active")) return "active";
  if (normalized.includes("planned")) return "planned";
  return "neutral";
}

async function fetchAgents() {
  const response = await fetch("http://127.0.0.1:9001/api/sessions");
  if (!response.ok) throw new Error(`9001 sessions failed: ${response.status}`);
  const sessions = await response.json();
  if (!Array.isArray(sessions)) return [];
  const wanted = new Set([
    "ceo",
    "dev-lead",
    "developer-1",
    "developer-2",
    "developer-3",
    "developer-4",
    "developer-5",
    "developer-6",
    "developer-7",
    "developer-8",
  ]);
  return sessions
    .filter((session) => wanted.has(session.id))
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "en"));
}

function cleanPreview(value) {
  return String(value || "")
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(" / ");
}

function cleanPreviewLines(value) {
  return String(value || "")
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeStructuredField(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (/^none$/i.test(normalized)) return "";
  if (/^<.+>$/.test(normalized)) return "";
  return normalized;
}

function extractStructuredStatus(value) {
  const lines = cleanPreviewLines(value);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!/^(HEARTBEAT|REPORT|ACK)\b/i.test(line)) continue;
    const combined = lines.slice(index, Math.min(lines.length, index + 5)).join(" ");
    const readField = (...names) => {
      for (const name of names) {
        const raw = combined.match(new RegExp(`\\b${name}=([^\\n]*?)(?=\\s+\\w+=|$)`, "i"))?.[1];
        const normalized = normalizeStructuredField(raw);
        if (normalized) return normalized;
      }
      return "";
    };
    return {
      line: combined,
      hasHeartbeat: /HEARTBEAT\s/i.test(combined),
      task: readField("item", "task"),
      status: readField("state", "status"),
      progress: readField("doing_now", "progress"),
      blocker: readField("blocker"),
      nextAction: readField("next", "next_action"),
    };
  }
  return { line: "", hasHeartbeat: false, task: "", status: "", progress: "", blocker: "", nextAction: "" };
}

function minutesSince(value) {
  const ms = Date.parse(value || "");
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.round((Date.now() - ms) / 60000));
}

function classifyAgent(session) {
  const preview = session.preview_text || session.preview || "";
  const structured = extractStructuredStatus(preview);
  const previewSummary = cleanPreview(preview) || "no preview";
  const ageMinutes = minutesSince(session.updated_at);
  const isBlocked = Boolean(structured.blocker) || /\bblocked\b/i.test(structured.status) || /\bblocked\b/i.test(structured.line);
  const isStale = ageMinutes !== null && ageMinutes > 10;
  const hasTask = Boolean(structured.task);
  const hasNextAction = Boolean(structured.nextAction);
  let boardState = "idle";
  if (isBlocked) boardState = "blocked";
  else if (isStale) boardState = "stale";
  else if (hasTask && !hasNextAction) boardState = "active-needs-next";
  else if (hasTask || structured.hasHeartbeat) boardState = "active";
  const rank = { blocked: 0, stale: 1, "active-needs-next": 2, active: 3, idle: 4 }[boardState] ?? 9;
  return {
    ...session,
    boardState,
    stateRank: rank,
    ageMinutes,
    task: structured.task || "task unknown",
    progress: structured.progress || "-",
    blocker: structured.blocker || "none",
    nextAction: structured.nextAction || "heartbeat missing",
    previewSummary,
    hasHeartbeat: structured.hasHeartbeat,
  };
}

function summarizeAgents(agents) {
  return agents.reduce((acc, agent) => {
    if (agent.boardState === "blocked") acc.blocked += 1;
    else if (agent.boardState === "stale") acc.stale += 1;
    else if (agent.boardState === "active" || agent.boardState === "active-needs-next") acc.active += 1;
    else acc.idle += 1;
    if (!agent.hasHeartbeat) acc.missingHeartbeat += 1;
    return acc;
  }, { blocked: 0, stale: 0, active: 0, idle: 0, missingHeartbeat: 0 });
}

function renderDirective(item) {
  const progress = Math.max(0, Math.min(100, Number(item.progress || 0)));
  const reportFields = item.report_fields && typeof item.report_fields === "object" ? item.report_fields : null;
  const refs = Array.isArray(item.references) && item.references.length
    ? `<div class="refs">${item.references.map((ref) => `<code>${esc(ref)}</code>`).join("")}</div>`
    : "";
  const updates = Array.isArray(item.updates) && item.updates.length
    ? `<ul class="updates">${item.updates.slice(-5).map((update) => `<li>${esc(update)}</li>`).join("")}</ul>`
    : "";
  const fieldOrder = ["item", "problem", "root_cause", "action", "doing_now", "next", "blocker", "evidence", "report_cadence"];
  const fieldLabels = {
    item: "Item",
    problem: "Problem",
    root_cause: "Root cause",
    action: "Action",
    doing_now: "Doing now",
    next: "Next",
    blocker: "Blocker",
    evidence: "Evidence",
    report_cadence: "Report cadence",
  };
  const reportGrid = reportFields
    ? `<dl class="report-fields">${fieldOrder
        .filter((key) => reportFields[key] !== undefined && reportFields[key] !== null && String(reportFields[key]).trim())
        .map((key) => `<div><dt>${esc(fieldLabels[key] || key)}</dt><dd>${esc(reportFields[key])}</dd></div>`)
        .join("")}</dl>`
    : "";
  return `<article class="card ${esc(item.priority).toLowerCase()}">
    <div class="card-head">
      <div>
        <span class="priority">${esc(item.priority)}</span>
        <h2>${esc(item.title)}</h2>
      </div>
      <span class="status ${badgeClass(item.status)}">${esc(item.status)}</span>
    </div>
    <div class="progress-row">
      <div class="progress-bar"><span style="width:${progress}%"></span></div>
      <strong>${progress}%</strong>
    </div>
    <p class="last-update">${esc(item.last_update || "진행상황 미기입")}</p>
    <p class="directive">${esc(item.directive)}</p>
    <dl>
      <div><dt>담당</dt><dd>${esc(item.owner)}</dd></div>
      <div><dt>다음</dt><dd>${esc(item.next_action)}</dd></div>
      <div><dt>증거</dt><dd>${esc(item.evidence_required)}</dd></div>
    </dl>
    ${reportGrid}
    ${updates}
    ${refs}
  </article>`;
}

function renderAgent(session) {
  const name = session.id === "dev-lead" ? "Max" : (session.name || session.id);
  const preview = cleanPreview(session.preview_text || session.preview);
  return `<article class="agent-card">
    <div class="agent-head">
      <strong>${esc(name)}</strong>
      <span class="status ${badgeClass(session.status)}">${esc(session.status || "unknown")}</span>
    </div>
    <dl>
      <div><dt>모델</dt><dd>${esc(session.model || "-")}</dd></div>
      <div><dt>공간</dt><dd>${esc(session.cwd || "-")}</dd></div>
      <div><dt>입력</dt><dd>${esc(session.interactive ? "가능" : "확인 필요")}</dd></div>
    </dl>
    <p>${esc(preview || "최근 미리보기 없음")}</p>
  </article>`;
}

function renderAgentCard(session) {
  const name = session.id === "dev-lead" ? "Max" : (session.name || session.id);
  const updated = session.ageMinutes === null ? "unknown" : `${session.ageMinutes}m ago`;
  return `<article class="agent-card">
    <div class="agent-head">
      <strong>${esc(name)}</strong>
      <span class="status ${badgeClass(session.boardState)}">${esc(session.boardState || "unknown")}</span>
    </div>
    <dl>
      <div><dt>Task</dt><dd>${esc(session.task || "task unknown")}</dd></div>
      <div><dt>Next</dt><dd>${esc(session.nextAction || "heartbeat missing")}</dd></div>
      <div><dt>Blocker</dt><dd>${esc(session.blocker || "none")}</dd></div>
      <div><dt>Progress</dt><dd>${esc(session.progress || "-")}</dd></div>
      <div><dt>Updated</dt><dd>${esc(updated)}</dd></div>
      <div><dt>Model</dt><dd>${esc(session.model || "-")}</dd></div>
    </dl>
    <p>${esc(session.previewSummary || "no preview")}</p>
  </article>`;
}

function renderPage(ledger, agents, agentError) {
  const directives = Array.isArray(ledger.directives) ? ledger.directives : [];
  const openDirectives = directives.filter((item) => !String(item.status).toLowerCase().includes("done"));
  const doneDirectives = directives.filter((item) => String(item.status).toLowerCase().includes("done"));
  const activeCount = directives.filter((item) => String(item.status).includes("active")).length;
  const doneCount = directives.filter((item) => String(item.status).includes("done")).length;
  const benchmark = ledger.hq_benchmark || {};
  const patterns = Array.isArray(benchmark.observed_patterns) ? benchmark.observed_patterns : [];
  const advantages = Array.isArray(benchmark.distilled_advantages) ? benchmark.distilled_advantages : [];
  const agentSummary = summarizeAgents(agents);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="10" />
  <title>CEO 지시 원장</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0c1117;
      --panel: #151b24;
      --panel-2: #101722;
      --line: #273142;
      --text: #edf3fb;
      --muted: #9dacbf;
      --blue: #5b7cfa;
      --green: #35c48b;
      --amber: #f2bb4b;
      --red: #f16d75;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", system-ui, sans-serif;
      letter-spacing: 0;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 5;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 14px 22px;
      border-bottom: 1px solid var(--line);
      background: rgba(12, 17, 23, 0.97);
    }
    h1 { margin: 0; font-size: 20px; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 3px; }
    .stats { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .stat {
      min-width: 82px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      text-align: right;
    }
    .stat strong { display: block; font-size: 17px; }
    .stat span { color: var(--muted); font-size: 11px; }
    main {
      width: min(1560px, calc(100vw - 28px));
      margin: 14px auto 40px;
      display: grid;
      grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
      gap: 14px;
    }
    aside {
      position: sticky;
      top: 76px;
      align-self: start;
      display: grid;
      gap: 12px;
      min-width: 0;
    }
    section, .card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      min-width: 0;
    }
    section { padding: 14px; }
    h2, h3 { margin: 0; }
    section h2 { font-size: 15px; margin-bottom: 10px; }
    ul { margin: 0; padding-left: 18px; color: var(--muted); line-height: 1.48; }
    li + li { margin-top: 7px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 12px;
      min-width: 0;
    }
    .content {
      display: grid;
      gap: 14px;
      min-width: 0;
    }
    .section-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin: 0 0 10px;
      color: var(--text);
      font-size: 15px;
    }
    .section-title span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
    }
    details.done-box {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(21, 27, 36, .68);
      padding: 12px;
    }
    details.done-box > summary {
      cursor: pointer;
      color: var(--text);
      font-weight: 700;
      margin-bottom: 12px;
    }
    details.done-box .grid {
      margin-top: 12px;
    }
    .card {
      padding: 14px;
      display: grid;
      gap: 11px;
      border-left-width: 4px;
    }
    .card.p0 { border-left-color: var(--red); }
    .card.p1 { border-left-color: var(--amber); }
    .card-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
    }
    .priority {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .card h2 { font-size: 15px; margin-top: 2px; }
    .status {
      flex: 0 0 auto;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 11px;
      border: 1px solid var(--line);
      color: var(--muted);
      background: var(--panel-2);
    }
    .status.active { color: var(--green); border-color: rgba(53,196,139,.45); }
    .status.done { color: #93e6bd; border-color: rgba(53,196,139,.35); }
    .status.planned { color: var(--amber); border-color: rgba(242,187,75,.45); }
    .status.blocked { color: #ffb4b4; border-color: rgba(241,109,117,.45); }
    .status.stale, .status.active-needs-next { color: var(--amber); border-color: rgba(242,187,75,.45); }
    .directive {
      margin: 0;
      color: var(--text);
      line-height: 1.45;
    }
    .last-update {
      margin: 0;
      padding: 9px 10px;
      border-radius: 6px;
      background: rgba(91, 124, 250, .1);
      color: #dce5ff;
      line-height: 1.42;
      font-size: 13px;
    }
    .progress-row {
      display: grid;
      grid-template-columns: 1fr 44px;
      gap: 9px;
      align-items: center;
    }
    .progress-row strong {
      text-align: right;
      color: var(--muted);
      font-size: 12px;
    }
    .progress-bar {
      height: 8px;
      border-radius: 999px;
      overflow: hidden;
      background: #0b111a;
      border: 1px solid rgba(255,255,255,.08);
    }
    .progress-bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--blue), var(--green));
    }
    dl { display: grid; gap: 8px; margin: 0; }
    dl div {
      display: grid;
      grid-template-columns: 74px 1fr;
      gap: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,.06);
    }
    dt { color: var(--muted); font-size: 11px; text-transform: uppercase; }
    dd { margin: 0; color: #d8e1ee; font-size: 13px; line-height: 1.4; }
    .report-fields {
      padding: 10px;
      border: 1px solid rgba(91, 124, 250, .28);
      border-radius: 8px;
      background: rgba(91, 124, 250, .08);
    }
    .report-fields div {
      grid-template-columns: 112px 1fr;
      border-top-color: rgba(91, 124, 250, .18);
    }
    .report-fields div:first-child { border-top: 0; padding-top: 0; }
    .report-fields dt { color: #b8c7ff; }
    .agents {
      display: grid;
      gap: 8px;
      max-height: 520px;
      overflow: auto;
      padding-right: 2px;
    }
    .agent-card {
      padding: 10px;
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 8px;
      background: var(--panel-2);
    }
    .agent-summary {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }
    .agent-summary div {
      padding: 8px;
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 8px;
      background: #0b111a;
      text-align: center;
    }
    .agent-summary strong { display: block; font-size: 16px; }
    .agent-summary span { color: var(--muted); font-size: 11px; }
    .agent-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .agent-head strong { font-size: 13px; }
    .agent-card dl { gap: 5px; }
    .agent-card dl div {
      grid-template-columns: 42px 1fr;
      padding-top: 5px;
    }
    .agent-card p, .agent-error {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.38;
    }
    .updates {
      margin: 0;
      padding: 10px 10px 10px 26px;
      border-radius: 6px;
      background: rgba(255,255,255,.035);
      color: var(--muted);
      font-size: 12px;
      line-height: 1.42;
    }
    .updates li + li { margin-top: 4px; }
    code {
      display: block;
      margin-top: 6px;
      padding: 6px 8px;
      border-radius: 6px;
      background: #0b111a;
      color: #b8d7ff;
      white-space: normal;
      overflow-wrap: anywhere;
      font-family: Consolas, monospace;
      font-size: 12px;
    }
    .source {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    @media (min-width: 1900px) {
      main { grid-template-columns: minmax(360px, 440px) minmax(0, 1fr); }
      .grid { grid-template-columns: repeat(3, minmax(340px, 1fr)); }
    }
    @media (max-width: 980px) {
      header { grid-template-columns: 1fr; }
      .stats { justify-content: flex-start; }
      main { grid-template-columns: 1fr; }
      aside { position: static; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>CEO 지시 원장</h1>
      <div class="sub">루카스 지시사항, 진행률, 담당자, 증거, 에이전트 상태 · 갱신 ${esc(ledger.updated_at)} · 10초 자동 새로고침</div>
    </div>
    <div class="stats">
      <div class="stat"><strong>${directives.length}</strong><span>지시</span></div>
      <div class="stat"><strong>${activeCount}</strong><span>진행중</span></div>
      <div class="stat"><strong>${doneCount}</strong><span>완료</span></div>
      <div class="stat"><strong>${agents.length}</strong><span>에이전트</span></div>
    </div>
  </header>
  <main>
    <aside>
      <section>
        <h2>본사 벤치마킹</h2>
        <div class="source">저장소: <code>${esc(benchmark.repo || "")}</code></div>
        <ul>${patterns.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      </section>
      <section>
        <h2>추려낸 장점</h2>
        <ul>${advantages.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      </section>
      <section>
        <h2>에이전트 현황</h2>
        ${agentError ? `<p class="agent-error">${esc(agentError)}</p>` : `<div class="agent-summary">
          <div><strong>${agentSummary.blocked}</strong><span>Blocked</span></div>
          <div><strong>${agentSummary.stale}</strong><span>Stale</span></div>
          <div><strong>${agentSummary.active}</strong><span>Active</span></div>
          <div><strong>${agentSummary.idle}</strong><span>Idle</span></div>
          <div><strong>${agentSummary.missingHeartbeat}</strong><span>No heartbeat</span></div>
        </div><div class="agents">${agents.map(renderAgentCard).join("")}</div>`}
      </section>
    </aside>
    <div class="content">
      <section>
        <div class="section-title">진행중 지시사항 <span>완료 항목은 아래에 분리</span></div>
        <div class="grid">
          ${openDirectives.map(renderDirective).join("\n")}
        </div>
      </section>
      <details class="done-box">
        <summary>완료된 항목 ${doneDirectives.length}개</summary>
        <div class="grid">
          ${doneDirectives.map(renderDirective).join("\n")}
        </div>
      </details>
    </div>
  </main>
</body>
</html>`;
}

function readLedger() {
  return JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
}

const server = http.createServer(async (request, response) => {
  try {
    const ledger = readLedger();
    let agents = [];
    let agentError = "";
    try {
      agents = (await fetchAgents()).map(classifyAgent).sort((a, b) =>
        a.stateRank - b.stateRank ||
        (a.ageMinutes ?? 9999) - (b.ageMinutes ?? 9999) ||
        String(a.id).localeCompare(String(b.id), "en")
      );
    } catch (error) {
      agentError = error.message || String(error);
    }
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, ledgerPath, directives: ledger.directives?.length || 0, agents: agents.length, agentError }));
      return;
    }
    if (request.url === "/api/ledger") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(ledger));
      return;
    }
    if (request.url === "/api/agents") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ agents, error: agentError }));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderPage(ledger, agents, agentError));
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.stack || String(error));
  }
});

server.listen(port, () => {
  console.log(`CEO command ledger listening on http://127.0.0.1:${port} and http://localhost:${port}`);
});
