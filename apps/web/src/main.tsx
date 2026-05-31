import {
  Activity,
  AlertTriangle,
  Bot,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Flag,
  LayoutGrid,
  Maximize2,
  MessageSquare,
  NotebookText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTopClose,
  PanelTopOpen,
  Plus,
  RefreshCw,
  Send,
  ScrollText,
  Square,
  Terminal,
  Trash2,
  Users,
  X
} from "lucide-react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TERMINAL_PROMPT_SUBMIT_KEY, encodePromptForPtySubmit, normalizePromptForSubmit } from "./terminalPrompt";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";

type SessionStatus = "active" | "exited" | "error" | "stopped";

type Session = {
  id: string;
  name: string;
  team: string;
  cwd: string;
  cmd: string;
  args: string[];
  model?: string;
  status: SessionStatus;
  pid?: number;
  created_at: string;
  updated_at: string;
  exit_code?: number;
  preview: string;
};

const SESSION_GROUPS = [
  {
    filter: "spring-msa-tf",
    label: "SpringMSA TF",
    members: [
      { id: "chief-min", name: "Chief Min", role: "Context and TF coordination", session: true },
      { id: "joon-msa", name: "Joon MSA", role: "MSA study owner", session: true },
      { id: "spring-msa-research-1", name: "Researcher 1", role: "Spring MSA researcher", session: true },
      { id: "spring-msa-research-2", name: "Researcher 2", role: "Spring MSA researcher", session: true },
      { id: "spring-msa-research-3", name: "Researcher 3", role: "Spring MSA researcher", session: true },
      { id: "spring-msa-research-4", name: "Researcher 4", role: "Spring MSA researcher", session: true }
    ]
  },
  {
    filter: "development-team",
    label: "Development Team",
    members: [
      { id: "chief-min", name: "Chief Min", role: "Context and coordination", session: true },
      { id: "dev-lead", name: "Dev Lead", role: "Development lead", session: true },
      { id: "developer-1", name: "Developer 1", role: "Developer", session: true },
      { id: "developer-2", name: "Developer 2", role: "Developer", session: true },
      { id: "developer-3", name: "Developer 3", role: "Developer", session: true },
      { id: "developer-4", name: "Developer 4", role: "Developer", session: true }
    ]
  }
];
const SESSION_GROUP_BY_FILTER = new Map(SESSION_GROUPS.map((group) => [group.filter, group]));
const MAX_ACTIVE_SESSIONS = 6;

type CanvasSection = {
  id: string;
  title: string;
  body: string;
};

type CanvasMessage = {
  id: string;
  author: string;
  body: string;
  created_at: string;
};

type Canvas = {
  id: string;
  title: string;
  owner: string;
  status: string;
  canvas_type: string;
  members: string[];
  linked_issues: string[];
  linked_meetings: string[];
  content: CanvasSection[];
  messages: CanvasMessage[];
  created_at: string;
  updated_at: string;
};

type PeerStatus = {
  role?: string;
  status?: string;
  connected?: boolean;
  peerId?: string;
  peers?: PeerInfo[];
};

type PeerInfo = {
  id?: string;
  role?: string;
  status?: string;
  connected?: boolean;
};

type PeerMessage = {
  id?: string;
  from?: string;
  to?: string;
  body?: string;
  text?: string;
  created_at?: string;
};

type WorkLedgerStatus = "todo" | "doing" | "blocked" | "done";

type WorkLedgerTask = {
  id: string;
  title: string;
  status?: WorkLedgerStatus | string;
  priority?: string | number;
  due_at?: string;
  reminder_minutes?: number;
  last_reminded_at?: string;
  notes?: string;
  updated_at?: string;
};

type WorkLedgerEvent = {
  id?: string;
  task_id?: string;
  kind?: string;
  body?: string;
  text?: string;
  at?: string;
  created_at?: string;
};

type WorkLedgerState = {
  tasks?: WorkLedgerTask[];
  events?: WorkLedgerEvent[];
};

const fallbackLedgerTasks: WorkLedgerTask[] = [
  {
    id: "year-end-tax-hourly-reminder",
    title: "연말정산 1시간마다 확인",
    status: "doing",
    priority: 1,
    due_at: "Today",
    reminder_minutes: 60
  },
  {
    id: "spring-msa-study-2000",
    title: "스프링 MSA 스터디 20:00",
    status: "todo",
    priority: 2,
    due_at: "20:00 KST",
    reminder_minutes: 30
  },
  {
    id: "heungkuk-android-final-package",
    title: "흥국생명 안드로이드 최종본 구성",
    status: "todo",
    priority: 1,
    due_at: "Today",
    reminder_minutes: 60
  }
];

const api = {
  async get<T>(path: string): Promise<T> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  async send<T>(path: string, method: string, body?: unknown): Promise<T> {
    const nextBody = normalizeSessionWriteBody(path, body);
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: nextBody === undefined ? undefined : JSON.stringify(nextBody)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
};

function sendTerminalProtocol(sessionId: string, payload: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);
    const timeout = window.setTimeout(() => {
      socket.close();
      reject(new Error("terminal input timed out"));
    }, 5000);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ sessionId, ...payload }));
      window.setTimeout(() => {
        window.clearTimeout(timeout);
        socket.close();
        resolve();
      }, 150);
    });
    socket.addEventListener("error", () => {
      window.clearTimeout(timeout);
      reject(new Error("terminal input socket failed"));
    });
  });
}

function sendTerminalInput(sessionId: string, data: string) {
  return sendTerminalProtocol(sessionId, { type: "input", data });
}

function waitForTerminalInputFlush() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 300));
}

