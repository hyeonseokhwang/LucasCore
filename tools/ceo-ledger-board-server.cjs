const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const executionBoardPath = path.join(root, "data", "execution-board.json");
const workLedgerPath = path.join(root, "data", "work-ledger.json");
const ledgerReferenceDisabledPath = path.join(root, "data", "ledger-reference-disabled.json");
const activeDrillReportPath = path.join(root, "data", "task-reports", "terminal-instability-real-ledger-20260604.md");
const port = Number(process.env.CEO_LEDGER_PORT || 9100);

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function readText(file, fallback = "") {
  try {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return fallback;
  }
}

function isLedgerReferenceDisabled() {
  if (process.env.LCC_LEDGER_REFERENCE_DISABLED === "1") return true;
  try {
    return JSON.parse(fs.readFileSync(ledgerReferenceDisabledPath, "utf8")).disabled === true;
  } catch {
    return false;
  }
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compact(value, fallback = "-") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function timeLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function badgeClass(value) {
  const text = String(value || "").toLowerCase();
  if (/(stale|blocked|pending|missing)/.test(text)) return "danger";
  if (/(review|qa|gate|hold|waiting)/.test(text)) return "warn";
  if (/(active|assigned|approved|ok|pass|doing)/.test(text)) return "good";
  return "neutral";
}

function priorityClass(value) {
  const text = String(value || "").toUpperCase();
  if (text === "P0") return "danger";
  if (text === "P1") return "warn";
  return "neutral";
}

function taskKey(task) {
  return task?.id || task?.task_id || "";
}

function workTaskMap(workLedger) {
  const tasks = Array.isArray(workLedger.tasks) ? workLedger.tasks : [];
  return new Map(tasks.map((task) => [task.id, task]));
}

function workEventsForTask(workLedger, id) {
  const events = Array.isArray(workLedger.events) ? workLedger.events : [];
  return events.filter((event) => event.task_id === id);
}

function recentEventSummary(events) {
  if (!events.length) return { evidence: "-", blocker: "-", next: "-", lastAt: "-" };
  const recent = [...events].reverse();
  const pick = (pattern) => recent.find((event) => pattern.test(`${event.kind} ${event.body}`));
  const evidence = pick(/evidence|qa|pass|commit|review/i);
  const blocker = pick(/blocked|blocker|risk|fail/i);
  const next = pick(/next|handoff|decision|doing|reported/i);
  return {
    evidence: evidence ? compact(evidence.body) : "-",
    blocker: blocker ? compact(blocker.body) : "-",
    next: next ? compact(next.body) : "-",
    lastAt: timeLabel(recent[0].at)
  };
}

function agentActivity(activeItems) {
  const map = new Map();
  for (const item of activeItems) {
    const key = compact(item.owner || item.next_owner || "unassigned");
    const row = map.get(key) || {
      agent: key,
      assigned: 0,
      stale: 0,
      decisionNeeded: 0,
      reviewGate: 0,
      topBand: "P2",
      sample: []
    };
    if (item.assignment_state === "assigned") row.assigned += 1;
    if (item.owner_status === "stale" || item.stale_reason) row.stale += 1;
    if (item.decision_needed) row.decisionNeeded += 1;
    if (/qa|commit|review/i.test(`${item.protected_contract || ""} ${item.title || ""}`)) row.reviewGate += 1;
    if (item.priority_band === "P0") row.topBand = "P0";
    else if (item.priority_band === "P1" && row.topBand !== "P0") row.topBand = "P1";
    if (row.sample.length < 2) row.sample.push(item.id);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => {
    return (b.stale - a.stale) || (b.decisionNeeded - a.decisionNeeded) || a.agent.localeCompare(b.agent, "en");
  });
}

function ownerMap(activeItems) {
  const rows = activeItems.filter((item) => /P0|P1/.test(String(item.priority_band || "")));
  const map = new Map();
  for (const item of rows) {
    const key = compact(item.owner || item.next_owner || "unassigned");
    const row = map.get(key) || {
      owner: key,
      p0: 0,
      p1: 0,
      assigned: 0,
      unassigned: 0,
      stale: 0,
      decisionNeeded: 0,
      topBand: "P2",
      nextOwners: new Set(),
      items: []
    };
    if (item.priority_band === "P0") row.p0 += 1;
    if (item.priority_band === "P1") row.p1 += 1;
    if (item.assignment_state === "assigned") row.assigned += 1;
    if (item.assignment_state === "unassigned") row.unassigned += 1;
    if (item.owner_status === "stale" || item.stale_reason) row.stale += 1;
    if (item.decision_needed) row.decisionNeeded += 1;
    if (item.priority_band === "P0") row.topBand = "P0";
    else if (item.priority_band === "P1" && row.topBand !== "P0") row.topBand = "P1";
    row.nextOwners.add(compact(item.next_owner || "Max"));
    if (row.items.length < 3) row.items.push(item.title || item.id);
    map.set(key, row);
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      nextOwners: [...row.nextOwners].slice(0, 2)
    }))
    .sort((a, b) => {
      return (b.stale - a.stale) || (b.unassigned - a.unassigned) || (b.p0 - a.p0) || (b.p1 - a.p1) || a.owner.localeCompare(b.owner, "en");
    });
}

