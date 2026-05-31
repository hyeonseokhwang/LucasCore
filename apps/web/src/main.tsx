import {
  Activity,
  Bot,
  Boxes,
  FileText,
  LayoutGrid,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTopClose,
  PanelTopOpen,
  Plus,
  Send,
  ScrollText,
  Square,
  Terminal,
  Trash2,
  Users
} from "lucide-react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
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

const api = {
  async get<T>(path: string): Promise<T> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  async send<T>(path: string, method: string, body?: unknown): Promise<T> {
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
};

function App() {
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
    const filtered = filter === "all" ? sessions : sessions.filter((session) => session.team === filter || session.status === filter);
    return [...filtered].sort((a, b) => agentRank(a.id) - agentRank(b.id) || a.name.localeCompare(b.name));
  }, [filter, sessions]);

  const teams = useMemo(() => [...new Set(sessions.map((session) => session.team).filter(Boolean))], [sessions]);

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
          <button className="filter active" onClick={() => setFilter("all")}>
            <Activity size={14} /> All
          </button>
          <button className="filter" onClick={() => setFilter("active")}>
            <span className="dot green" /> Active
          </button>
          {teams.map((team) => (
            <button className="filter" key={team} onClick={() => setFilter(team)}>
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
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message" />
            <button className="primary icon" disabled={!draft.trim() || sending} title="Send">
              <Send size={15} />
            </button>
          </form>
        </section>
      )}
    </div>
  );
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
    const agents = standardDevAgents(cmd, model).filter((agent) => !existing.has(agent.id));

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
        <span>Spawn one dev lead and five GPT-5.5 Codex developers in isolated workspaces.</span>
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
  const [logText, setLogText] = useState("");

  async function send() {
    if (!prompt.trim()) return;
    const payload = target === session.id ? prompt : `[FROM ${session.id} TO ${target}] ${prompt}`;
    await api.send(`/api/sessions/${target}/write`, "POST", { input: payload });
    setPrompt("");
    await onChanged();
  }

  async function openLog() {
    const response = await fetch(`/api/sessions/${session.id}/log`);
    setLogText(await response.text());
    setLogOpen(true);
  }

  async function stop() {
    if (!confirm(`Stop ${session.name}?`)) return;
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
          <button title="Terminal log" onClick={openLog}>
            <ScrollText size={13} />
          </button>
          <button title="Stop" onClick={stop}>
            <Square size={13} />
          </button>
          <button title="Delete" onClick={stop}>
            <Trash2 size={13} />
          </button>
        </div>
      </header>
      <XtermPreview sessionId={session.id} status={session.status} />
      <footer>
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          {sessions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send().catch(console.error);
          }}
          placeholder="Prompt"
        />
        <button className="primary icon" onClick={send} title="Send">
          <Send size={15} />
        </button>
      </footer>
      <div className="workspace-path">{session.cwd}</div>
      {logOpen && (
        <div className="log-modal" role="dialog" aria-modal="true">
          <div className="log-panel">
            <header>
              <strong>{session.name} terminal log</strong>
              <button onClick={() => setLogOpen(false)}>Close</button>
            </header>
            <TerminalLogView text={logText || "No log captured for this session yet. Restart the session after logging is enabled.\r\n"} />
          </div>
        </div>
      )}
    </article>
  );
}

function XtermPreview({ sessionId, status }: { sessionId: string; status: SessionStatus }) {
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
      fontSize: 12,
      fontFamily:
        "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, 'Segoe UI Symbol', 'Noto Sans Symbols 2', monospace",
      fontWeight: 400,
      fontWeightBold: 700,
      drawBoldTextInBrightColors: false,
      cursorBlink: status === "active",
      scrollback: 500,
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
  }, [sessionId]);

  return <div className="xterm-preview" ref={containerRef} />;
}

function TerminalLogView({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
      scrollback: 10000,
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
    ...Array.from({ length: 5 }, (_, index) => {
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
