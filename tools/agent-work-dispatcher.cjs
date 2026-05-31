const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ledgerPath = path.join(root, "data", "ceo-command-ledger.json");
const statePath = path.join(root, "data", "agent-work-dispatch-state.json");
const idleLedgerPath = path.join(root, "data", "agent-idle-ledger.json");
const opsEventLogPath = path.join(root, "data", "agent-ops-events.jsonl");
const apiBase = process.env.LCC_API_BASE || "http://127.0.0.1:9001";
const minDispatchMinutes = Number(process.env.DISPATCH_MIN_MINUTES || 10);
const staleLogMinutes = Number(process.env.STALE_LOG_MINUTES || 5);
const now = Date.now();

const rolePlan = {
  "dev-lead": {
    taskIds: ["max-team-policy", "meeting-first", "terminal-scrollback", "ledger-management", "agent-status-on-9100"],
    role: "Max: 팀 리드, 병목 해소, 리뷰/커밋 게이트, 유휴자 재배정"
  },
  "developer-1": {
    taskIds: ["terminal-scrollback", "responsive-layout"],
    role: "터미널 UX/팝업/개행/스크롤 안정화"
  },
  "developer-2": {
    taskIds: ["meeting-first", "hq-benchmark-policy"],
    role: "본사 미팅/채팅 소스 벤치마크와 API 설계"
  },
  "developer-3": {
    taskIds: ["ledger-management", "agent-status-on-9100"],
    role: "원장 모델/상태관리/운영 보드"
  },
  "developer-4": {
    taskIds: ["qa-cdp-policy", "terminal-scrollback", "meeting-first"],
    role: "QA/CDP 게이트와 증거 수집"
  },
  "developer-5": {
    taskIds: ["meeting-first"],
    role: "미팅 기능 UI/MVP 구현"
  },
  "developer-6": {
    taskIds: ["ledger-management", "policy-persistence"],
    role: "원장 데이터/정책 지속성"
  },
  "developer-7": {
    taskIds: ["heungkuk-final-source"],
    role: "흥국생명 안드로이드 최종소스 추림"
  },
  "developer-8": {
    taskIds: ["agent-status-on-9100", "responsive-layout"],
    role: "운영 모니터링/유휴 감지/화면 배치"
  }
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

function eventBase(type, session, task, classification) {
  return {
    at: new Date(now).toISOString(),
    type,
    agentId: session.id,
    agentName: session.name || session.id,
    status: session.status,
    state: classification.state,
    taskId: task?.id || null,
    taskTitle: task?.title || null,
    logAgeMinutes: Number.isFinite(classification.minutesSinceLogUpdate)
      ? Number(classification.minutesSinceLogUpdate.toFixed(1))
      : null,
    dispatchAgeMinutes: Number.isFinite(classification.minutesSinceDispatch)
      ? Number(classification.minutesSinceDispatch.toFixed(1))
      : null,
    signals: {
      busy: classification.looksBusy,
      waiting: classification.looksWaiting,
      blocked: classification.looksBlocked,
      logStale: classification.logStale,
      staleDispatch: classification.staleDispatch
    },
    previewTail: classification.preview.slice(-1200)
  };
}

function stripAnsi(value) {
  return String(value || "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\r/g, "\n");
}

function cleanPreview(session) {
  return stripAnsi(session.preview_text || session.preview || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .join("\n");
}

function isDone(item) {
  return String(item?.status || "").toLowerCase().includes("done");
}

function pickTask(ledger, plan) {
  const directives = Array.isArray(ledger.directives) ? ledger.directives : [];
  for (const id of plan.taskIds) {
    const item = directives.find((directive) => directive.id === id && !isDone(directive));
    if (item) return item;
  }
  return directives
    .filter((directive) => !isDone(directive))
    .sort((a, b) => String(a.priority || "").localeCompare(String(b.priority || "")) || Number(a.progress || 0) - Number(b.progress || 0))[0];
}

function classifyAgent(session, dispatchState) {
  const preview = cleanPreview(session);
  const lastDispatchAt = dispatchState[session.id]?.lastDispatchAt || 0;
  const minutesSinceDispatch = (now - lastDispatchAt) / 60000;
  const staleDispatch = minutesSinceDispatch >= minDispatchMinutes;
  const active = session.status === "active";
  const logUpdatedAt = session.log?.updated_at ? Date.parse(session.log.updated_at) : 0;
  const minutesSinceLogUpdate = logUpdatedAt ? (now - logUpdatedAt) / 60000 : Number.POSITIVE_INFINITY;
  const logStale = minutesSinceLogUpdate >= staleLogMinutes;
  const looksBlocked = /blocked|blocker|막힘|에러|error|failed|실패|cannot|can't|denied|refusing/i.test(preview);
  const looksWaiting = /waiting|idle|대기|지시|next action|what should|무엇|할 일|available/i.test(preview);
  const looksBusy = /working|running|작업|진행|검증|비교|구현|빌드|build|test|테스트|cdp|benchmark|보고|수정|분석|checking|implement/i.test(preview);
  let state = "idle";
  if (!active) state = "inactive";
  else if (looksBlocked) state = "blocked";
  else if (looksWaiting) state = "waiting";
  else if (logStale && !looksBusy) state = "stale";
  else if (looksBusy) state = "working";
  const shouldDispatch = active && staleDispatch && ["idle", "waiting", "blocked", "stale"].includes(state);
  return {
    preview,
    active,
    looksBusy,
    looksWaiting,
    looksBlocked,
    logStale,
    staleDispatch,
    shouldDispatch,
    state,
    minutesSinceDispatch,
    minutesSinceLogUpdate
  };
}

function updateIdleLedger(idleLedger, session, task, classification, dispatched) {
  const agents = idleLedger.agents || {};
  const previous = agents[session.id] || {
    totalIdleMs: 0,
    totalWaitingMs: 0,
    totalBlockedMs: 0,
    dispatchCount: 0,
    events: []
  };
  const previousSeenAt = previous.lastSeenAt ? Date.parse(previous.lastSeenAt) : 0;
  const elapsedMs = previousSeenAt > 0 ? Math.max(0, Math.min(now - previousSeenAt, 15 * 60 * 1000)) : 0;
  if (["idle", "stale"].includes(previous.currentState)) previous.totalIdleMs += elapsedMs;
  if (previous.currentState === "waiting") previous.totalWaitingMs += elapsedMs;
  if (previous.currentState === "blocked") previous.totalBlockedMs += elapsedMs;
  if (dispatched) previous.dispatchCount += 1;

  const currentEventKey = `${classification.state}:${task?.id || "-"}:${dispatched ? "dispatch" : "observe"}`;
  if (previous.lastEventKey !== currentEventKey) {
    previous.events = [
      {
        at: new Date(now).toISOString(),
        state: classification.state,
        taskId: task?.id || null,
        action: dispatched ? "auto-dispatched" : "observed",
        reason: classification.looksBlocked
          ? "blocked-signal"
          : classification.looksWaiting
            ? "waiting-signal"
            : classification.logStale
              ? "stale-log"
              : classification.looksBusy
                ? "busy-signal"
                : "unclear"
      },
      ...(previous.events || [])
    ].slice(0, 50);
    previous.lastEventKey = currentEventKey;
  }

  previous.currentState = classification.state;
  previous.currentTaskId = task?.id || null;
  previous.lastSeenAt = new Date(now).toISOString();
  previous.lastLogAgeMinutes = Number.isFinite(classification.minutesSinceLogUpdate)
    ? Number(classification.minutesSinceLogUpdate.toFixed(1))
    : null;
  previous.lastDispatchAgeMinutes = Number.isFinite(classification.minutesSinceDispatch)
    ? Number(classification.minutesSinceDispatch.toFixed(1))
    : null;
  previous.lastPreview = classification.preview.slice(-1000);
  agents[session.id] = previous;

  idleLedger.updatedAt = new Date(now).toISOString();
  idleLedger.policy = {
    checkIntervalSeconds: Number(process.env.DISPATCH_LOOP_SECONDS || 60),
    dispatchCooldownMinutes: minDispatchMinutes,
    staleLogMinutes,
    states: ["working", "idle", "waiting", "blocked", "stale", "inactive"]
  };
  idleLedger.agents = agents;
  return previous;
}

function logStateObservation(dispatchState, session, task, classification) {
  const previous = dispatchState[session.id] || {};
  const nextStateKey = `${classification.state}:${task?.id || "-"}`;
  if (previous.lastStateKey !== nextStateKey) {
    appendJsonl(opsEventLogPath, {
      ...eventBase("state_changed", session, task, classification),
      previousStateKey: previous.lastStateKey || null,
      nextStateKey
    });
    previous.lastStateKey = nextStateKey;
  }

  const lastDispatchAt = previous.lastDispatchAt || 0;
  const logUpdatedAt = session.log?.updated_at ? Date.parse(session.log.updated_at) : 0;
  if (lastDispatchAt > 0 && logUpdatedAt > lastDispatchAt && previous.lastReceiptLoggedForDispatchAt !== lastDispatchAt) {
    appendJsonl(opsEventLogPath, {
      ...eventBase("agent_response_observed", session, task, classification),
      dispatchAt: new Date(lastDispatchAt).toISOString(),
      logUpdatedAt: new Date(logUpdatedAt).toISOString(),
      lastTaskId: previous.lastTaskId || null
    });
    previous.lastReceiptLoggedForDispatchAt = lastDispatchAt;
  }

  dispatchState[session.id] = previous;
}

async function getSessions() {
  const response = await fetch(`${apiBase}/api/sessions`);
  if (!response.ok) throw new Error(`sessions failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function writePrompt(sessionId, prompt) {
  const response = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/write`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ prompt })
  });
  if (!response.ok) throw new Error(`${sessionId} write failed: ${response.status} ${await response.text()}`);
}

