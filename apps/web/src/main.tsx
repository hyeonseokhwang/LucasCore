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
import React, { FormEvent, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { normalizePromptForSubmit } from "./terminalPrompt";
import { tailStringByUtf8Bytes, tailTerminalLines } from "./terminalReplay";
import { isTerminalContainerReady } from "./terminalSurface";
import { clipboardItemsContainImage, readTerminalCardDraft, writeTerminalCardDraft } from "./terminalCardComposer";
import { shouldSubmitTerminalTileComposer, stopTerminalTileFooterMouseDown } from "./terminalTileFooter";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";

type SessionStatus = "active" | "exited" | "error" | "stopped";
type TerminalLayout = "grid" | "stack" | "columns" | "fit";

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
  preview_text?: string;
  preview_ansi?: string | null;
};

const SESSION_GROUPS = [
  {
    filter: "executive",
    label: "Executive",
    members: [
      { id: "ceo", name: "Caesar", role: "Supervisor", session: true },
      { id: "audit-officer", name: "Lux", role: "Audit supervisor", session: true },
      { id: "dev-lead", name: "Max", role: "Development lead", session: true },
      { id: "areum", name: "Areum", role: "Ledger secretary", session: true }
    ]
  },
  {
    filter: "spring-msa-tf",
    label: "SpringMSA TF",
    members: [
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
      { id: "dev-lead", name: "Max", role: "Development lead", session: true },
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `developer-${index + 1}`,
        name: `Developer ${index + 1}`,
        role: "Developer",
        session: true
      }))
    ]
  }
];
const SESSION_GROUP_BY_FILTER = new Map(SESSION_GROUPS.map((group) => [group.filter, group]));
const MAX_ACTIVE_SESSIONS = 20;
const VITE_ENV = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const API_ORIGIN = VITE_ENV.VITE_LCC_API_ORIGIN || window.location.origin;
const WS_ORIGIN =
  VITE_ENV.VITE_LCC_WS_ORIGIN ||
  API_ORIGIN.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
const TERMINAL_SCROLLBACK_LINES = 500;
const TERMINAL_PREVIEW_SCROLLBACK_LINES = 200;
const TERMINAL_PREVIEW_SEED_BYTES = 16 * 1024;
const TERMINAL_PREVIEW_CLEAR_PREFIX = "\x1b[2J\x1b[3J\x1b[H";
const HIDDEN_TERMINAL_TEAMS = new Set(["verification"]);
const activeTerminalComposerKeys = new Set<string>();
const terminalComposerSubscribers = new Set<() => void>();
function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

function terminalWsUrl() {
  return `${WS_ORIGIN}/ws/terminal`;
}

function closeWebSocket(socket: WebSocket | null) {
  if (!socket) return;
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.addEventListener("open", () => socket.close(), { once: true });
    return;
  }
  if (socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
}

function setTerminalComposerActive(key: string, active: boolean) {
  const sizeBefore = activeTerminalComposerKeys.size;
  if (active) activeTerminalComposerKeys.add(key);
  else activeTerminalComposerKeys.delete(key);
  if (activeTerminalComposerKeys.size !== sizeBefore) {
    terminalComposerSubscribers.forEach((listener) => listener());
  }
}

function hasActiveTerminalComposer() {
  return activeTerminalComposerKeys.size > 0;
}

function subscribeTerminalComposerActivity(listener: () => void) {
  terminalComposerSubscribers.add(listener);
  return () => terminalComposerSubscribers.delete(listener);
}

function useTerminalComposerActivity(key: string, active: boolean) {
  useEffect(() => {
    setTerminalComposerActive(key, active);
    return () => setTerminalComposerActive(key, false);
  }, [active, key]);
}

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

function sessionsMatch(prev: Session[], next: Session[]) {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let index = 0; index < prev.length; index += 1) {
    const a = prev[index];
    const b = next[index];
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.team !== b.team ||
      a.cwd !== b.cwd ||
      a.cmd !== b.cmd ||
      a.model !== b.model ||
      a.status !== b.status ||
      a.pid !== b.pid ||
      a.created_at !== b.created_at ||
      a.exit_code !== b.exit_code ||
      a.args.length !== b.args.length ||
      (!hasMeaningfulTerminalText(a.preview_text) && hasMeaningfulTerminalText(b.preview_text)) ||
      (!hasMeaningfulTerminalText(a.preview_ansi) && hasMeaningfulTerminalText(b.preview_ansi))
    ) {
      return false;
    }
    for (let argIndex = 0; argIndex < a.args.length; argIndex += 1) {
      if (a.args[argIndex] !== b.args[argIndex]) return false;
    }
  }
  return true;
}

function hasMeaningfulTerminalText(value: string | null | undefined) {
  return typeof value === "string" && value.replace(/\s+/g, "").length > 0;
}

function canvasesMatch(prev: Canvas[], next: Canvas[]) {
  return JSON.stringify(prev) === JSON.stringify(next);
}

type MeetingChannelStatus = "active" | "paused" | "closed";
type MeetingMessageKind = "message" | "decision" | "action-item";

type MeetingChannel = {
  id: string;
  title: string;
  status: MeetingChannelStatus;
  participants: string[];
  updated_at: string;
  unread?: number;
  linked_ledger_task_ids: string[];
};

type MeetingMessage = {
  id: string;
  channel_id: string;
  author: string;
  body: string;
  kind: MeetingMessageKind;
  created_at: string;
  ledger_task_id?: string;
  thread_id?: string;
};

type LedgerLabelMap = Record<string, string>;

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

const mockMeetingChannels: MeetingChannel[] = [
  {
    id: "meeting-first",
    title: "Meeting First MVP",
    status: "active",
    participants: ["max", "developer-2", "developer-5", "developer-4"],
    updated_at: "2026-06-01T02:00:00+09:00",
    unread: 3,
    linked_ledger_task_ids: ["meeting-first", "terminal-scrollback"]
  },
  {
    id: "design-review",
    title: "Design Review",
    status: "paused",
    participants: ["lucas", "max", "developer-8"],
    updated_at: "2026-06-01T01:20:00+09:00",
    unread: 1,
    linked_ledger_task_ids: ["responsive-layout"]
  },
  {
    id: "ops-sync",
    title: "Ops Sync",
    status: "closed",
    participants: ["max", "developer-4", "seo-security"],
    updated_at: "2026-05-31T22:45:00+09:00",
    unread: 0,
    linked_ledger_task_ids: ["agent-status-on-9100"]
  }
];

const mockMeetingMessages: MeetingMessage[] = [
  {
    id: "msg-1",
    channel_id: "meeting-first",
    author: "max",
    body: "오늘 안에 보이는 첫 미팅 화면이 필요하다. 채널 목록, 메시지, 결정사항, 액션아이템까지 우선 넣는다.",
    kind: "message",
    created_at: "09:10"
  },
  {
    id: "msg-2",
    channel_id: "meeting-first",
    author: "developer-2",
    body: "HQ 비교 기준은 Slack형 채널 + meeting thread이지만 로컬 MVP는 thread depth를 줄여도 된다.",
    kind: "message",
    created_at: "09:14"
  },
  {
    id: "msg-3",
    channel_id: "meeting-first",
    author: "max",
    body: "1차 화면은 apps/web main.tsx와 styles.css 안에서 static shell로 먼저 만든다.",
    kind: "decision",
    created_at: "09:18",
    ledger_task_id: "meeting-first"
  },
  {
    id: "msg-4",
    channel_id: "meeting-first",
    author: "developer-5",
    body: "채널 목록, 메시지 타임라인, 결정사항 요약, 액션아이템 요약, ledger label/link를 한 화면에 배치한다.",
    kind: "action-item",
    created_at: "09:21",
    ledger_task_id: "meeting-first"
  },
  {
    id: "msg-5",
    channel_id: "meeting-first",
    author: "developer-4",
    body: "완료 처리는 CDP 스크린샷과 콘솔 확인 이후로 제한한다.",
    kind: "decision",
    created_at: "09:25",
    ledger_task_id: "terminal-scrollback"
  },
  {
    id: "msg-6",
    channel_id: "design-review",
    author: "developer-8",
    body: "9000/9100 레이아웃 broad restyle은 보류하고 좁은 패치만 유지한다.",
    kind: "message",
    created_at: "08:40",
    ledger_task_id: "responsive-layout"
  },
  {
    id: "msg-7",
    channel_id: "ops-sync",
    author: "seo-security",
    body: "9100 상태 패널은 heartbeat와 blocker를 먼저 보이게 한다.",
    kind: "action-item",
    created_at: "어제",
    ledger_task_id: "agent-status-on-9100"
  }
];

