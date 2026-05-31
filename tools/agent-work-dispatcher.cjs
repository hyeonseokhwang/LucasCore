const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ledgerPath = path.join(root, "data", "ceo-command-ledger.json");
const statePath = path.join(root, "data", "agent-work-dispatch-state.json");
const apiBase = process.env.LCC_API_BASE || "http://127.0.0.1:9001";
const minDispatchMinutes = Number(process.env.DISPATCH_MIN_MINUTES || 10);
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
  const looksBusy = /working|running|작업|진행|검증|비교|구현|빌드|cdp|benchmark|보고|수정|테스트/i.test(preview);
  const looksWaiting = /waiting|idle|대기|지시|blocked|막힘|next action|what should|무엇/i.test(preview);
  const shouldDispatch = active && staleDispatch && (!looksBusy || looksWaiting);
  return { preview, active, looksBusy, looksWaiting, staleDispatch, shouldDispatch, minutesSinceDispatch };
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
      taskId: task?.id || null,
      shouldDispatch: classification.shouldDispatch,
      reason: classification.looksWaiting ? "waiting-signal" : classification.staleDispatch ? "stale-or-unclear" : "recently-dispatched-or-busy"
    };

    if (classification.shouldDispatch && task) {
      await writePrompt(session.id, buildPrompt(session.id, plan, task, classification));
      dispatchState[session.id] = {
        lastDispatchAt: now,
        lastTaskId: task.id,
        lastReason: report.reason
      };
      report.dispatched = true;
    } else {
      report.dispatched = false;
    }
    reports.push(report);
  }

  dispatchState.updatedAt = new Date(now).toISOString();
  writeJson(statePath, dispatchState);
  console.log(JSON.stringify({ ok: true, apiBase, minDispatchMinutes, reports }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