function buildPrompt(agentId, plan, task, classification) {
  const taskTitle = task?.title || task?.id || "원장 미지정 항목";
  return `[자동 원장 Pull / 유휴 방지]
현재 ${agentId}가 원장 기반 재배정 대상입니다.

역할: ${plan.role}
착수할 원장 항목: ${task?.id || "-"} / ${taskTitle}
현재 상태 판정: ${classification.looksWaiting ? "대기/막힘 신호 있음" : "명확한 진행 보고 부족"} / 마지막 자동배정 ${classification.minutesSinceDispatch.toFixed(1)}분 전

지시:
1. 9100 원장과 관련 파일을 직접 확인한다.
2. Max에게 짧게 착수 보고한다.
3. Lucas나 Caesar의 추가 지시를 기다리지 말고 지금 가능한 최소 다음 행동을 실행한다.
4. 10분 안에 아래 형식으로 보고한다: item / doing now / next / blocker / evidence.
5. 막히면 구체적 blocker를 쓰고, 바로 다른 원장 항목 후보를 제안한다.

주의: 9001 singleton backend를 깨지 말고, UI 변경은 CDP/스크린샷 증거 없으면 완료 처리하지 않는다.`;
}

async function main() {
  const ledger = readJson(ledgerPath, { directives: [] });
  const dispatchState = readJson(statePath, {});
  const idleLedger = readJson(idleLedgerPath, { agents: {} });
  const sessions = await getSessions();
  const targets = sessions.filter((session) => rolePlan[session.id]);
  const reports = [];

  for (const session of targets) {
    const plan = rolePlan[session.id];
    const classification = classifyAgent(session, dispatchState);
    const task = pickTask(ledger, plan);
    const report = {
      id: session.id,
      status: session.status,
      state: classification.state,
      taskId: task?.id || null,
      logAgeMinutes: Number.isFinite(classification.minutesSinceLogUpdate) ? Number(classification.minutesSinceLogUpdate.toFixed(1)) : null,
      shouldDispatch: classification.shouldDispatch,
      reason: classification.looksWaiting ? "waiting-signal" : classification.staleDispatch ? "stale-or-unclear" : "recently-dispatched-or-busy"
    };

    if (classification.shouldDispatch && task) {
      const prompt = buildPrompt(session.id, plan, task, classification);
      appendJsonl(opsEventLogPath, {
        ...eventBase("dispatch_attempt", session, task, classification),
        reason: report.reason,
        promptPreview: prompt.slice(0, 1200)
      });
      await writePrompt(session.id, prompt);
      dispatchState[session.id] = {
        ...(dispatchState[session.id] || {}),
        lastDispatchAt: now,
        lastTaskId: task.id,
        lastReason: report.reason
      };
      appendJsonl(opsEventLogPath, {
        ...eventBase("dispatch_sent", session, task, classification),
        reason: report.reason
      });
      report.dispatched = true;
    } else {
      report.dispatched = false;
    }
    logStateObservation(dispatchState, session, task, classification);
    const idleRecord = updateIdleLedger(idleLedger, session, task, classification, report.dispatched);
    report.totalIdleMinutes = Number((idleRecord.totalIdleMs / 60000).toFixed(1));
    report.totalWaitingMinutes = Number((idleRecord.totalWaitingMs / 60000).toFixed(1));
    report.totalBlockedMinutes = Number((idleRecord.totalBlockedMs / 60000).toFixed(1));
    reports.push(report);
  }

  dispatchState.updatedAt = new Date(now).toISOString();
  writeJson(statePath, dispatchState);
  writeJson(idleLedgerPath, idleLedger);
  console.log(JSON.stringify({ ok: true, apiBase, minDispatchMinutes, staleLogMinutes, reports }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