const mockLedgerLabels: LedgerLabelMap = {
  "meeting-first": "meeting-first / 미팅 기능 우선 구현",
  "terminal-scrollback": "terminal scrollback / 300 lines review",
  "responsive-layout": "responsive command-center layout",
  "agent-status-on-9100": "9100 agent status panel"
};

const api = {
  async get<T>(path: string): Promise<T> {
    const response = await fetch(apiUrl(path));
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  async send<T>(path: string, method: string, body?: unknown): Promise<T> {
    const nextBody = normalizeSessionWriteBody(path, body);
    const response = await fetch(apiUrl(path), {
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
    const socket = new WebSocket(terminalWsUrl());
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const payloadData = typeof payload.prompt === "string" ? payload.prompt : typeof payload.data === "string" ? payload.data : "";
    const expectedAckType =
      payload.type === "promptText" ? "promptTextAck" :
      payload.type === "promptSubmit" ? "promptSubmitAck" :
      null;
    let settled = false;
    function settle(error?: Error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      closeWebSocket(socket);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }
    writeTerminalDiagnostic("terminal_input_protocol_start", {
      requestId,
      sessionId,
      payloadType: payload.type,
      dataBytes: payloadData.length,
      dataHasNewline: /[\r\n]/.test(payloadData),
      dataPreview: payloadData.slice(0, 180)
    });
    const timeout = window.setTimeout(() => {
      writeTerminalDiagnostic("terminal_input_protocol_timeout", {
        requestId,
        sessionId,
        readyState: socket.readyState
      });
      settle(new Error("terminal input timed out"));
    }, 5000);

    socket.addEventListener("open", () => {
      writeTerminalDiagnostic("terminal_input_protocol_ws_open", {
        requestId,
        sessionId,
        readyState: socket.readyState
      });
      socket.send(JSON.stringify({ sessionId, ...payload }));
      writeTerminalDiagnostic("terminal_input_protocol_sent", {
        requestId,
        sessionId,
        payloadType: payload.type,
        dataBytes: payloadData.length
      });
      if (!expectedAckType) settle();
    });
    socket.addEventListener("message", (event) => {
      if (!expectedAckType) return;
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.sessionId !== sessionId || message.type !== expectedAckType) {
        if (message.sessionId === sessionId && message.type === "error") {
          settle(new Error(typeof message.message === "string" ? message.message : "terminal input failed"));
        }
        return;
      }
      writeTerminalDiagnostic("terminal_input_protocol_ack", {
        requestId,
        sessionId,
        payloadType: payload.type,
        ackType: message.type
      });
      settle();
    });
    socket.addEventListener("error", () => {
      writeTerminalDiagnostic("terminal_input_protocol_error", {
        requestId,
        sessionId,
        readyState: socket.readyState
      });
      settle(new Error("terminal input socket failed"));
    });
    socket.addEventListener("close", (event) => {
      writeTerminalDiagnostic("terminal_input_protocol_close", {
        requestId,
        sessionId,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });
    });
  });
}

function waitForTerminalInputFlush() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 120));
}