function qaGates(board, workLedger) {
  const activeItems = Array.isArray(board.active) ? board.active : [];
  const taskMap = workTaskMap(workLedger);
  const relevant = activeItems.filter((item) => {
    return /qa|review|evidence|commit/i.test(`${item.protected_contract || ""} ${item.title || ""}`);
  });
  return relevant.slice(0, 8).map((item) => {
    const events = workEventsForTask(workLedger, item.id);
    const summary = recentEventSummary(events);
    return {
      id: item.id,
      title: item.title,
      owner: compact(item.owner || item.next_owner || "-"),
      gate: compact(item.protected_contract || "none"),
      approval: compact(item.approval_state || "none"),
      evidenceCount: events.filter((event) => /evidence|qa|pass|commit|review/i.test(`${event.kind} ${event.body}`)).length,
      lastAt: summary.lastAt,
      workTaskStatus: compact(taskMap.get(item.id)?.status || "-")
    };
  });
}

function staleRisks(board) {
  const activeItems = Array.isArray(board.active) ? board.active : [];
  const blocked = Array.isArray(board.blocked) ? board.blocked : [];
  const stale = activeItems.filter((item) => item.owner_status === "stale" || item.stale_reason || item.assignment_state === "unassigned");
  return {
    stale: stale.slice(0, 10),
    blocked
  };
}

function rawDrilldown(board, workLedger) {
  const picks = [];
  const add = (item) => {
    if (item && !picks.find((entry) => entry.id === item.id)) picks.push(item);
  };
  (Array.isArray(board.decision_needed) ? board.decision_needed : []).slice(0, 4).forEach(add);
  (Array.isArray(board.active) ? board.active : []).filter((item) => item.owner === "developer-8").slice(0, 2).forEach(add);
  return picks.map((item) => ({
    id: item.id,
    title: item.title,
    exec: item,
    workTask: workTaskMap(workLedger).get(item.id) || null,
    workEvents: workEventsForTask(workLedger, item.id).slice(-5)
  }));
}

function renderChip(label, value, klass = "neutral") {
  return `<span class="chip ${klass}"><strong>${esc(label)}</strong><span>${esc(value)}</span></span>`;
}

function renderList(items, renderItem, empty = "표시할 항목이 없습니다.") {
  if (!items.length) return `<div class="empty">${esc(empty)}</div>`;
  return `<div class="list">${items.map(renderItem).join("")}</div>`;
}