async function sendTerminalPrompt(sessionId: string, prompt: string) {
  const body = normalizePromptForSubmit(prompt).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (body) {
    await sendTerminalInput(sessionId, body);
    await waitForTerminalInputFlush();
  }
  return sendTerminalInput(sessionId, TERMINAL_PROMPT_SUBMIT_KEY);
}

function normalizeSessionWriteBody(path: string, body: unknown) {
  if (!/^\/api\/sessions\/[^/]+\/write$/.test(path) || !body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }
  const next = { ...(body as Record<string, unknown>) };
  for (const key of ["input", "data", "prompt"]) {
    if (typeof next[key] === "string") {
      next[key] = normalizePromptForSubmit(next[key]);
    }
  }
  return next;
}

function isStandaloneLedgerView() {
  const params = new URLSearchParams(window.location.search);
  return params.get("view") === "ledger" || window.location.hash === "#/ledger";
}

function App() {
  return isStandaloneLedgerView() ? <WorkLedgerPage /> : <ShellApp />;
}

function ShellApp() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState<string>("");
  const [view, setView] = useState<"terminals" | "canvas">("terminals");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [topbarCollapsed, setTopbarCollapsed] = useState(false);

  const selectedCanvas = canvases.find((canvas) => canvas.id === selectedCanvasId) ?? canvases[0];

  async function refresh() {
    const [nextSessions, nextCanvases] = await Promise.all([
      api.get<Session[]>("/api/sessions"),
      api.get<Canvas[]>("/api/canvases")
    ]);
    setSessions(nextSessions);
    setCanvases(nextCanvases);
    if (!selectedCanvasId && nextCanvases[0]) setSelectedCanvasId(nextCanvases[0].id);
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
    const timer = window.setInterval(() => refresh().catch(() => undefined), 2500);
    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/terminal`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "sessionCreated" || message.type === "sessionDeleted" || message.type === "exit") {
        refresh().catch(() => undefined);
      }
    };
    return () => {
      window.clearInterval(timer);
      socket.close();
    };
  }, []);

  const visibleSessions = useMemo(() => {
    const selectedGroup = SESSION_GROUP_BY_FILTER.get(filter);
    const filtered =
      selectedGroup
        ? sessions.filter((session) => selectedGroup.members.some((member) => member.session && member.id === session.id))
        : filter === "all"
          ? sessions
          : sessions.filter((session) => session.team === filter || session.status === filter);
    return [...filtered].sort((a, b) => agentRank(a.id) - agentRank(b.id) || a.name.localeCompare(b.name));
  }, [filter, sessions]);

  const teams = useMemo(() => [...new Set(sessions.map((session) => session.team).filter(Boolean))], [sessions]);
  const sessionIds = useMemo(() => new Set(sessions.map((session) => session.id)), [sessions]);

  return (
    <main className={`shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${topbarCollapsed ? "topbar-collapsed" : ""}`}>
      <div className="viewport-controls" aria-label="Viewport controls">
        <button
          className="icon"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <button
          className="icon"
          onClick={() => setTopbarCollapsed((collapsed) => !collapsed)}
          title={topbarCollapsed ? "Show header" : "Hide header"}
        >
          {topbarCollapsed ? <PanelTopOpen size={16} /> : <PanelTopClose size={16} />}
        </button>
      </div>
      <PeerDock />
      <WorkLedgerDock />
      <aside className="sidebar">
        <div className="brand">
          <Boxes size={26} />
          <div>
            <strong>LUCAS LCC</strong>
            <span>Core v0.1</span>
          </div>
        </div>
        <nav className="rail">
          <button className={view === "terminals" ? "active" : ""} onClick={() => setView("terminals")} title="Terminals">
            <Terminal size={19} />
          </button>
          <button className={view === "canvas" ? "active" : ""} onClick={() => setView("canvas")} title="Canvas">
            <FileText size={19} />
          </button>
        </nav>
        <section className="side-section">
          <header>
            <span>Sessions</span>
            <strong>{sessions.length}</strong>
          </header>
          <button className={`filter ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
            <Activity size={14} /> All
          </button>
          <button className={`filter ${filter === "active" ? "active" : ""}`} onClick={() => setFilter("active")}>
            <span className="dot green" /> Active
          </button>
          {SESSION_GROUPS.map((group) => {
            const liveCount = group.members.filter((member) => member.session && sessionIds.has(member.id)).length;
            const sessionCount = group.members.filter((member) => member.session).length;
            return (
              <div className="session-group" key={group.filter}>
                <button className={`filter group-filter ${filter === group.filter ? "active" : ""}`} onClick={() => setFilter(group.filter)}>
                  <Users size={14} /> {group.label} <strong>{liveCount}/{sessionCount}</strong>
                </button>
                <div className="group-members" aria-label={`${group.label} members`}>
                  {group.members.map((member) => (
                    <span key={member.id} className={member.session && sessionIds.has(member.id) ? "online" : "offline"} title={member.role}>
                      {member.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          {teams.map((team) => (
            <button className={`filter ${filter === team ? "active" : ""}`} key={team} onClick={() => setFilter(team)}>
              <span className="dot" /> {team}
            </button>
          ))}
        </section>
        <section className="side-section">
          <header>
            <span>Canvases</span>
            <strong>{canvases.length}</strong>
          </header>
          {canvases.slice(0, 8).map((canvas) => (
            <button
              className={`canvas-link ${selectedCanvas?.id === canvas.id ? "active" : ""}`}
              key={canvas.id}
              onClick={() => {
                setSelectedCanvasId(canvas.id);
                setView("canvas");
              }}
            >
              {canvas.title}
            </button>
          ))}
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{view === "terminals" ? "Terminal Fleet" : "Canvas Workspace"}</h1>
            <p>
              {sessions.filter((session) => session.status === "active").length} active sessions · {canvases.length} canvases ·
              local control plane
            </p>
          </div>
          <div className="top-actions">
            <button onClick={() => setView("terminals")} className={view === "terminals" ? "primary" : ""}>
              <LayoutGrid size={16} /> Grid
            </button>
            <button onClick={() => setView("canvas")} className={view === "canvas" ? "primary" : ""}>
              <MessageSquare size={16} /> Canvas
            </button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        {view === "terminals" ? (
          <>
            <CreateSession sessions={sessions} onCreated={refresh} />
            <TerminalGrid sessions={visibleSessions} allSessions={sessions} onChanged={refresh} />
          </>
        ) : (
          <CanvasWorkspace
            canvas={selectedCanvas}
            sessions={sessions}
            onChanged={async () => {
              await refresh();
            }}
          />
        )}
      </section>
    </main>
  );
}

function PeerDock() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PeerStatus>({ role: "local", status: "disconnected", connected: false });
  const [messages, setMessages] = useState<PeerMessage[]>([]);
  const [target, setTarget] = useState("hq");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function loadPeerState() {
    try {
      setStatus(await api.get<PeerStatus>("/api/peer/status"));
    } catch {
      setStatus({ role: "local", status: "disconnected", connected: false });
    }

    try {
      const nextMessages = await api.get<PeerMessage[]>("/api/peer/messages");
      setMessages(Array.isArray(nextMessages) ? nextMessages : []);
    } catch {
      setMessages([]);
    }
  }

  useEffect(() => {
    loadPeerState().catch(() => undefined);
    const timer = window.setInterval(() => loadPeerState().catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function sendPeerMessage(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await api.send("/api/peer/messages", "POST", { from: status.role ?? "branch", to: target, kind: "status", body: draft });
      setDraft("");
      await loadPeerState();
    } catch {
      setStatus((current) => ({ ...current, status: "disconnected", connected: false }));
    } finally {
      setSending(false);
    }
  }

  const peers = status.peers ?? [];
  const connected = status.connected ?? ["connected", "online", "ready"].includes((status.status ?? "").toLowerCase());
  const role = status.role ?? "local";
  const statusText = connected ? status.status ?? "connected" : "disconnected";
  const recentMessages = messages.slice(-5).reverse();
  const peerTargets = peers
    .map((peer) => peer.id ?? peer.role)
    .filter((peer): peer is string => Boolean(peer));

  return (
    <div className={`peer-dock ${open ? "open" : ""}`}>
      <button className="peer-pill" onClick={() => setOpen((next) => !next)} title="HQ/Branch link" aria-expanded={open}>
        <Activity size={14} />
        <span className={`peer-dot ${connected ? "online" : ""}`} />
        <strong>{role}</strong>
        <span>{statusText}</span>
        {messages.length > 0 && <em>{messages.length}</em>}
      </button>
      {open && (
        <section className="peer-drawer">
          <header>
            <span>
              <Users size={14} /> HQ/Branch
            </span>
            <strong>{connected ? "online" : "offline"}</strong>
          </header>
          <div className="peer-inbox">
            {recentMessages.length === 0 ? (
              <p>No peer messages</p>
            ) : (
              recentMessages.map((message, index) => (
                <div key={message.id ?? `${message.created_at ?? "message"}-${index}`}>
                  <strong>{message.from ?? "peer"}</strong>
                  <p>{message.body ?? message.text ?? ""}</p>
                </div>
              ))
            )}
          </div>
          <form className="peer-composer" onSubmit={sendPeerMessage}>
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="hq">HQ</option>
              <option value="branches">Branches</option>
              {peerTargets.map((peer) => (
                <option key={peer} value={peer}>
                  {peer}
                </option>
              ))}
            </select>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="본부/지사 메시지" />
            <button className="primary icon" disabled={!draft.trim() || sending} title="전송">
              <Send size={15} />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function WorkLedgerPage() {
  const [tasks, setTasks] = useState<WorkLedgerTask[]>(fallbackLedgerTasks);
  const [events, setEvents] = useState<WorkLedgerEvent[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState(fallbackLedgerTasks[0].id);
  const [activeTab, setActiveTab] = useState<"overview" | "plans" | "events">("overview");
  const [note, setNote] = useState("");
  const [apiReady, setApiReady] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadLedger() {
    try {
      const ledger = await api.get<WorkLedgerState>("/api/work-ledger");
      const nextTasks = normalizeLedgerTasks(ledger.tasks);
      setTasks(nextTasks);
      setEvents(ledger.events ?? []);
      setSelectedTaskId((current) => (nextTasks.some((task) => task.id === current) ? current : nextTasks[0]?.id ?? fallbackLedgerTasks[0].id));
      setApiReady(true);
    } catch {
      setTasks((current) => (current.length ? current : fallbackLedgerTasks));
      setEvents([]);
      setApiReady(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.body.classList.add("ledger-mode");
    loadLedger().catch(() => undefined);
    const timer = window.setInterval(() => loadLedger().catch(() => undefined), 15000);
    return () => {
      document.body.classList.remove("ledger-mode");
      window.clearInterval(timer);
    };
  }, []);

  async function updateTaskStatus(taskId: string, status: WorkLedgerStatus) {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)));
    try {
      await api.send(`/api/work-ledger/tasks/${encodeURIComponent(taskId)}`, "PUT", { status });
      await loadLedger();
    } catch {
      setApiReady(false);
    }
  }

  async function addTaskNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    const taskId = selectedTaskId || tasks[0]?.id;
    if (!taskId) return;
    const nextEvent = { id: `local-${Date.now()}`, task_id: taskId, kind: "note", body: note.trim(), at: new Date().toISOString() };
    setEvents((current) => [...current, nextEvent]);
    setNote("");
    try {
      await api.send(`/api/work-ledger/tasks/${encodeURIComponent(taskId)}/events`, "POST", { kind: "note", body: nextEvent.body });
      await loadLedger();
      setActiveTab("events");
    } catch {
      setApiReady(false);
    }
  }

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
  const doneCount = tasks.filter((task) => normalizeTaskStatus(task.status) === "done").length;
  const doingCount = tasks.filter((task) => normalizeTaskStatus(task.status) === "doing").length;
  const blockedCount = tasks.filter((task) => normalizeTaskStatus(task.status) === "blocked").length;
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const selectedEvents = events.filter((event) => !selectedTask?.id || !event.task_id || event.task_id === selectedTask.id).slice(-8).reverse();
  const todayLabel = new Date().toLocaleDateString("ko-KR", { weekday: "short", month: "long", day: "numeric" });

  return (
    <main className="ledger-page">
      <header className="ledger-page-header">
        <div>
          <span className="ledger-kicker">
            <ClipboardList size={15} /> 업무 원장
          </span>
          <h1>오늘 업무 원장</h1>
          <p>{todayLabel} / 관리 항목 {tasks.length}개 / {apiReady ? "동기화됨" : "로컬 표시"}</p>
        </div>
        <div className="ledger-header-metrics">
          <div>
            <span>진행률</span>
            <strong>{progress}%</strong>
          </div>
          <div>
            <span>진행중</span>
            <strong>{doingCount}</strong>
          </div>
          <div>
            <span>막힘</span>
            <strong>{blockedCount}</strong>
          </div>
          <button className="icon" onClick={() => loadLedger().catch(console.error)} title="원장 새로고침">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <section className="ledger-plan-strip" aria-label="오늘 계획">
        {tasks.slice(0, 3).map((task) => {
          const status = normalizeTaskStatus(task.status);
          return (
            <button
              key={task.id}
              className={`ledger-plan-chip ${status} ${selectedTask?.id === task.id ? "selected" : ""}`}
              onClick={() => setSelectedTaskId(task.id)}
            >
              <Flag size={14} />
              <span>{task.title}</span>
              <strong>{formatTaskTiming(task)}</strong>
            </button>
          );
        })}
      </section>

      <section className="ledger-ops-grid">
        <aside className="ledger-task-list">
          <div className="ledger-section-title">
            <span>오늘 해야 할 일</span>
            <strong>{loading ? "불러오는 중" : `${doneCount}/${tasks.length} 완료`}</strong>
          </div>
          {tasks.map((task) => {
            const status = normalizeTaskStatus(task.status);
            return (
              <article
                key={task.id}
                className={`ledger-row ${status} ${selectedTask?.id === task.id ? "selected" : ""}`}
                onClick={() => setSelectedTaskId(task.id)}
              >
                <div className="ledger-row-main">
                  <span className="ledger-status-mark" />
                  <div>
                    <strong>{task.title}</strong>
                    <p>{formatTaskTiming(task)}</p>
                  </div>
                </div>
                <div className="ledger-status-controls" onClick={(event) => event.stopPropagation()}>
                  {(["todo", "doing", "blocked", "done"] as WorkLedgerStatus[]).map((statusOption) => (
                    <button
                      key={statusOption}
                      className={status === statusOption ? "active" : ""}
                      onClick={() => updateTaskStatus(task.id, statusOption).catch(console.error)}
                      title={`${formatStatusLabel(statusOption)}로 변경`}
                    >
                      {formatStatusLabel(statusOption)}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </aside>

        <section className="ledger-detail-pane">
          {selectedTask ? (
            <>
              <div className="ledger-detail-head">
                <div>
                  <span className={`ledger-status-badge ${normalizeTaskStatus(selectedTask.status)}`}>
                    {formatStatusLabel(normalizeTaskStatus(selectedTask.status))}
                  </span>
                  <h2>{selectedTask.title}</h2>
                  <p>{formatTaskTiming(selectedTask)} / 우선순위 {selectedTask.priority ?? "없음"}</p>
                </div>
                {normalizeTaskStatus(selectedTask.status) === "blocked" && <AlertTriangle size={18} />}
              </div>

              <div className="ledger-page-tabs">
                {(["overview", "plans", "events"] as const).map((tab) => (
                  <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
                    {tab === "overview" ? <LayoutGrid size={15} /> : tab === "plans" ? <NotebookText size={15} /> : <ScrollText size={15} />}
                    {formatLedgerTabLabel(tab)}
                  </button>
                ))}
              </div>

              {activeTab === "overview" && (
                <>
                  <div className="ledger-notes-box">
                    <span>업무 메모</span>
                    <p>{selectedTask.notes?.trim() || "아직 저장된 업무 메모가 없습니다."}</p>
                  </div>
                  <div className="ledger-detail-grid">
                    <div>
                      <dt>상태</dt>
                      <dd>{formatStatusLabel(normalizeTaskStatus(selectedTask.status))}</dd>
                    </div>
                    <div>
                      <dt>기한</dt>
                      <dd>{formatDueAt(selectedTask.due_at)}</dd>
                    </div>
                    <div>
                      <dt>알림</dt>
                      <dd>{selectedTask.reminder_minutes ? `${selectedTask.reminder_minutes}분마다` : "없음"}</dd>
                    </div>
                    <div>
                      <dt>갱신</dt>
                      <dd>{formatDueAt(selectedTask.updated_at)}</dd>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "plans" && (
                <div className="ledger-plan-list">
                  {tasks.map((task) => (
                    <div key={task.id}>
                      <strong>{task.title}</strong>
                      <span>{formatTaskTiming(task)}</span>
                      <em>{formatStatusLabel(normalizeTaskStatus(task.status))}</em>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "events" && (
                <>
                  <div className="ledger-events-head">
                    <span>진행 기록</span>
                    <strong>{selectedEvents.length}</strong>
                  </div>
                  <div className="ledger-event-list">
                    {selectedEvents.length === 0 ? (
                      <p className="ledger-empty">아직 이 업무의 진행 기록이 없습니다.</p>
                    ) : (
                      selectedEvents.map((item, index) => (
                        <article key={item.id ?? `${item.at ?? item.created_at ?? "event"}-${index}`}>
                          <span>{item.kind ?? "event"} / {formatEventTime(item)}</span>
                          <p>{item.body ?? item.text ?? ""}</p>
                        </article>
                      ))
                    )}
                  </div>
                </>
              )}

              <form className="ledger-page-note" onSubmit={addTaskNote}>
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="진행 내용, 결정사항, 막힌 점을 기록" />
                <button className="primary" disabled={!note.trim()}>
                  <Plus size={15} /> 기록 추가
                </button>
              </form>
            </>
          ) : (
            <p className="ledger-empty">선택된 업무가 없습니다.</p>
          )}
        </section>
      </section>
    </main>
  );
}

function WorkLedgerDock() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<WorkLedgerTask[]>(fallbackLedgerTasks);
  const [events, setEvents] = useState<WorkLedgerEvent[]>([]);
  const [note, setNote] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(fallbackLedgerTasks[0].id);
  const [apiReady, setApiReady] = useState(false);

  async function loadLedger() {
    try {
      const ledger = await api.get<WorkLedgerState>("/api/work-ledger");
      setApiReady(true);
      const nextTasks = normalizeLedgerTasks(ledger.tasks);
      setTasks(nextTasks);
      setSelectedTaskId((current) => (nextTasks.some((task) => task.id === current) ? current : nextTasks[0]?.id ?? fallbackLedgerTasks[0].id));
      setEvents((ledger.events ?? []).slice(-6));
    } catch {
      setApiReady(false);
      setTasks((current) => (current.length ? current : fallbackLedgerTasks));
      setEvents([]);
    }
  }

  useEffect(() => {
    loadLedger().catch(() => undefined);
    const timer = window.setInterval(() => loadLedger().catch(() => undefined), 10000);
    return () => window.clearInterval(timer);
  }, []);

  async function updateTask(taskId: string, status: WorkLedgerStatus) {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)));
    try {
      await api.send(`/api/work-ledger/tasks/${encodeURIComponent(taskId)}`, "PUT", { status });
      await loadLedger();
    } catch {
      setApiReady(false);
    }
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    const taskId = selectedTaskId || tasks[0]?.id;
    if (!taskId) return;
    const nextNote = { id: `local-${Date.now()}`, task_id: taskId, kind: "note", body: note, at: new Date().toISOString() };
    setEvents((current) => [...current, nextNote].slice(-6));
    setNote("");
    try {
      await api.send(`/api/work-ledger/tasks/${encodeURIComponent(taskId)}/events`, "POST", { kind: "note", body: nextNote.body });
      await loadLedger();
    } catch {
      setApiReady(false);
    }
  }

  const doneCount = tasks.filter((task) => normalizeTaskStatus(task.status) === "done").length;

  return (
    <div className={`ledger-dock ${open ? "open" : ""}`}>
      <button className="ledger-tab" onClick={() => setOpen((next) => !next)} title="업무 원장" aria-expanded={open}>
        <CalendarCheck size={15} />
        <span>원장</span>
        <strong>
          {doneCount}/{tasks.length}
        </strong>
      </button>
      {open && (
        <section className="ledger-panel">
          <header>
            <span>
              <NotebookText size={14} /> 오늘
            </span>
            <strong>{apiReady ? "동기화" : "로컬"}</strong>
          </header>
          <div className="ledger-tasks">
            {tasks.slice(0, 3).map((task) => {
              const status = normalizeTaskStatus(task.status);
              return (
                <article
                  key={task.id}
                  className={`ledger-task ${status} ${selectedTaskId === task.id ? "selected" : ""}`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <div>
                    <strong>{task.title}</strong>
                    <span>
                      <Clock3 size={12} /> {formatTaskTiming(task)}
                    </span>
                  </div>
                  <div className="ledger-actions">
                    <button
                      className={status === "doing" ? "active" : ""}
                      onClick={(event) => {
                        event.stopPropagation();
                        updateTask(task.id, "doing").catch(console.error);
                      }}
                      title="진행중으로 변경"
                    >
                      <Activity size={12} />
                    </button>
                    <button
                      className={status === "done" ? "active" : ""}
                      onClick={(event) => {
                        event.stopPropagation();
                        updateTask(task.id, "done").catch(console.error);
                      }}
                      title="완료로 변경"
                    >
                      <CheckCircle2 size={12} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="ledger-events">
            {events.length === 0 ? (
              <p>원장 기록이 없습니다</p>
            ) : (
              events.slice(-3).map((event, index) => <p key={event.id ?? `${event.created_at ?? "event"}-${index}`}>{event.body ?? event.text}</p>)
            )}
          </div>
          <form className="ledger-note" onSubmit={addNote}>
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="기록 또는 막힌 점" />
            <button className="primary icon" disabled={!note.trim()} title="기록 추가">
              <Plus size={15} />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function normalizeLedgerTasks(tasks: WorkLedgerTask[] | undefined) {
  if (!Array.isArray(tasks) || tasks.length === 0) return fallbackLedgerTasks;
  return tasks.slice(0, 3).map((task, index) => ({
    ...fallbackLedgerTasks[index],
    ...task,
    id: task.id ?? fallbackLedgerTasks[index]?.id ?? `task-${index}`
  }));
}

function normalizeTaskStatus(status: WorkLedgerTask["status"]): WorkLedgerStatus {
  if (status === "todo" || status === "doing" || status === "blocked" || status === "done") return status;
  return "todo";
}

function formatStatusLabel(status: WorkLedgerStatus) {
  switch (status) {
    case "doing":
      return "진행";
    case "blocked":
      return "막힘";
    case "done":
      return "완료";
    default:
      return "대기";
  }
}

function formatLedgerTabLabel(tab: "overview" | "plans" | "events") {
  switch (tab) {
    case "plans":
      return "계획";
    case "events":
      return "기록";
    default:
      return "요약";
  }
}

function formatTaskTiming(task: WorkLedgerTask) {
  const due = formatDueAt(task.due_at);
  const reminder = typeof task.reminder_minutes === "number" ? `${task.reminder_minutes}분마다 알림` : "";
  return [due, reminder].filter(Boolean).join(" / ") || "알림 없음";
}

function formatDueAt(dueAt: string | undefined) {
  if (!dueAt) return "기한 없음";
  if (dueAt === "Today") return "오늘";
  if (dueAt.includes("KST")) return dueAt.replace("Today", "오늘");
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return dueAt;
  return date.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatEventTime(event: WorkLedgerEvent) {
  return formatDueAt(event.at ?? event.created_at);
}

function CreateSession({ sessions, onCreated }: { sessions: Session[]; onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", team: "lcc", cwd: ".", cmd: defaultShell(), args: "" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await api.send("/api/sessions", "POST", {
      ...form,
      args: form.args.trim() ? form.args.split(" ").filter(Boolean) : []
    });
    setOpen(false);
    await onCreated();
  }

  async function spawnDevTeam() {
    const cmd = "codex.cmd";
    const model = "gpt-5.5";
    const existing = new Set(sessions.map((session) => session.id));
    const activeCount = sessions.filter((session) => session.status === "active").length;
    const availableSlots = Math.max(0, MAX_ACTIVE_SESSIONS - activeCount);
    const agents = standardDevAgents(cmd, model).filter((agent) => !existing.has(agent.id)).slice(0, availableSlots);

    for (const agent of agents) {
      await api.send("/api/sessions", "POST", agent);
    }
    await onCreated();
  }

  if (!open) {
    return (
      <div className="toolbar">
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={16} /> Agent
        </button>
        <button onClick={spawnDevTeam}>
          <Bot size={16} /> Dev Team
        </button>
        <span>Spawn one dev lead and four GPT-5.5 Codex developers in isolated workspaces.</span>
      </div>
    );
  }

  return (
    <form className="agent-form" onSubmit={submit}>
      <input placeholder="id" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} />
      <input placeholder="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <input placeholder="team" value={form.team} onChange={(event) => setForm({ ...form, team: event.target.value })} />
      <input placeholder="cwd" value={form.cwd} onChange={(event) => setForm({ ...form, cwd: event.target.value })} />
      <input placeholder="cmd" value={form.cmd} onChange={(event) => setForm({ ...form, cmd: event.target.value })} />
      <input placeholder="args" value={form.args} onChange={(event) => setForm({ ...form, args: event.target.value })} />
      <button className="primary" type="submit">
        <Plus size={16} /> Create
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

function TerminalGrid({
  sessions,
  allSessions,
  onChanged
}: {
  sessions: Session[];
  allSessions: Session[];
  onChanged: () => Promise<void>;
}) {
  const columns = sessions.length <= 1 ? 1 : sessions.length <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(sessions.length / columns));
  const gridStyle = {
    "--grid-cols": columns,
    "--grid-rows": rows
  } as React.CSSProperties;

  return (
    <div className="terminal-grid" style={gridStyle}>
      {sessions.map((session) => (
        <TerminalCard key={session.id} session={session} sessions={allSessions} onChanged={onChanged} />
      ))}
    </div>
  );
}

function TerminalCard({
  session,
  sessions,
  onChanged
}: {
  session: Session;
  sessions: Session[];
  onChanged: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [target, setTarget] = useState(session.id);
  const [logOpen, setLogOpen] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [logText, setLogText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const promptRef = useRef("");
  const sendingRef = useRef(false);

  function handlePromptChange(value: string) {
    promptRef.current = value;
    setPrompt(value);
  }

  async function send() {
    const nextPrompt = normalizePromptForSubmit(promptRef.current);
    if (!nextPrompt.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    const payload = target === session.id ? nextPrompt : `[FROM ${session.id} TO ${target}] ${nextPrompt}`;
    try {
      await sendTerminalPrompt(target, payload);
      promptRef.current = "";
      setPrompt("");
      await onChanged();
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }

  async function openLog() {
    const response = await fetch(`/api/sessions/${session.id}/log`);
    setLogText(await response.text());
    setLogOpen(true);
  }

  async function stop() {
    if (!confirm(`${session.name} 세션을 중지할까요?`)) return;
    await api.send(`/api/sessions/${session.id}`, "DELETE");
    await onChanged();
  }

  return (
    <article className={`terminal-card ${session.status}`}>
      <header>
        <div>
          <span className="status-dot" />
          <strong>{session.name}</strong>
          <em>{session.team}</em>
          {session.model && <em>{session.model}</em>}
        </div>
        <div className="card-actions">
          <button title="터미널 크게 보기" onClick={() => setFullscreenOpen(true)}>
            <Maximize2 size={13} />
          </button>
          <button title="터미널 로그" onClick={openLog}>
            <ScrollText size={13} />
          </button>
          <button title="중지" onClick={stop}>
            <Square size={13} />
          </button>
          <button title="삭제" onClick={stop}>
            <Trash2 size={13} />
          </button>
        </div>
      </header>
      <XtermPreview sessionId={session.id} status={session.status} />
      <footer aria-busy={isSending}>
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          {sessions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <textarea
          rows={1}
          value={prompt}
          onChange={(event) => handlePromptChange(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send().catch(console.error);
            }
          }}
          placeholder="지시 입력"
        />
        <button className="primary icon" onClick={send} title="전송">
          <Send size={15} />
        </button>
      </footer>
      <div className="workspace-path">{session.cwd}</div>
      {fullscreenOpen && (
        <FullscreenTerminalModal session={session} sessions={sessions} onClose={() => setFullscreenOpen(false)} onChanged={onChanged} />
      )}
      {logOpen && (
        <div className="log-modal" role="dialog" aria-modal="true">
          <div className="log-panel">
            <header>
              <strong>{session.name} 터미널 로그</strong>
              <button onClick={() => setLogOpen(false)}>닫기</button>
            </header>
            <TerminalLogView text={logText || "아직 이 세션에 저장된 로그가 없습니다. 로그 기능이 켜진 뒤 세션을 다시 시작해야 합니다.\r\n"} />
          </div>
        </div>
      )}
    </article>
  );
}

function FullscreenTerminalModal({
  session,
  sessions,
  onClose,
  onChanged
}: {
  session: Session;
  sessions: Session[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [target, setTarget] = useState(session.id);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const promptRef = useRef("");
  const sendingRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function send() {
    const nextPrompt = normalizePromptForSubmit(promptRef.current);
    if (!nextPrompt.trim() || sendingRef.current) return;
    sendingRef.current = true;
    const payload = target === session.id ? nextPrompt : `[FROM ${session.id} TO ${target}] ${nextPrompt}`;
    try {
      await sendTerminalPrompt(target, payload);
      promptRef.current = "";
      setPrompt("");
      await onChanged();
    } finally {
      sendingRef.current = false;
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    event.stopPropagation();
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing) return;
    if (event.shiftKey) return;

    event.preventDefault();
    send().catch(console.error);
  }

  return (
    <div className="terminal-fullscreen-modal" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <section className={`terminal-fullscreen-panel ${session.status}`} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="status-dot" />
            <strong>{session.name}</strong>
            <em>{session.status}</em>
            <em>{session.team}</em>
            {session.model && <em>{session.model}</em>}
          </div>
          <button className="icon" onClick={onClose} title="크게 보기 닫기">
            <X size={16} />
          </button>
        </header>
        <XtermPreview sessionId={session.id} status={session.status} variant="fullscreen" />
        <footer>
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(event) => {
              promptRef.current = event.target.value;
              setPrompt(event.target.value);
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder="지시 입력"
          />
          <button className="primary icon" onClick={send} title="전송">
            <Send size={15} />
          </button>
        </footer>
        <div className="workspace-path">{session.cwd}</div>
      </section>
    </div>
  );
}

function XtermPreview({
  sessionId,
  status,
  variant = "card"
}: {
  sessionId: string;
  status: SessionStatus;
  variant?: "card" | "fullscreen";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const attachedRef = useRef(false);
  const inputQueueRef = useRef<string[]>([]);
  const lastDimsRef = useRef({ cols: 0, rows: 0 });
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontSize: variant === "fullscreen" ? 13 : 12,
      fontFamily:
        "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, 'Segoe UI Symbol', 'Noto Sans Symbols 2', monospace",
      fontWeight: 400,
      fontWeightBold: 700,
      drawBoldTextInBrightColors: false,
      cursorBlink: status === "active",
      scrollback: variant === "fullscreen" ? 500 : 200,
      convertEol: true,
      allowProposedApi: true,
      theme: {
        background: "#070c15",
        foreground: "#e2e8f0",
        cursor: "#60a5fa",
        selectionBackground: "#334155",
        black: "#1e293b",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#f1f5f9",
        brightBlack: "#475569",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde047",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f8fafc"
      }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    term.focus();
    termRef.current = term;
    fitRef.current = fit;

    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/terminal`);
    socketRef.current = socket;
    const scrollToBottomSoon = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        term.scrollToBottom();
      });
    };
    const sendSocket = (payload: unknown) => {
      const text = JSON.stringify(payload);
      if (socket.readyState === WebSocket.OPEN) socket.send(text);
      else socket.addEventListener("open", () => socket.send(text), { once: true });
    };
    socket.addEventListener("open", () => {
      attachedRef.current = false;
      inputQueueRef.current = [];
      term.reset();
      try {
        fit.fit();
      } catch {}
      lastDimsRef.current = { cols: term.cols, rows: term.rows };
      sendSocket({ type: "attach", sessionId, requestReplay: true, cols: term.cols, rows: term.rows });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const messageSessionId = message.sessionId ?? message.session_id;
      if (messageSessionId && messageSessionId !== sessionId) return;
      if (message.type === "attached") {
        attachedRef.current = true;
        const queue = inputQueueRef.current.splice(0);
        for (const data of queue) sendSocket({ type: "input", sessionId, data });
      }
      if (message.type === "replay") {
        term.write(message.data ?? "");
        scrollToBottomSoon();
      }
      if (message.type === "output") {
        term.write(message.data ?? "");
        scrollToBottomSoon();
      }
      if (message.type === "exit") {
        term.write(`\r\n\x1b[31m[Process exited]\x1b[0m\r\n`);
      }
    });
    const dataDisposable = term.onData((data) => {
      const processed = data.includes("\n") ? data.replace(/\n/g, "\r") : data;
      if (!attachedRef.current) {
        inputQueueRef.current.push(processed);
        return;
      }
      sendSocket({ type: "input", sessionId, data: processed });
    });
    term.element?.addEventListener("mousedown", () => term.focus());

    const fitNow = () => {
      try {
        fit.fit();
        const dims = { cols: term.cols, rows: term.rows };
        const last = lastDimsRef.current;
        if (dims.cols !== last.cols || dims.rows !== last.rows) {
          lastDimsRef.current = dims;
          sendSocket({ type: "resize", sessionId, cols: dims.cols, rows: dims.rows });
        }
      } catch {
        // xterm can throw during first zero-size layout pass.
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(fitNow));
    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(fitNow));
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      dataDisposable.dispose();
      socket.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      socketRef.current = null;
      attachedRef.current = false;
      inputQueueRef.current = [];
    };
  }, [sessionId, variant]);

  return <div className={`xterm-preview ${variant === "fullscreen" ? "fullscreen" : ""}`} ref={containerRef} />;
}

function TerminalLogView({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
      scrollback: 1000,
      convertEol: true,
      cursorBlink: false,
      theme: {
        background: "#070c15",
        foreground: "#d8e2f1",
        cursor: "#60a5fa",
        selectionBackground: "#334155"
      }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    term.write(text);
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {}
      term.scrollToBottom();
    });

    return () => term.dispose();
  }, [text]);

  return <div className="log-terminal" ref={containerRef} />;
}

function CanvasWorkspace({
  canvas,
  sessions,
  onChanged
}: {
  canvas?: Canvas;
  sessions: Session[];
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<CanvasSection[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(canvas?.content ?? []);
  }, [canvas?.id]);

  async function createCanvas() {
    await api.send("/api/canvases", "POST", {
      title: `LCC Canvas ${new Date().toLocaleTimeString()}`,
      owner: "Lucas",
      members: sessions.slice(0, 3).map((session) => session.id)
    });
    await onChanged();
  }

  if (!canvas) {
    return (
      <div className="empty">
        <Bot size={32} />
        <h2>No canvas</h2>
        <button className="primary" onClick={createCanvas}>
          <Plus size={16} /> Canvas
        </button>
      </div>
    );
  }

  async function saveContent() {
    await api.send(`/api/canvases/${canvas.id}/content`, "PUT", draft);
    await onChanged();
  }

  async function addMessage() {
    if (!message.trim()) return;
    await api.send(`/api/canvases/${canvas.id}/messages`, "POST", { author: "Lucas", body: message });
    setMessage("");
    await onChanged();
  }

  async function invite(agent: string) {
    await api.send(`/api/canvases/${canvas.id}/invite`, "POST", { agent });
    await onChanged();
  }

  return (
    <div className="canvas-workspace">
      <section className="canvas-main">
        <header className="canvas-header">
          <div>
            <h2>{canvas.title}</h2>
            <p>{canvas.owner} · {canvas.canvas_type} · {canvas.status}</p>
          </div>
          <button className="primary" onClick={saveContent}>
            Save
          </button>
        </header>
        <div className="sections">
          {draft.map((section, index) => (
            <label className="section-editor" key={section.id}>
              <span>{section.title}</span>
              <textarea
                value={section.body}
                onChange={(event) => {
                  const next = [...draft];
                  next[index] = { ...section, body: event.target.value };
                  setDraft(next);
                }}
              />
            </label>
          ))}
        </div>
      </section>
      <aside className="canvas-side">
        <section>
          <h3>
            <Users size={16} /> Participants
          </h3>
          <div className="chips">
            {canvas.members.map((member) => (
              <span key={member}>{member}</span>
            ))}
          </div>
          <select onChange={(event) => event.target.value && invite(event.target.value)} defaultValue="">
            <option value="" disabled>
              Invite agent
            </option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        </section>
        <section>
          <h3>
            <MessageSquare size={16} /> Messages
          </h3>
          <div className="messages">
            {canvas.messages.map((item) => (
              <div key={item.id}>
                <strong>{item.author}</strong>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
          <div className="message-input">
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message" />
            <button className="primary icon" onClick={addMessage}>
              <Send size={15} />
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function defaultShell() {
  return navigator.userAgent.includes("Windows") ? "powershell.exe" : "bash";
}

function codexYoloArgs(model: string) {
  return ["--model", model, "--cd", ".", "--no-alt-screen", "--dangerously-bypass-approvals-and-sandbox"];
}

function standardDevAgents(cmd: string, model: string) {
  return [
    { id: "dev-lead", name: "Dev Lead", team: "development", cwd: "workspaces/dev-lead/repo", cmd, args: codexYoloArgs(model), model },
    ...Array.from({ length: 4 }, (_, index) => {
      const n = index + 1;
      return {
        id: `developer-${n}`,
        name: `Developer ${n}`,
        team: "development",
        cwd: `workspaces/developer-${n}/repo`,
        cmd,
        args: codexYoloArgs(model),
        model
      };
    })
  ];
}

function agentRank(id: string) {
  if (id === "dev-lead") return 0;
  const match = id.match(/^developer-(\d+)$/);
  if (match) return Number(match[1]);
  return 100;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