async function sendTerminalPrompt(sessionId: string, prompt: string) {
  const body = normalizePromptForSubmit(prompt);
  writeTerminalDiagnostic("terminal_prompt_submit_start", {
    sessionId,
    promptBytes: prompt.length,
    promptLineCount: prompt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").length,
    textBytes: body.length,
    promptPreview: prompt.slice(0, 180)
  });
  try {
    if (body) {
      await sendTerminalProtocol(sessionId, { type: "promptText", prompt: body });
      await waitForTerminalInputFlush();
    }
    await sendTerminalProtocol(sessionId, { type: "promptSubmit", repeat: 1 });
    writeTerminalDiagnostic("terminal_prompt_submit_done", {
      sessionId,
      textBytes: body.length
    });
  } catch (error) {
    writeTerminalDiagnostic("terminal_prompt_submit_failed", {
      sessionId,
      textBytes: body.length,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
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

const TERMINAL_VIEW_STORAGE_KEY = "lcc-core-terminal-view";
const TERMINAL_FILTER_STORAGE_KEY = "lcc-core-terminal-filter";
const TERMINAL_LAYOUT_STORAGE_KEY = "lcc-core-terminal-layout";
const TERMINAL_RECENT_SESSION_STORAGE_KEY = "lcc-core-terminal-recent-session";
const TERMINAL_DIAGNOSTICS_STORAGE_KEY = "lcc-core-terminal-diagnostics";
const TERMINAL_PAGE_INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function terminalDiagnosticsNavigationType() {
  try {
    const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return navigation?.type ?? "unknown";
  } catch {
    return "unknown";
  }
}

function terminalRectSnapshot(element: HTMLElement | null) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight
  };
}

function writeTerminalDiagnostic(type: string, details: Record<string, unknown> = {}) {
  const raw = localStorage.getItem(TERMINAL_DIAGNOSTICS_STORAGE_KEY);
  if (raw !== "enabled" && !raw?.startsWith("[")) return;
  try {
    const parsed = raw && raw !== "enabled" ? JSON.parse(raw) : [];
    const events = Array.isArray(parsed) ? parsed : [];
    const event = {
      at: new Date().toISOString(),
      type,
      pageId: TERMINAL_PAGE_INSTANCE_ID,
      navType: terminalDiagnosticsNavigationType(),
      href: window.location.href,
      ...details
    };
    const next = [...events, event].slice(-500);
    localStorage.setItem(TERMINAL_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(next));
    console.info("[lcc-terminal-diagnostic]", event);
  } catch {}
}

writeTerminalDiagnostic("page_loaded");

type ShellUrlState = {
  view?: string | null;
  filter?: string | null;
  layout?: string | null;
  sessionId?: string | null;
};

function parseShellHashState() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return new URLSearchParams();
  if (hash.startsWith("/")) {
    const queryIndex = hash.indexOf("?");
    if (queryIndex >= 0) return new URLSearchParams(hash.slice(queryIndex + 1));
    if (hash === "/canvas") return new URLSearchParams("view=canvas");
    if (hash === "/terminals") return new URLSearchParams("view=terminals");
    return new URLSearchParams();
  }
  return new URLSearchParams(hash);
}

function normalizeLayoutAlias(value?: string | null): TerminalLayout | undefined {
  switch ((value || "").toLowerCase()) {
    case "grid":
    case "fleet":
      return "grid";
    case "stack":
    case "focus":
      return "stack";
    case "columns":
    case "work":
      return "columns";
    case "fit":
    case "equal":
      return "fit";
    default:
      return undefined;
  }
}

function terminalLayoutStorageKey(scope: string) {
  return `${TERMINAL_LAYOUT_STORAGE_KEY}:${scope || "all"}`;
}

function readTerminalTabState(key: string) {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeTerminalTabState(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

function readShellUrlState() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = parseShellHashState();
  const read = (key: string) => params.get(key) || hashParams.get(key);
  const view = read("view");
  const filter = read("filter") || read("team");
  const layout = read("layout");
  const sessionId = read("session") || read("selected");
  return { view, filter, layout, sessionId } as ShellUrlState;
}

function readStoredShellView(urlState: ShellUrlState = readShellUrlState()): "terminals" | "canvas" | "meetings" {
  try {
    const { view } = urlState;
    if (view === "canvas" || view === "terminals" || view === "meetings") return view;
    const stored = readTerminalTabState(TERMINAL_VIEW_STORAGE_KEY);
    return stored === "canvas" || stored === "meetings" ? stored : "terminals";
  } catch {
    return "terminals";
  }
}

function readStoredTerminalFilter(urlState: ShellUrlState = readShellUrlState()) {
  try {
    const { filter } = urlState;
    if (filter) return filter;
    return readTerminalTabState(TERMINAL_FILTER_STORAGE_KEY) || "all";
  } catch {
    return "all";
  }
}

function readStoredTerminalLayout(urlState: ShellUrlState = readShellUrlState()): TerminalLayout {
  try {
    const { layout } = urlState;
    const aliased = normalizeLayoutAlias(layout);
    if (aliased) return aliased;
    const scope = readStoredTerminalFilter(urlState);
    const stored = sessionStorage.getItem(terminalLayoutStorageKey(scope));
    return stored === "stack" || stored === "columns" || stored === "fit" ? stored : "grid";
  } catch {
    return "grid";
  }
}

function readStoredRecentSessionId(urlState: ShellUrlState = readShellUrlState()) {
  try {
    const { sessionId } = urlState;
    if (sessionId) return sessionId;
    return sessionStorage.getItem(TERMINAL_RECENT_SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeShellUrlState(next: Partial<ShellUrlState>) {
  const url = new URL(window.location.href);
  const state = { ...readShellUrlState(), ...next };
  const setOrDelete = (key: string, value?: string | null) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  setOrDelete("view", state.view);
  setOrDelete("filter", state.filter);
  setOrDelete("layout", state.layout);
  setOrDelete("session", state.sessionId);
  url.searchParams.delete("team");
  url.searchParams.delete("selected");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function readTerminalPopoutSessionId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("popout") || params.get("terminalPopout") || "";
}

function readTerminalFullscreenSessionId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("fullscreen") || params.get("terminalFullscreen") || "";
}

function writeTerminalFullscreenSessionId(sessionId: string | null) {
  const url = new URL(window.location.href);
  if (sessionId) url.searchParams.set("fullscreen", sessionId);
  else url.searchParams.delete("fullscreen");
  url.searchParams.delete("terminalFullscreen");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function blurActiveXtermHelper() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.classList.contains("xterm-helper-textarea")) {
    active.blur();
    return;
  }
  document.querySelectorAll<HTMLTextAreaElement>("textarea.xterm-helper-textarea").forEach((item) => item.blur());
}

function App() {
  const popoutSessionId = readTerminalPopoutSessionId();
  if (popoutSessionId) return <TerminalPopoutPage sessionId={popoutSessionId} />;
  return isStandaloneLedgerView() ? <WorkLedgerPage /> : <ShellApp />;
}

function TerminalPopoutPage({ sessionId }: { sessionId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [prompt, setPrompt] = useState(() => readTerminalCardDraft(window.localStorage, sessionId));
  const [target, setTarget] = useState(sessionId);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [attachments, setAttachments] = useState<TerminalImageAttachment[]>([]);
  const [expandedAttachment, setExpandedAttachment] = useState<TerminalImageAttachment | null>(null);
  const promptRef = useRef(prompt);
  const sendingRef = useRef(false);
  const attachmentsRef = useRef<TerminalImageAttachment[]>([]);
  const pendingRefreshRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const targetRef = useRef(sessionId);
  const composerActiveRef = useRef(false);
  const session = sessions.find((item) => item.id === sessionId);
  const composerActive = composerFocused || isSending || prompt.trim().length > 0 || attachments.length > 0;

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.url));
    };
  }, []);

  useEffect(() => {
    composerActiveRef.current = composerActive;
  }, [composerActive]);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (!options?.force && composerActiveRef.current) {
      pendingRefreshRef.current = true;
      return;
    }
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const task = (async () => {
      const nextSessions = await api.get<Session[]>("/api/sessions");
      pendingRefreshRef.current = false;
      setSessions((current) => (sessionsMatch(current, nextSessions) ? current : nextSessions));
      if (!nextSessions.some((item) => item.id === targetRef.current)) setTarget(sessionId);
    })();
    refreshInFlightRef.current = task;
    try {
      await task;
    } finally {
      if (refreshInFlightRef.current === task) refreshInFlightRef.current = null;
    }
  }, [sessionId]);

  useEffect(() => {
    document.body.classList.add("terminal-popout-mode");
    refresh().catch((err) => setError(String(err)));
    const timer = window.setInterval(() => refresh().catch(() => undefined), 2500);
    return () => {
      document.body.classList.remove("terminal-popout-mode");
      window.clearInterval(timer);
    };
  }, [refresh, sessionId]);

  useEffect(() => {
    if (composerActive || !pendingRefreshRef.current) return;
    refresh({ force: true }).catch((err) => setError(String(err)));
  }, [composerActive, refresh]);

  function addImageFiles(files: ArrayLike<File> | null | undefined) {
    if (!files) return;
    const nextAttachments = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name || "pasted-image",
        type: file.type || "image/*",
        size: file.size,
        url: URL.createObjectURL(file)
      }));
    if (!nextAttachments.length) return;
    setAttachments((current) => [...current, ...nextAttachments]);
  }

  function removeAttachment(attachmentId: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === attachmentId);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((attachment) => attachment.id !== attachmentId);
    });
    setExpandedAttachment((current) => (current?.id === attachmentId ? null : current));
  }

  function handlePromptChange(value: string) {
    promptRef.current = value;
    setPrompt(value);
    writeTerminalCardDraft(window.localStorage, sessionId, value);
  }

  async function send() {
    const nextPrompt = normalizePromptForSubmit(promptRef.current);
    if (!nextPrompt.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    const attachmentNote = attachments.length
      ? `\n\n[첨부 이미지: ${attachments.map((attachment) => attachment.name).join(", ")}]`
      : "";
    const payloadText = `${nextPrompt}${attachmentNote}`;
    const payload = target === sessionId ? payloadText : `[FROM ${sessionId} TO ${target}] ${payloadText}`;
    try {
      await sendTerminalPrompt(target, payload);
      promptRef.current = "";
      setPrompt("");
      writeTerminalCardDraft(window.localStorage, sessionId, "");
      setAttachments((current) => {
        current.forEach((attachment) => URL.revokeObjectURL(attachment.url));
        return [];
      });
      setExpandedAttachment(null);
      await refresh({ force: true });
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }

  return (
    <main className={`terminal-popout-page ${composerActive ? "composer-dirty" : ""} ${attachments.length > 0 ? "has-attachments" : ""}`}>
      <header>
        <div>
          <span className="status-dot" />
          <strong>{session?.name ?? sessionId}</strong>
          <em>{session?.status ?? "loading"}</em>
          {session?.team && <em>{session.team}</em>}
          {session?.model && <em>{session.model}</em>}
        </div>
        <div className="card-actions">
          <button className="icon" onClick={() => window.close()} title="팝업 닫기">
            <X size={16} />
          </button>
        </div>
      </header>
      {error ? (
        <div className="error">{error}</div>
      ) : session ? (
        <HqTerminalPreview
          sessionId={session.id}
          initialPreviewText={session.preview_text || session.preview}
          initialPreviewAnsi={session.preview_ansi}
          variant="fullscreen"
        />
      ) : (
        <pre className="terminal-snapshot-preview fullscreen" aria-label="Loading terminal output">
          Loading terminal output...
        </pre>
      )}
      {attachments.length > 0 && (
        <div className="terminal-attachment-strip" onMouseDown={stopTerminalTileFooterMouseDown}>
          {attachments.map((attachment) => (
            <div key={attachment.id} className="terminal-attachment-tile">
              <button
                className="terminal-attachment-preview"
                type="button"
                onClick={() => setExpandedAttachment(attachment)}
                title="첨부 이미지 확대"
              >
                <img src={attachment.url} alt={attachment.name} />
              </button>
              <span>{attachment.name}</span>
              <button
                className="terminal-attachment-remove"
                type="button"
                onClick={() => removeAttachment(attachment.id)}
                title="첨부 제거"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <footer aria-busy={isSending} onMouseDown={stopTerminalTileFooterMouseDown}>
        <select value={target} onChange={(event) => setTarget(event.target.value)} onMouseDown={stopTerminalTileFooterMouseDown}>
          {(sessions.length ? sessions : [{ id: sessionId, name: sessionId } as Session]).map((item) => (
            <option key={item.id} value={item.id}>
              {sessionDisplayName(item)}
            </option>
          ))}
        </select>
        <textarea
          rows={1}
          value={prompt}
          onFocus={() => {
            blurActiveXtermHelper();
            setComposerFocused(true);
          }}
          onBlur={() => setComposerFocused(false)}
          onChange={(event) => handlePromptChange(event.target.value)}
          onPaste={(event) => {
            if (!clipboardItemsContainImage(event.clipboardData?.items)) return;
            const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            if (!files.length) return;
            event.preventDefault();
            addImageFiles(files);
          }}
          onKeyDown={(event) => {
            if (shouldSubmitTerminalTileComposer(event)) {
              send().catch(console.error);
            }
          }}
          placeholder="지시 입력"
        />
        <button className="primary icon" onMouseDown={stopTerminalTileFooterMouseDown} onClick={send} title="전송" disabled={isSending || !prompt.trim()}>
          <Send size={15} />
        </button>
      </footer>
      <div className="workspace-path">{session?.cwd ?? ""}</div>
      {expandedAttachment && (
        <div className="terminal-image-modal" role="dialog" aria-modal="true" onMouseDown={() => setExpandedAttachment(null)}>
          <div className="terminal-image-panel" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <strong>{expandedAttachment.name}</strong>
              <button className="icon" type="button" onClick={() => setExpandedAttachment(null)} title="닫기">
                <X size={16} />
              </button>
            </header>
            <img src={expandedAttachment.url} alt={expandedAttachment.name} />
          </div>
        </div>
      )}
    </main>
  );
}

function ShellApp() {
  const initialUrlStateRef = useRef<ShellUrlState | null>(null);
  if (initialUrlStateRef.current === null) initialUrlStateRef.current = readShellUrlState();
  const initialUrlState = initialUrlStateRef.current;
  const [sessions, setSessions] = useState<Session[]>([]);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState<string>("");
  const [view, setView] = useState<"terminals" | "canvas" | "meetings">(() => readStoredShellView(initialUrlState));
  const [filter, setFilter] = useState(() => readStoredTerminalFilter(initialUrlState));
  const [terminalLayout, setTerminalLayout] = useState<TerminalLayout>(() => readStoredTerminalLayout(initialUrlState));
  const [selectedSessionId, setSelectedSessionId] = useState(() => readStoredRecentSessionId(initialUrlState));
  const [selectedMeetingId, setSelectedMeetingId] = useState(() => mockMeetingChannels[0]?.id ?? "");
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [topbarCollapsed, setTopbarCollapsed] = useState(false);
  const [terminalsLayerMounted, setTerminalsLayerMounted] = useState(() => view === "terminals");
  const [composerActivityVersion, setComposerActivityVersion] = useState(0);
  const [fullscreenSessionId, setFullscreenSessionId] = useState(() => readTerminalFullscreenSessionId());
  const pendingRefreshRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const skipInitialFilterLayoutSyncRef = useRef(Boolean(normalizeLayoutAlias(initialUrlState.layout)));

  const selectedCanvas = canvases.find((canvas) => canvas.id === selectedCanvasId) ?? canvases[0];
  const selectedMeeting = mockMeetingChannels.find((channel) => channel.id === selectedMeetingId) ?? mockMeetingChannels[0];
  const fullscreenSession = sessions.find((session) => session.id === fullscreenSessionId);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (!options?.force && hasActiveTerminalComposer()) {
      pendingRefreshRef.current = true;
      return;
    }
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const task = (async () => {
      const [nextSessions, nextCanvases] = await Promise.all([
        api.get<Session[]>("/api/sessions"),
        api.get<Canvas[]>("/api/canvases")
      ]);
      pendingRefreshRef.current = false;
      startTransition(() => {
        setSessions((current) => (sessionsMatch(current, nextSessions) ? current : nextSessions));
        setCanvases((current) => (canvasesMatch(current, nextCanvases) ? current : nextCanvases));
        setSelectedCanvasId((current) => current || nextCanvases[0]?.id || "");
      });
    })();
    refreshInFlightRef.current = task;
    try {
      await task;
    } finally {
      if (refreshInFlightRef.current === task) refreshInFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
    const timer = window.setInterval(() => refresh().catch(() => undefined), 2500);
    const socket = new WebSocket(terminalWsUrl());
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "sessionCreated" || message.type === "sessionDeleted" || message.type === "exit") {
        refresh().catch(() => undefined);
      }
    };
    return () => {
      window.clearInterval(timer);
      closeWebSocket(socket);
    };
  }, [refresh]);

  useEffect(() => subscribeTerminalComposerActivity(() => setComposerActivityVersion((value) => value + 1)), []);

  useEffect(() => {
    if (hasActiveTerminalComposer() || !pendingRefreshRef.current) return;
    refresh({ force: true }).catch((err) => setError(String(err)));
  }, [composerActivityVersion, refresh]);

  useEffect(() => {
    writeTerminalTabState(TERMINAL_VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    writeTerminalTabState(TERMINAL_FILTER_STORAGE_KEY, filter);
  }, [filter]);

  useEffect(() => {
    try {
      sessionStorage.setItem(terminalLayoutStorageKey(filter), terminalLayout);
    } catch {}
  }, [filter, terminalLayout]);

  const visibleSessions = useMemo(() => {
    const selectedGroup = SESSION_GROUP_BY_FILTER.get(filter);
    const filtered =
      selectedGroup
        ? sessions.filter((session) => selectedGroup.members.some((member) => member.session && member.id === session.id))
        : filter === "all"
          ? sessions.filter((session) => !HIDDEN_TERMINAL_TEAMS.has(session.team))
          : filter === "active"
            ? sessions.filter((session) => session.status === "active" && !HIDDEN_TERMINAL_TEAMS.has(session.team))
            : sessions.filter((session) => session.team === filter || session.status === filter);
    // Selected session floats to top so focus/stack layout shows it without scrolling.
    const sorted = [...filtered].sort((a, b) => {
      if (a.id === selectedSessionId) return -1;
      if (b.id === selectedSessionId) return 1;
      return agentRank(a.id) - agentRank(b.id) || a.name.localeCompare(b.name);
    });
    // Include selected session even if outside current filter (e.g. executive filter + QA probe URL).
    if (selectedSessionId && !filtered.some((s) => s.id === selectedSessionId)) {
      const target = sessions.find((s) => s.id === selectedSessionId);
      if (target) sorted.unshift(target);
    }
    return sorted;
  }, [filter, sessions, selectedSessionId]);
  const deferredVisibleSessions = useDeferredValue(visibleSessions);

  const teams = useMemo(() => [...new Set(sessions.map((session) => session.team).filter(Boolean))], [sessions]);
  const sessionIds = useMemo(() => new Set(sessions.map((session) => session.id)), [sessions]);
  const selectTerminalFilter = useCallback((nextFilter: string) => {
    setView("terminals");
    setFilter(nextFilter);
  }, []);

  const openFullscreenSession = useCallback((sessionId: string) => {
    writeTerminalFullscreenSessionId(sessionId);
    setFullscreenSessionId(sessionId);
    setView("terminals");
  }, []);

  const closeFullscreenSession = useCallback(() => {
    writeTerminalFullscreenSessionId(null);
    setFullscreenSessionId("");
  }, []);

  useEffect(() => {
    if (view !== "terminals") return;
    // Check sessions (not just visible) so URL-specified targets aren't overridden by filter exclusion.
    if (selectedSessionId && sessions.some((session) => session.id === selectedSessionId)) return;
    const fallback = deferredVisibleSessions.find((session) => session.status === "active") ?? deferredVisibleSessions[0];
    if (fallback && fallback.id !== selectedSessionId) setSelectedSessionId(fallback.id);
  }, [deferredVisibleSessions, selectedSessionId, sessions, view]);

  useEffect(() => {
    if (view === "terminals") setTerminalsLayerMounted(true);
  }, [view]);

  useEffect(() => {
    try {
      if (selectedSessionId) sessionStorage.setItem(TERMINAL_RECENT_SESSION_STORAGE_KEY, selectedSessionId);
      else sessionStorage.removeItem(TERMINAL_RECENT_SESSION_STORAGE_KEY);
    } catch {}
  }, [selectedSessionId]);

  useEffect(() => {
    if (skipInitialFilterLayoutSyncRef.current) {
      skipInitialFilterLayoutSyncRef.current = false;
      return;
    }
    try {
      const stored = sessionStorage.getItem(terminalLayoutStorageKey(filter));
      const nextLayout = stored === "stack" || stored === "columns" || stored === "fit" ? stored : "grid";
      if (nextLayout !== terminalLayout) setTerminalLayout(nextLayout);
    } catch {}
  }, [filter, terminalLayout]);

  useEffect(() => {
    writeShellUrlState({
      view,
      filter,
      layout: terminalLayout,
      sessionId: selectedSessionId
    });
  }, [filter, selectedSessionId, terminalLayout, view]);

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
          <button className={view === "meetings" ? "active" : ""} onClick={() => setView("meetings")} title="Meetings">
            <MessageSquare size={19} />
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
          <button className={`filter ${filter === "all" ? "active" : ""}`} onClick={() => selectTerminalFilter("all")}>
            <Activity size={14} /> All
          </button>
          <button className={`filter ${filter === "active" ? "active" : ""}`} onClick={() => selectTerminalFilter("active")}>
            <span className="dot green" /> Active
          </button>
          {SESSION_GROUPS.map((group) => {
            const liveCount = group.members.filter((member) => member.session && sessionIds.has(member.id)).length;
            const sessionCount = group.members.filter((member) => member.session).length;
            return (
              <div className="session-group" key={group.filter}>
                <button className={`filter group-filter ${filter === group.filter ? "active" : ""}`} onClick={() => selectTerminalFilter(group.filter)}>
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
            <button className={`filter ${filter === team ? "active" : ""}`} key={team} onClick={() => selectTerminalFilter(team)}>
              <span className="dot" /> {team}
            </button>
          ))}
        </section>
        <section className="side-section">
          <header>
            <span>Meetings</span>
            <strong>{mockMeetingChannels.length}</strong>
          </header>
          {mockMeetingChannels.map((channel) => (
            <button
              className={`canvas-link ${selectedMeeting?.id === channel.id ? "active" : ""}`}
              key={channel.id}
              onClick={() => {
                setSelectedMeetingId(channel.id);
                setView("meetings");
              }}
            >
              {channel.title}
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
            <h1>{view === "terminals" ? "Terminal Fleet" : view === "meetings" ? "Meeting Workspace" : "Canvas Workspace"}</h1>
            <p>
              {sessions.filter((session) => session.status === "active").length} active sessions · {mockMeetingChannels.length} meetings · {canvases.length} canvases · local control plane
            </p>
          </div>
          <div className="top-actions">
            <button onClick={() => setView("terminals")} className={view === "terminals" ? "primary" : ""}>
              <LayoutGrid size={16} /> Grid
            </button>
            <button onClick={() => setView("meetings")} className={view === "meetings" ? "primary" : ""}>
              <MessageSquare size={16} /> Meetings
            </button>
            <button onClick={() => setView("canvas")} className={view === "canvas" ? "primary" : ""}>
              <FileText size={16} /> Canvas
            </button>
            <PeerDock />
            {view === "terminals" && (
              <div className="terminal-layout-toggle" role="group" aria-label="터미널 배치">
                <button onClick={() => setTerminalLayout("grid")} className={terminalLayout === "grid" ? "primary" : ""} type="button">
                  <LayoutGrid size={15} /> Fleet
                </button>
                <button onClick={() => setTerminalLayout("stack")} className={terminalLayout === "stack" ? "primary" : ""} type="button">
                  <PanelTopOpen size={15} /> Focus
                </button>
                <button onClick={() => setTerminalLayout("columns")} className={terminalLayout === "columns" ? "primary" : ""} type="button">
                  <PanelLeftOpen size={15} /> Work
                </button>
                <button onClick={() => setTerminalLayout("fit")} className={terminalLayout === "fit" ? "primary" : ""} type="button">
                  <LayoutGrid size={15} /> Equal
                </button>
              </div>
            )}
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {terminalsLayerMounted && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: view === "terminals" ? "flex" : "none",
                flexDirection: "column",
                minHeight: 0
              }}
            >
              {fullscreenSessionId ? (
                fullscreenSession ? (
                  <FullscreenTerminalModal
                    session={fullscreenSession}
                    sessions={sessions}
                    onClose={closeFullscreenSession}
                    onChanged={refresh}
                  />
                ) : (
                  <div className="empty">
                    <Terminal size={28} />
                    <h2>Loading terminal</h2>
                  </div>
                )
              ) : (
                <>
                  <CreateSession sessions={sessions} onCreated={refresh} onShowDevTeam={() => selectTerminalFilter("development-team")} />
                  <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                    <TerminalGrid
                      sessions={deferredVisibleSessions}
                      allSessions={sessions}
                      onChanged={refresh}
                      layout={terminalLayout}
                      selectedSessionId={selectedSessionId}
                      onSelectSession={setSelectedSessionId}
                      onOpenFullscreen={openFullscreenSession}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {view === "meetings" ? (
            <MeetingWorkspace
              channel={selectedMeeting}
              channels={mockMeetingChannels}
              messages={mockMeetingMessages}
              ledgerLabels={mockLedgerLabels}
              onSelectChannel={setSelectedMeetingId}
            />
          ) : view === "canvas" ? (
            <CanvasWorkspace
              canvas={selectedCanvas}
              sessions={sessions}
              onChanged={async () => {
                await refresh();
              }}
            />
          ) : null}
        </div>
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

function CreateSession({
  sessions,
  onCreated,
  onShowDevTeam
}: {
  sessions: Session[];
  onCreated: () => Promise<void>;
  onShowDevTeam: () => void;
}) {
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
      await sendCodexStartupPolicy(agent.id);
    }
    await onCreated();
    onShowDevTeam();
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
        <span>Spawn one dev lead and three GPT-5.5 Codex developers in isolated workspaces.</span>
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

const TerminalGrid = React.memo(function TerminalGrid({
  sessions,
  allSessions,
  onChanged,
  layout,
  selectedSessionId,
  onSelectSession,
  onOpenFullscreen
}: {
  sessions: Session[];
  allSessions: Session[];
  onChanged: () => Promise<void>;
  layout: TerminalLayout;
  selectedSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onOpenFullscreen: (sessionId: string) => void;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Scroll selected card into view for both stack (vertical) and columns (horizontal) layouts.
    if (layout !== "stack" && layout !== "columns") return;
    const grid = gridRef.current;
    if (!grid) return;
    const selectedCard = grid.querySelector<HTMLElement>(".terminal-card.selected");
    if (selectedCard) selectedCard.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [layout, selectedSessionId]);

  const fitColumns =
    sessions.length <= 1 ? 1 : sessions.length <= 4 ? 2 : sessions.length <= 9 ? 3 : sessions.length <= 16 ? 5 : 6;
  const columns =
    layout === "stack"
      ? 1
      : layout === "columns"
        ? Math.max(1, sessions.length)
      : layout === "fit"
        ? fitColumns
        : sessions.length <= 1
          ? 1
          : sessions.length <= 4
            ? 2
            : 3;
  const rows = Math.max(1, Math.ceil(sessions.length / columns));
  const gridStyle = {
    "--grid-cols": columns,
    "--grid-rows": rows
  } as React.CSSProperties;

  return (
    <div ref={gridRef} className={`terminal-grid ${layout}`} style={gridStyle}>
      {sessions.map((session) => (
        <TerminalCard
          key={session.id}
          session={session}
          sessions={allSessions}
          onChanged={onChanged}
          selected={selectedSessionId === session.id}
          onSelectSession={onSelectSession}
          onOpenFullscreen={onOpenFullscreen}
        />
      ))}
    </div>
  );
});

function MeetingWorkspace({
  channel,
  channels,
  messages,
  ledgerLabels,
  onSelectChannel
}: {
  channel?: MeetingChannel;
  channels: MeetingChannel[];
  messages: MeetingMessage[];
  ledgerLabels: LedgerLabelMap;
  onSelectChannel: (channelId: string) => void;
}) {
  const [draftBody, setDraftBody] = useState("");
  const [draftKind, setDraftKind] = useState<MeetingMessageKind>("message");
  const activeChannel = channel ?? channels[0];
  const channelMessages = messages.filter((message) => message.channel_id === activeChannel?.id);
  const decisions = channelMessages.filter((message) => message.kind === "decision");
  const actionItems = channelMessages.filter((message) => message.kind === "action-item");

  if (!activeChannel) {
    return (
      <section className="meeting-workspace meeting-workspace-empty">
        <div className="empty">
          <MessageSquare size={28} />
          <h2>No meeting</h2>
          <p>채널 데이터가 아직 없습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="meeting-workspace">
      <aside className="meeting-channel-list">
        <header className="meeting-panel-header">
          <div>
            <span className="meeting-panel-kicker">Meetings</span>
            <h2>Channels</h2>
          </div>
          <strong>{channels.length}</strong>
        </header>
        <div className="meeting-channel-items">
          {channels.map((item) => (
            <button
              key={item.id}
              className={`meeting-channel-item ${item.id === activeChannel.id ? "active" : ""}`}
              onClick={() => onSelectChannel(item.id)}
              type="button"
            >
              <div className="meeting-channel-main">
                <strong>{item.title}</strong>
                <span className={`meeting-status-pill ${item.status}`}>{item.status}</span>
              </div>
              <div className="meeting-channel-meta">
                <span>{item.participants.length} participants</span>
                <span>{item.unread ?? 0} unread</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="meeting-timeline">
        <header className="meeting-panel-header">
          <div>
            <span className="meeting-panel-kicker">Meeting</span>
            <h2>{activeChannel.title}</h2>
            <p>{activeChannel.participants.join(", ")}</p>
          </div>
          <strong>{channelMessages.length} msgs</strong>
        </header>
        <div className="meeting-message-list">
          {channelMessages.map((message) => (
            <article key={message.id} className={`meeting-message kind-${message.kind}`}>
              <div className="meeting-message-head">
                <strong>{message.author}</strong>
                <span>{message.created_at}</span>
                <em className={`meeting-kind-badge ${message.kind}`}>{message.kind}</em>
              </div>
              <p>{message.body}</p>
              {message.ledger_task_id && (
                <span className="meeting-ledger-link">{ledgerLabels[message.ledger_task_id] ?? message.ledger_task_id}</span>
              )}
            </article>
          ))}
        </div>
        <form
          className="meeting-composer"
          onSubmit={(event) => {
            event.preventDefault();
            setDraftBody("");
          }}
        >
          <select value={draftKind} onChange={(event) => setDraftKind(event.target.value as MeetingMessageKind)}>
            <option value="message">message</option>
            <option value="decision">decision</option>
            <option value="action-item">action-item</option>
          </select>
          <input value={draftBody} onChange={(event) => setDraftBody(event.target.value)} placeholder="메시지 입력 (static shell)" />
          <button className="primary" type="submit" disabled={!draftBody.trim()}>
            <Send size={15} /> Send
          </button>
        </form>
      </main>

      <aside className="meeting-summary-panel">
        <section className="meeting-summary-card">
          <h3>Decisions</h3>
          {decisions.length === 0 ? <p className="meeting-summary-empty">아직 결정사항이 없습니다.</p> : decisions.map((item) => <div key={item.id} className="meeting-summary-item">{item.body}</div>)}
        </section>
        <section className="meeting-summary-card">
          <h3>Action Items</h3>
          {actionItems.length === 0 ? (
            <p className="meeting-summary-empty">아직 액션아이템이 없습니다.</p>
          ) : (
            actionItems.map((item) => (
              <div key={item.id} className="meeting-summary-item">
                <strong>{item.author}</strong>
                <p>{item.body}</p>
              </div>
            ))
          )}
        </section>
        <section className="meeting-summary-card">
          <h3>Ledger Labels</h3>
          <div className="meeting-ledger-links">
            {activeChannel.linked_ledger_task_ids.map((item) => (
              <span key={item} className="meeting-ledger-link">
                {ledgerLabels[item] ?? item}
              </span>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}

const TerminalCard = React.memo(function TerminalCard({
  session,
  sessions,
  onChanged,
  selected,
  onSelectSession,
  onOpenFullscreen
}: {
  session: Session;
  sessions: Session[];
  onChanged: () => Promise<void>;
  selected: boolean;
  onSelectSession: (sessionId: string) => void;
  onOpenFullscreen: (sessionId: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [target, setTarget] = useState(session.id);
  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [attachments, setAttachments] = useState<TerminalImageAttachment[]>([]);
  const [expandedAttachment, setExpandedAttachment] = useState<TerminalImageAttachment | null>(null);
  const promptRef = useRef(prompt);
  const sendingRef = useRef(false);
  const attachmentsRef = useRef<TerminalImageAttachment[]>([]);
  const composerDirty = composerFocused || isSending || prompt.trim().length > 0 || attachments.length > 0;
  useTerminalComposerActivity(`card:${session.id}`, composerDirty);

  useEffect(() => {
    const nextPrompt = readTerminalCardDraft(window.localStorage, session.id);
    promptRef.current = nextPrompt;
    setPrompt(nextPrompt);
  }, [session.id]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.url));
    };
  }, []);

  function addImageFiles(files: ArrayLike<File> | null | undefined) {
    if (!files) return;
    const nextAttachments = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name || "pasted-image",
        type: file.type || "image/*",
        size: file.size,
        url: URL.createObjectURL(file)
      }));
    if (!nextAttachments.length) return;
    setAttachments((current) => [...current, ...nextAttachments]);
  }

  function removeAttachment(attachmentId: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === attachmentId);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((attachment) => attachment.id !== attachmentId);
    });
    setExpandedAttachment((current) => (current?.id === attachmentId ? null : current));
  }

  function handlePromptChange(value: string) {
    promptRef.current = value;
    setPrompt(value);
    writeTerminalCardDraft(window.localStorage, session.id, value);
  }

  async function send() {
    const nextPrompt = normalizePromptForSubmit(promptRef.current);
    if (!nextPrompt.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    const attachmentNote = attachments.length
      ? `\n\n[첨부 이미지: ${attachments.map((attachment) => attachment.name).join(", ")}]`
      : "";
    const payloadText = `${nextPrompt}${attachmentNote}`;
    const payload = target === session.id ? payloadText : `[FROM ${session.id} TO ${target}] ${payloadText}`;
    try {
      await sendTerminalPrompt(target, payload);
      promptRef.current = "";
      setPrompt("");
      writeTerminalCardDraft(window.localStorage, session.id, "");
      setAttachments((current) => {
        current.forEach((attachment) => URL.revokeObjectURL(attachment.url));
        return [];
      });
      setExpandedAttachment(null);
      await onChanged();
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }

  async function openLog() {
    const response = await fetch(apiUrl(`/api/sessions/${session.id}/log`));
    setLogText(await response.text());
    setLogOpen(true);
  }

  async function stop() {
    if (!confirm(`${sessionDisplayName(session)} 세션을 중지할까요?`)) return;
    await api.send(`/api/sessions/${session.id}`, "DELETE");
    await onChanged();
  }

  function openPopout() {
    const url = new URL(window.location.href);
    url.searchParams.set("popout", session.id);
    url.searchParams.set("name", sessionDisplayName(session));
    const width = 1200;
    const height = 800;
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));
    window.open(
      url.toString(),
      `terminal-${session.id}-${Date.now()}`,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,menubar=no,toolbar=no,noopener=yes`
    );
  }

  function openFullscreen() {
    onOpenFullscreen(session.id);
  }

  return (
    <article
      className={`terminal-card ${session.status} ${selected ? "selected" : ""} ${composerDirty ? "composer-dirty" : ""}`}
      onMouseDown={(e) => {
        onSelectSession(session.id);
        const textarea = e.currentTarget.querySelector('.xterm-helper-textarea') as HTMLElement | null;
        if (textarea) { e.preventDefault(); textarea.focus(); }
      }}
    >
      <header>
        <div>
          <span className="status-dot" />
          <strong>{sessionDisplayName(session)}</strong>
          <em>{session.team}</em>
          {session.model && <em>{session.model}</em>}
          {composerDirty && <span className="composer-state">Editing</span>}
        </div>
        <div className="card-actions">
          <button title="터미널 크게 보기" onMouseDown={stopTerminalTileFooterMouseDown} onClick={openFullscreen}>
            <Maximize2 size={13} />
          </button>
          <button title="화면 안에서 크게 보기" onMouseDown={stopTerminalTileFooterMouseDown} onClick={openFullscreen}>
            <PanelTopOpen size={13} />
          </button>
          <button title="팝업으로 보기" onMouseDown={stopTerminalTileFooterMouseDown} onClick={openPopout}>
            <Maximize2 size={13} />
          </button>
          <button title="터미널 로그" onMouseDown={stopTerminalTileFooterMouseDown} onClick={openLog}>
            <ScrollText size={13} />
          </button>
          <button title="중지" onMouseDown={stopTerminalTileFooterMouseDown} onClick={stop}>
            <Square size={13} />
          </button>
          <button title="삭제" onMouseDown={stopTerminalTileFooterMouseDown} onClick={stop}>
            <Trash2 size={13} />
          </button>
        </div>
      </header>
      <HqTerminalPreview
        sessionId={session.id}
        initialPreviewText={session.preview_text || session.preview}
        initialPreviewAnsi={session.preview_ansi}
      />
      {attachments.length > 0 && (
        <div className="terminal-attachment-strip" onMouseDown={stopTerminalTileFooterMouseDown}>
          {attachments.map((attachment) => (
            <div key={attachment.id} className="terminal-attachment-tile">
              <button
                className="terminal-attachment-preview"
                type="button"
                onClick={() => setExpandedAttachment(attachment)}
                title="첨부 이미지 확대"
              >
                <img src={attachment.url} alt={attachment.name} />
              </button>
              <span>{attachment.name}</span>
              <button
                className="terminal-attachment-remove"
                type="button"
                onClick={() => removeAttachment(attachment.id)}
                title="첨부 제거"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <footer aria-busy={isSending} onMouseDown={stopTerminalTileFooterMouseDown}>
        <select value={target} onChange={(event) => setTarget(event.target.value)} onMouseDown={stopTerminalTileFooterMouseDown}>
          {sessions.map((item) => (
            <option key={item.id} value={item.id}>
              {sessionDisplayName(item)}
            </option>
          ))}
        </select>
        <textarea
          rows={1}
          value={prompt}
          onFocus={() => {
            blurActiveXtermHelper();
            setComposerFocused(true);
          }}
          onBlur={() => setComposerFocused(false)}
          onChange={(event) => handlePromptChange(event.target.value)}
          onPaste={(event) => {
            if (!clipboardItemsContainImage(event.clipboardData?.items)) return;
            const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            if (!files.length) return;
            event.preventDefault();
            addImageFiles(files);
          }}
          onKeyDown={(event) => {
            if (shouldSubmitTerminalTileComposer(event)) {
              send().catch(console.error);
            }
          }}
          placeholder="지시 입력"
        />
        <button className="primary icon" onMouseDown={stopTerminalTileFooterMouseDown} onClick={send} title="전송" disabled={isSending || !prompt.trim()}>
          <Send size={15} />
        </button>
      </footer>
      <div className="workspace-path">{session.cwd}</div>
      {expandedAttachment && (
        <div className="terminal-image-modal" role="dialog" aria-modal="true" onMouseDown={() => setExpandedAttachment(null)}>
          <div className="terminal-image-panel" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <strong>{expandedAttachment.name}</strong>
              <button className="icon" type="button" onClick={() => setExpandedAttachment(null)} title="닫기">
                <X size={16} />
              </button>
            </header>
            <img src={expandedAttachment.url} alt={expandedAttachment.name} />
          </div>
        </div>
      )}
      {logOpen && (
        <div className="log-modal" role="dialog" aria-modal="true">
          <div className="log-panel">
            <header>
              <strong>{sessionDisplayName(session)} 터미널 로그</strong>
              <button onClick={() => setLogOpen(false)}>닫기</button>
            </header>
            <TerminalLogView text={tailTerminalLines(logText || "아직 이 세션에 저장된 로그가 없습니다. 로그 기능이 켜진 뒤 세션을 다시 시작해야 합니다.\r\n")} />
          </div>
        </div>
      )}
    </article>
  );
});

type TerminalImageAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
};

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
  const [prompt, setPrompt] = useState(() => readTerminalCardDraft(window.localStorage, session.id));
  const [target, setTarget] = useState(session.id);
  const [isSending, setIsSending] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const promptRef = useRef(prompt);
  const sendingRef = useRef(false);
  const composerDirty = composerFocused || isSending || prompt.trim().length > 0;
  useTerminalComposerActivity(`fullscreen:${session.id}`, composerDirty);

  useEffect(() => {
    const nextPrompt = readTerminalCardDraft(window.localStorage, session.id);
    promptRef.current = nextPrompt;
    setPrompt(nextPrompt);
  }, [session.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
      writeTerminalCardDraft(window.localStorage, session.id, "");
      await onChanged();
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (shouldSubmitTerminalTileComposer(event)) {
      send().catch(console.error);
    }
  }

  return (
    <div className="terminal-fullscreen-modal" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <section
        className={`terminal-fullscreen-panel ${session.status} ${composerDirty ? "composer-dirty" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="status-dot" />
            <strong>{sessionDisplayName(session)}</strong>
            <em>{session.status}</em>
            <em>{session.team}</em>
            {session.model && <em>{session.model}</em>}
            {composerDirty && <span className="composer-state">Editing</span>}
          </div>
          <button className="icon" onClick={onClose} title="크게 보기 닫기">
            <X size={16} />
          </button>
        </header>
        <HqTerminalPreview
          sessionId={session.id}
          initialPreviewText={session.preview_text || session.preview}
          initialPreviewAnsi={session.preview_ansi}
          variant="fullscreen"
        />
        <footer onMouseDown={stopTerminalTileFooterMouseDown}>
          <select value={target} onChange={(event) => setTarget(event.target.value)} onMouseDown={stopTerminalTileFooterMouseDown}>
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {sessionDisplayName(item)}
              </option>
            ))}
          </select>
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onFocus={() => {
              blurActiveXtermHelper();
              setComposerFocused(true);
            }}
            onBlur={() => setComposerFocused(false)}
            onChange={(event) => {
              promptRef.current = event.target.value;
              setPrompt(event.target.value);
              writeTerminalCardDraft(window.localStorage, session.id, event.target.value);
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder="지시 입력"
          />
          <button className="primary icon" onMouseDown={stopTerminalTileFooterMouseDown} onClick={send} title="전송" disabled={isSending || !prompt.trim()}>
            <Send size={15} />
          </button>
        </footer>
        <div className="workspace-path">{session.cwd}</div>
      </section>
    </div>
  );
}

const HqTerminalPreview = React.memo(function HqTerminalPreview({
  sessionId,
  initialPreviewText,
  initialPreviewAnsi,
  variant = "card"
}: {
  sessionId: string;
  initialPreviewText?: string | null;
  initialPreviewAnsi?: string | null;
  variant?: "card" | "fullscreen";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const seededSessionRef = useRef<string | null>(null);
  const seededPreviewRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string>("");
  const firstSnapshotReceivedRef = useRef<boolean>(false);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedDimsRef = useRef<{ cols: number; rows: number } | null>(null);
  const [wsKey, setWsKey] = React.useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontSize: variant === "fullscreen" ? 13 : 12,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
      scrollback: TERMINAL_PREVIEW_SCROLLBACK_LINES,
      convertEol: false,
      cursorBlink: false,
      disableStdin: false,
      theme: {
        background: "#070c15",
        foreground: "#d8e2f1",
        cursor: "#60a5fa",
        selectionBackground: "#334155"
      }
    });
    const fit = new FitAddon();
    terminalRef.current = term;
    fitRef.current = fit;
    term.loadAddon(fit);
    term.open(container);
    // Forward keyboard input to PTY via WS input message
    term.onData((data) => {
      const sock = socketRef.current;
      const sid = currentSessionIdRef.current;
      if (sock?.readyState === WebSocket.OPEN && sid) {
        sock.send(JSON.stringify({ type: "input", sessionId: sid, data }));
      }
    });
    term.onResize(({ cols, rows }) => {
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = setTimeout(() => {
        resizeDebounceRef.current = null;
        // Card variant: suppress resize WS to prevent layout-change SIGWINCH blank.
        // Size is locked at attach time (attach cols/rows); dynamic resize not needed for preview.
        if (variant !== "fullscreen") return;
        // Block resize WS until first snapshot/output received.
        if (!firstSnapshotReceivedRef.current) return;
        const lastDims = lastEmittedDimsRef.current;
        if (lastDims && lastDims.cols === cols && lastDims.rows === rows) return;
        const sock = socketRef.current;
        const sid = currentSessionIdRef.current;
        if (sock?.readyState === WebSocket.OPEN && sid) {
          sock.send(JSON.stringify({ type: "resize", sessionId: sid, cols, rows }));
          lastEmittedDimsRef.current = { cols, rows };
        }
      }, 300);
    });
    const runFit = () => {
      try {
        fit.fit();
      } catch {}
    };
    const fitTimers = [0, 120, 360].map((delay) => window.setTimeout(runFit, delay));
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => runFit())
      : null;
    resizeObserver?.observe(container);
    document.fonts?.ready.then(runFit).catch(() => undefined);
    return () => {
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }
      fitTimers.forEach((timer) => window.clearTimeout(timer));
      resizeObserver?.disconnect();
      terminalRef.current = null;
      fitRef.current = null;
      closeWebSocket(socketRef.current);
      socketRef.current = null;
      seededSessionRef.current = null;
      seededPreviewRef.current = null;
      lastEmittedDimsRef.current = null;
      term.dispose();
    };
  }, [variant]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    currentSessionIdRef.current = sessionId;
    seededSessionRef.current = null;
    firstSnapshotReceivedRef.current = false;
    lastEmittedDimsRef.current = null;
    if (resizeDebounceRef.current) {
      clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = null;
    }
    term.reset();
    // Re-seed from preview props immediately on WS reconnect (wsKey change) so reconnect
    // never shows blank — WS snapshot will overwrite this if non-blank.
    // Also reset seededPreviewRef so third effect can re-seed if deps change.
    seededPreviewRef.current = null;
    const reconnectSeedSource = hasMeaningfulTerminalText(initialPreviewAnsi)
      ? `${TERMINAL_PREVIEW_CLEAR_PREFIX}${initialPreviewAnsi}`
      : initialPreviewText;
    if (typeof reconnectSeedSource === "string" && hasMeaningfulTerminalText(reconnectSeedSource)) {
      term.write(tailTerminalLines(tailStringByUtf8Bytes(reconnectSeedSource, TERMINAL_PREVIEW_SEED_BYTES)));
    }
    closeWebSocket(socketRef.current);
    const socket = new WebSocket(terminalWsUrl());
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      const fitAddon = fitRef.current;
      if (fitAddon) { try { fitAddon.fit(); } catch {} }
      if (variant !== "fullscreen") {
        // Card variant: wait for valid proposeDimensions before attaching so each card's PTY
        // is sized to match its actual container (Fleet/Equal/Focus/Work differ in card size).
        // ResizeObserver retries until container is laid out and proposeDimensions returns non-zero.
        // fdd3149 still blocks subsequent resize WS → no T+12 SIGWINCH from layout changes.
        // 41cb04d pre_resize_snapshot → initial attach SIGWINCH doesn't blank the snapshot.
        const sendCardAttach = (cols: number, rows: number) => {
          if (socket.readyState !== WebSocket.OPEN || socketRef.current !== socket) return;
          const cardPayload: Record<string, unknown> = { type: "attach", sessionId };
          if (cols > 0 && rows > 0) { cardPayload.cols = cols; cardPayload.rows = rows; }
          socket.send(JSON.stringify(cardPayload));
        };
        const tryPropose = () => {
          if (fitAddon) { try { fitAddon.fit(); } catch {} }
          const p = fitAddon?.proposeDimensions();
          return p && p.cols > 0 && p.rows > 0 ? p : null;
        };
        const immediate = tryPropose();
        if (immediate) {
          sendCardAttach(immediate.cols, immediate.rows);
        } else {
          const c = containerRef.current;
          if (!c) { sendCardAttach(0, 0); return; }
          let sent = false;
          const cardObserver = new ResizeObserver(() => {
            if (sent) return;
            const p = tryPropose();
            if (p) { sent = true; cardObserver.disconnect(); sendCardAttach(p.cols, p.rows); }
          });
          cardObserver.observe(c);
          setTimeout(() => {
            if (sent) return;
            sent = true;
            cardObserver.disconnect();
            const p = tryPropose();
            sendCardAttach(p?.cols ?? 0, p?.rows ?? 0);
          }, 1000);
        }
        return;
      }
      // Fullscreen variant: wait for non-zero cols/rows, then attach with resize dimensions.
      const doAttach = () => {
        if (socket.readyState !== WebSocket.OPEN || socketRef.current !== socket) return;
        const dims = {
          cols: terminalRef.current?.cols ?? 0,
          rows: terminalRef.current?.rows ?? 0
        };
        const payload: Record<string, unknown> = { type: "attach", sessionId };
        if (dims.cols > 0 && dims.rows > 0) {
          payload.cols = dims.cols;
          payload.rows = dims.rows;
          lastEmittedDimsRef.current = dims;
        } else {
          lastEmittedDimsRef.current = null;
        }
        socket.send(JSON.stringify(payload));
      };
      const curCols = terminalRef.current?.cols ?? 0;
      const curRows = terminalRef.current?.rows ?? 0;
      if (curCols > 0 && curRows > 0) {
        doAttach();
      } else {
        // Container not yet laid out — wait for first non-zero cols/rows, then attach
        const c = containerRef.current;
        if (!c) { doAttach(); return; }
        let attachSent = false;
        const attachObserver = new ResizeObserver(() => {
          if (attachSent) return;
          if (fitAddon) { try { fitAddon.fit(); } catch {} }
          const cols = terminalRef.current?.cols ?? 0;
          const rows = terminalRef.current?.rows ?? 0;
          if (cols > 0 && rows > 0) {
            attachSent = true;
            attachObserver.disconnect();
            doAttach();
          }
        });
        attachObserver.observe(c);
        // Safety fallback: attach after 2s even if container never becomes non-zero
        setTimeout(() => {
          if (attachSent) return;
          attachSent = true;
          attachObserver.disconnect();
          doAttach();
        }, 2000);
      }
    });
    socket.addEventListener("message", (event) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const messageSessionId = typeof message.sessionId === "string"
        ? message.sessionId
        : typeof message.session_id === "string"
          ? message.session_id
          : "";
      if (messageSessionId !== sessionId || (message.type !== "snapshot" && message.type !== "output")) return;
      const data = typeof message.data === "string" ? message.data : "";
      if (!data) return;
      if (!firstSnapshotReceivedRef.current && resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }
      // Ungate resize WS on first content received
      firstSnapshotReceivedRef.current = true;
      if (message.type === "snapshot" && seededSessionRef.current !== sessionId) {
        // Skip blank snapshots (CLEAR_PREFIX only or all whitespace) so initialPreviewText seed remains usable
        const visibleContent = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\s/g, "");
        if (visibleContent.length === 0) return;
        seededSessionRef.current = sessionId;
        term.reset();
      }
      const shouldFollowTail = message.type === "snapshot" || term.buffer.active.viewportY >= term.buffer.active.baseY - 1;
      term.write(data, () => {
        if (shouldFollowTail) term.scrollToBottom();
      });
    });
    socket.addEventListener("close", () => {
      if (socketRef.current === socket) socketRef.current = null;
      setTimeout(() => {
        if (terminalRef.current && currentSessionIdRef.current === sessionId && socketRef.current === null) {
          setWsKey(k => k + 1);
        }
      }, 2000);
    });
    return () => {
      if (socketRef.current === socket) socketRef.current = null;
      closeWebSocket(socket);
    };
  }, [sessionId, wsKey]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term || seededSessionRef.current === sessionId) return;
    const seedSource = hasMeaningfulTerminalText(initialPreviewAnsi)
      ? `${TERMINAL_PREVIEW_CLEAR_PREFIX}${initialPreviewAnsi}`
      : initialPreviewText;
    if (typeof seedSource !== "string" || !hasMeaningfulTerminalText(seedSource)) return;
    const seedKey = `${sessionId}:${seedSource.length}:${seedSource.slice(-80)}`;
    if (seededPreviewRef.current === seedKey) return;
    seededPreviewRef.current = seedKey;
    term.reset();
    term.write(tailTerminalLines(tailStringByUtf8Bytes(seedSource, TERMINAL_PREVIEW_SEED_BYTES)), () => {
      term.scrollToBottom();
    });
  }, [sessionId, initialPreviewText, initialPreviewAnsi]);

  return (
    <div
      className={`terminal-snapshot-preview ${variant === "fullscreen" ? "fullscreen" : ""}`}
      aria-label="Terminal output"
      role="log"
      tabIndex={0}
      ref={containerRef}
      onMouseDown={(e) => { e.preventDefault(); terminalRef.current?.focus(); }}
      onWheel={(e) => e.stopPropagation()}
    />
  );
});