function renderActiveDrillReport(reportText) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>9100 Terminal Instability Ledger</title>
  <style>
    :root { color-scheme: dark; --bg:#080d18; --panel:#111a2b; --ink:#e7eefc; --muted:#9fb0ca; --line:#2a3954; --warn:#ffd166; --bad:#ff6b6b; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.55 "Segoe UI","Malgun Gothic",system-ui,sans-serif; }
    main { max-width:1500px; margin:0 auto; padding:24px; }
    header, section { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:18px; }
    header { margin-bottom:14px; }
    h1 { margin:0 0 8px; font-size:26px; }
    p { margin:6px 0; color:var(--muted); }
    .chips { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
    .chip { border:1px solid var(--line); border-radius:999px; padding:6px 10px; background:#16233a; }
    .warn { color:var(--warn); }
    .bad { color:var(--bad); }
    pre { margin:0; white-space:pre-wrap; overflow:auto; color:var(--ink); font:13px/1.5 Consolas, "Cascadia Mono", monospace; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Terminal Instability Real Ledger</h1>
      <p>Existing JSON ledger items are deferred. This 9100 view shows only the active terminal instability report authorized by Lucas.</p>
      <div class="chips">
        <span class="chip warn">mode=real-debug</span>
        <span class="chip bad">status=not-closed</span>
        <span class="chip">target=17:00 KST</span>
        <span class="chip">report=data/task-reports/terminal-instability-real-ledger-20260604.md</span>
      </div>
    </header>
    <section>
      <pre>${esc(reportText || "Active report file is missing.")}</pre>
    </section>
  </main>
</body>
</html>`;
}

function renderPage(board, workLedger) {
  const counts = board.counts || {};
  const activeItems = Array.isArray(board.active) ? board.active : [];
  const decisionQueue = Array.isArray(board.decision_needed) ? board.decision_needed : [];
  const hierarchy = Array.isArray(board.hierarchy) ? board.hierarchy : [];
  const approvals = Array.isArray(board.approvals) ? board.approvals : [];
  const evidenceIndex = Array.isArray(board.evidence_index) ? board.evidence_index : [];
  const ownerRows = ownerMap(activeItems);
  const activityRows = agentActivity(activeItems);
  const risks = staleRisks(board);
  const gates = qaGates(board, workLedger);
  const drilldown = rawDrilldown(board, workLedger);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>9100 Executive Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f6fb;
      --panel: #ffffff;
      --ink: #142033;
      --muted: #5d6b82;
      --line: #d8e0ec;
      --blue: #1f5eff;
      --red: #cf3d2e;
      --amber: #b7791f;
      --green: #177b57;
      --shadow: 0 18px 42px rgba(16, 24, 40, 0.08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 "Segoe UI", "Malgun Gothic", system-ui, sans-serif; }
    .page { max-width: 1560px; margin: 0 auto; padding: 24px; }
    .hero, .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); }
    .hero { padding: 22px 24px; margin-bottom: 18px; }
    .hero h1 { margin: 0 0 8px; font-size: 28px; }
    .hero p { margin: 0; color: var(--muted); }
    .meta { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; }
    .chip { display: inline-flex; gap: 8px; align-items: center; border-radius: 999px; padding: 7px 12px; background: #eef3fb; color: var(--ink); }
    .chip strong { font-size: 12px; color: var(--muted); }
    .chip.danger { background: #fee8e6; color: var(--red); }
    .chip.warn { background: #fff2db; color: var(--amber); }
    .chip.good { background: #e4f7ef; color: var(--green); }
    .chip.neutral { background: #eef3fb; color: var(--ink); }
    .metrics { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
    .metric { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px; box-shadow: var(--shadow); }
    .metric .label { color: var(--muted); font-size: 12px; }
    .metric .value { display: block; margin-top: 6px; font-size: 30px; font-weight: 800; }
    .grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; }
    .stack { display: grid; gap: 16px; }
    .panel { padding: 18px; }
    .panel h2 { margin: 0 0 12px; font-size: 18px; }
    .subtle { color: var(--muted); font-size: 12px; margin-bottom: 10px; }
    .list { display: grid; gap: 10px; }
    .card { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: #fbfcfe; }
    .card h3 { margin: 0 0 6px; font-size: 15px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { border-top: 1px solid #edf2f7; padding: 10px 8px; text-align: left; vertical-align: top; }
    .table th { color: var(--muted); font-size: 12px; }
    .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 8px; font-weight: 700; font-size: 11px; }
    .badge.danger { background: #fee8e6; color: var(--red); }
    .badge.warn { background: #fff2db; color: var(--amber); }
    .badge.good { background: #e4f7ef; color: var(--green); }
    .badge.neutral { background: #eef3fb; color: var(--ink); }
    details { border: 1px solid var(--line); border-radius: 12px; background: #fbfcfe; padding: 10px 12px; }
    details:not([open]) > *:not(summary) { display: none !important; }
    details + details { margin-top: 10px; }
    summary { cursor: pointer; font-weight: 700; }
    pre { margin: 10px 0 0; padding: 12px; border-radius: 10px; background: #0d1726; color: #dbe7ff; overflow: auto; white-space: pre-wrap; word-break: break-word; }
    .empty { padding: 18px; border: 1px dashed var(--line); border-radius: 12px; color: var(--muted); background: #fbfcfe; }
    @media (max-width: 1180px) {
      .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 760px) {
      .page { padding: 14px; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <h1>9100 운영 대시보드</h1>
      <p>실행 보드 기준 읽기 전용 화면입니다. 주 데이터는 <code>data/execution-board.json</code>이며, 원시 JSON 드릴다운에서만 <code>data/work-ledger.json</code>을 함께 봅니다.</p>
      <div class="meta">
        ${renderChip("생성 시각", timeLabel(board.generated_at))}
        ${renderChip("이벤트 상한", compact(board.source_event_high_watermark))}
        ${renderChip("정책 모드", compact(board.policy_mode || "normal"), badgeClass(board.policy_mode || "normal"))}
        ${renderChip("생성자", compact(board.generated_by || "-"))}
      </div>
    </section>

    <section class="metrics">
      <div class="metric"><span class="label">활성 항목</span><strong class="value">${counts.active || 0}</strong></div>
      <div class="metric"><span class="label">P0</span><strong class="value">${counts.p0 || 0}</strong></div>
      <div class="metric"><span class="label">P1</span><strong class="value">${counts.p1 || 0}</strong></div>
      <div class="metric"><span class="label">결정 필요</span><strong class="value">${counts.decision_needed || 0}</strong></div>
      <div class="metric"><span class="label">정체/미배정</span><strong class="value">${counts.stale || 0}</strong></div>
      <div class="metric"><span class="label">미소유</span><strong class="value">${counts.unowned || 0}</strong></div>
    </section>

    <section class="grid">
      <div class="stack">
        <section class="panel">
          <h2>결정 필요 큐</h2>
          <div class="subtle">Caesar/Max 승인이나 재배정이 필요한 항목 우선순위</div>
          ${renderList(
            decisionQueue.slice(0, 8),
            (item) => `<article class="card">
              <h3>${esc(item.id)} · ${esc(item.title)}</h3>
              <div class="row">
                <span class="badge ${priorityClass(item.priority_band)}">${esc(item.priority_band || "P?")}</span>
                <span class="badge ${badgeClass(item.owner_status || item.assignment_state)}">${esc(compact(item.owner_status || item.assignment_state || "unknown"))}</span>
                <span class="badge ${badgeClass(item.approval_state)}">${esc(compact(item.approval_state || "none"))}</span>
              </div>
              <div class="row">
                ${renderChip("현재 소유", compact(item.owner || "-"))}
                ${renderChip("다음 소유", compact(item.next_owner || "Max"))}
                ${renderChip("계약", compact(item.protected_contract || "none"))}
              </div>
            </article>`,
            "결정 대기 항목이 없습니다."
          )}
        </section>

        <section class="panel">
          <h2>P0/P1 소유 맵</h2>
          <div class="subtle">우선순위 기준 소유 분포와 대표 항목</div>
          <table class="table">
            <thead><tr><th>소유자</th><th>P0</th><th>P1</th><th>대표 항목</th></tr></thead>
            <tbody>
              ${ownerRows.map((row) => `<tr>
                <td>${esc(row.owner)}</td>
                <td>
                  <div class="row">
                    <span class="badge ${priorityClass(row.topBand)}">${esc(row.topBand)}</span>
                    <span class="badge ${row.p0 ? "danger" : "neutral"}">P0 ${row.p0}</span>
                    <span class="badge ${row.p1 ? "warn" : "neutral"}">P1 ${row.p1}</span>
                  </div>
                </td>
                <td>
                  <div class="row">
                    <span class="badge ${row.stale ? "danger" : "good"}">stale ${row.stale}</span>
                    <span class="badge ${row.unassigned ? "warn" : "good"}">unassigned ${row.unassigned}</span>
                    <span class="badge ${row.assigned ? "good" : "neutral"}">assigned ${row.assigned}</span>
                    <span class="badge ${row.decisionNeeded ? "warn" : "neutral"}">decision ${row.decisionNeeded}</span>
                  </div>
                </td>
                <td>${esc(row.nextOwners.join(" / "))} / ${esc(row.items.join(" / "))}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h2>정체 / 차단 위험</h2>
          <div class="subtle">owner_status, assignment_state, stale_reason 기준 위험 항목</div>
          ${renderList(
            risks.stale,
            (item) => `<article class="card">
              <h3>${esc(item.id)} · ${esc(item.title)}</h3>
              <div class="row">
                <span class="badge ${badgeClass(item.owner_status)}">${esc(compact(item.owner_status || "unknown"))}</span>
                <span class="badge ${badgeClass(item.assignment_state)}">${esc(compact(item.assignment_state || "unknown"))}</span>
                <span class="badge ${badgeClass(item.stale_reason)}">${esc(compact(item.stale_reason || "no-reason"))}</span>
              </div>
              <div class="row">
                ${renderChip("현재 소유", compact(item.owner || "-"))}
                ${renderChip("다음 소유", compact(item.next_owner || "Max"))}
                ${renderChip("카테고리", compact(item.category || "-"))}
              </div>
            </article>`,
            "정체 위험 항목이 없습니다."
          )}
          ${risks.blocked.length ? `<div class="subtle" style="margin-top:12px">blocked 배열: ${esc(JSON.stringify(risks.blocked))}</div>` : ""}
        </section>
      </div>

      <div class="stack">
        <section class="panel">
          <h2>에이전트 활동 스트립</h2>
          <div class="subtle">live terminal 대신 execution board 소유/정체 상태를 요약합니다.</div>
          ${renderList(
            activityRows.slice(0, 10),
            (row) => `<article class="card">
              <h3>${esc(row.agent)}</h3>
              <div class="row">
                ${renderChip("배정", String(row.assigned), row.assigned ? "good" : "neutral")}
                ${renderChip("정체", String(row.stale), row.stale ? "danger" : "neutral")}
                ${renderChip("결정 필요", String(row.decisionNeeded), row.decisionNeeded ? "warn" : "neutral")}
                ${renderChip("QA 게이트", String(row.reviewGate), row.reviewGate ? "warn" : "neutral")}
                ${renderChip("최상위 밴드", row.topBand, priorityClass(row.topBand))}
              </div>
              <div class="subtle">대표: ${esc(row.sample.join(" / "))}</div>
            </article>`
          )}
        </section>

        <section class="panel">
          <h2>QA / 증거 게이트</h2>
          <div class="subtle">승인 게이트, evidence index, QA 관련 protected contract</div>
          <div class="row" style="margin-bottom:12px">
            ${renderChip("승인 게이트", String(approvals.length), approvals.length ? "warn" : "neutral")}
            ${renderChip("증거 인덱스", String(evidenceIndex.length), evidenceIndex.length ? "good" : "neutral")}
            ${renderChip("ACK 매트릭스", String((board.ack_matrix || []).length), "neutral")}
          </div>
          <table class="table">
            <thead><tr><th>항목</th><th>소유</th><th>게이트</th><th>승인</th><th>증거 수</th><th>최근</th></tr></thead>
            <tbody>
              ${gates.map((item) => `<tr>
                <td>${esc(item.id)}</td>
                <td>${esc(item.owner)}</td>
                <td>${esc(item.gate)}</td>
                <td><span class="badge ${badgeClass(item.approval)}">${esc(item.approval)}</span></td>
                <td>${item.evidenceCount}</td>
                <td>${esc(item.lastAt)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
          ${renderList(
            approvals,
            (item) => `<article class="card">
              <h3>${esc(item.gate)}</h3>
              <div class="row">
                <span class="badge ${badgeClass(item.state)}">${esc(item.state)}</span>
                ${renderChip("근거 이벤트", compact(item.id))}
              </div>
            </article>`,
            "승인 게이트가 없습니다."
          )}
        </section>

        <section class="panel">
          <h2>원시 JSON 드릴다운</h2>
          <div class="subtle">execution board 기본 + 필요한 task만 work-ledger task/events를 붙여 보여줍니다.</div>
          ${drilldown.map((entry) => `<details>
            <summary>${esc(entry.id)} · ${esc(entry.title)}</summary>
            <pre>${esc(JSON.stringify({
              executionBoard: entry.exec,
              workLedgerTask: entry.workTask,
              workLedgerEvents: entry.workEvents
            }, null, 2))}</pre>
          </details>`).join("")}
        </section>

        <section class="panel">
          <h2>카테고리 개요</h2>
          <table class="table">
            <thead><tr><th>카테고리</th><th>활성</th><th>P0</th><th>P1</th><th>결정 필요</th></tr></thead>
            <tbody>
              ${hierarchy.map((item) => `<tr>
                <td>${esc(item.category || "Unclassified")}</td>
                <td>${item.counts?.active || 0}</td>
                <td>${item.counts?.p0 || 0}</td>
                <td>${item.counts?.p1 || 0}</td>
                <td>${item.counts?.decision_needed || 0}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  </div>
</body>
</html>`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (isLedgerReferenceDisabled()) {
    const reportText = readText(activeDrillReportPath);
    if (reportText) {
      if (url.pathname === "/health" || url.pathname === "/api/active-report") {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          ok: true,
          mode: "terminal-instability-real-ledger",
          ledger_reference_disabled: true,
          activeDrillReportPath
        }));
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderActiveDrillReport(reportText));
      return;
    }
    const disabled = {
      ok: false,
      disabled: true,
      reason: "ledger-reference-disabled",
      next: "Do not read or execute ledger items until Lucas restores ledger reference."
    };
    if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(disabled));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Ledger Disabled</title></head><body><h1>Ledger reference disabled</h1><p>${esc(disabled.next)}</p></body></html>`);
    return;
  }

  const board = readJson(executionBoardPath, {});
  const workLedger = readJson(workLedgerPath, { tasks: [], events: [] });

  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      ok: true,
      port,
      executionBoardPath,
      workLedgerPath,
      generated_at: board.generated_at || null,
      active: board.counts?.active || 0
    }));
    return;
  }

  if (url.pathname === "/api/execution-board" || url.pathname === "/api/ledger") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(board));
    return;
  }

  if (url.pathname === "/api/work-ledger") {
    const taskId = url.searchParams.get("taskId");
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    if (!taskId) {
      response.end(JSON.stringify(workLedger));
      return;
    }
    response.end(JSON.stringify({
      task: workTaskMap(workLedger).get(taskId) || null,
      events: workEventsForTask(workLedger, taskId)
    }));
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(renderPage(board, workLedger));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`CEO ledger board listening on http://127.0.0.1:${port}`);
});