function TerminalLogView({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
      scrollback: TERMINAL_SCROLLBACK_LINES,
      convertEol: false,
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
                {sessionDisplayName(session)}
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

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function codexYoloArgs(model: string) {
  return ["--model", model, "--cd", ".", "--no-alt-screen", "--dangerously-bypass-approvals-and-sandbox"];
}

function codexStartupPolicyPrompt(agentId: string) {
  return [
    "[LCC BOOT POLICY - MUST READ BEFORE WORK]",
    `agent=${agentId}`,
    "1. Read AGENTS.md at repo root.",
    "2. Read data/branch-boot-context.md.",
    "3. Read docs/command-chain-policy-20260531.md.",
    "4. Read docs/agent-state-management-policy-20260531.md.",
    "5. Read data/ceo-command-ledger.json and data/work-ledger.json before selecting or accepting work.",
    "6. Read data/agent-boot-prompts.json and follow your own role entry.",
    "7. Recover memory before reporting: if 9001 is available, inspect GET /api/memory/recover/<agent-id>; if 9001 is unavailable or recovered_context.daily_memory is missing, read data/daily-memory/YYYY-MM-DD.md and data/memory-ledger.jsonl directly.",
    "Rules: 9001 startup begins with Caesar and Max. Caesar/Max inspect the ledger before spawning workers. Workers are spawned only for needed active ledger items. Preserve 9001 singleton context. UI work needs CDP/screenshot evidence. Do not code before POLICY_ACK unless Lucas gives a direct emergency instruction.",
    "Reply first with: POLICY_ACK agent=<id> role=<role> read=<files> mode=<normal|lucas-direct|emergency> ledger_item=<id|none> next=<first action> blocker=<none|...>"
  ].join("\n");
}

function sessionDisplayName(session: Pick<Session, "id" | "name">) {
  if (session.id === "audit-officer") return "Lux";
  if (session.id === "dev-lead") return "Max";
  if (session.id === "ceo") return "Caesar";
  return session.name;
}

async function sendCodexStartupPolicy(agentId: string) {
  await sleep(2200);
  await sendTerminalPrompt(agentId, "").catch(() => undefined);
  await sleep(3200);
  await sendTerminalPrompt(agentId, codexStartupPolicyPrompt(agentId)).catch(() => undefined);
}

function standardDevAgents(cmd: string, model: string) {
  return [
    { id: "dev-lead", name: "Max", team: "development", cwd: "workspaces/dev-lead/repo", cmd, args: codexYoloArgs(model), model },
    ...Array.from({ length: 8 }, (_, index) => {
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
