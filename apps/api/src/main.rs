use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    env,
    io::{Read, Write},
    net::SocketAddr,
    path::PathBuf,
    sync::Arc,
    thread,
};
use tokio::{
    fs,
    io::AsyncWriteExt,
    runtime::Handle,
    sync::{broadcast, Mutex, RwLock},
};
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    sessions: Arc<RwLock<HashMap<String, Arc<Mutex<TerminalSession>>>>>,
    tx: broadcast::Sender<ServerEvent>,
    canvas_store: CanvasStore,
    peer_store: PeerStore,
}

struct TerminalSession {
    meta: SessionMeta,
    _master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    output: VecDeque<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionMeta {
    id: String,
    name: String,
    team: String,
    cwd: String,
    cmd: String,
    args: Vec<String>,
    model: Option<String>,
    status: SessionStatus,
    pid: Option<u32>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum SessionStatus {
    Active,
    Exited,
    Error,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionView {
    #[serde(flatten)]
    meta: SessionMeta,
    preview: String,
}

#[derive(Debug, Deserialize)]
struct CreateSession {
    id: Option<String>,
    name: Option<String>,
    team: Option<String>,
    cwd: Option<String>,
    cmd: Option<String>,
    args: Option<Vec<String>>,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WriteSession {
    input: Option<String>,
    data: Option<String>,
    prompt: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ResizeSession {
    cols: Option<u16>,
    rows: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ServerEvent {
    Attached { session_id: String },
    Replay { session_id: String, data: String },
    SessionCreated { session: SessionView },
    SessionDeleted { session_id: String },
    Output { session_id: String, source: String, data: String },
    Input { session_id: String, data: String },
    Exit { session_id: String, code: Option<i32> },
    Error { session_id: Option<String>, message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Canvas {
    id: String,
    title: String,
    owner: String,
    status: String,
    canvas_type: String,
    members: Vec<String>,
    linked_issues: Vec<String>,
    linked_meetings: Vec<String>,
    content: Vec<CanvasSection>,
    messages: Vec<CanvasMessage>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CanvasSection {
    id: String,
    title: String,
    body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CanvasMessage {
    id: String,
    author: String,
    body: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PeerMessage {
    id: String,
    at: DateTime<Utc>,
    #[serde(rename = "from")]
    from_peer: String,
    to: String,
    kind: String,
    body: String,
}

#[derive(Debug, Deserialize)]
struct CreateCanvas {
    id: Option<String>,
    title: Option<String>,
    owner: Option<String>,
    canvas_type: Option<String>,
    members: Option<Vec<String>>,
    linked_issues: Option<Vec<String>>,
    linked_meetings: Option<Vec<String>>,
    content: Option<Vec<CanvasSection>>,
}

#[derive(Debug, Deserialize)]
struct AddMessage {
    author: Option<String>,
    body: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct InviteMember {
    member: Option<String>,
    agent: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreatePeerMessage {
    id: Option<String>,
    at: Option<DateTime<Utc>>,
    #[serde(rename = "from")]
    from_peer: Option<String>,
    to: Option<String>,
    kind: Option<String>,
    body: Option<String>,
}

#[derive(Clone)]
struct CanvasStore {
    path: Arc<PathBuf>,
    canvases: Arc<RwLock<Vec<Canvas>>>,
}

#[derive(Clone)]
struct PeerStore {
    path: Arc<PathBuf>,
    messages: Arc<RwLock<Vec<PeerMessage>>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("lcc_core_api=debug,tower_http=info,axum=info")
        .init();

    let (tx, _) = broadcast::channel(512);
    let storage_path = env::var("LCC_STORAGE_PATH").unwrap_or_else(|_| "data/canvases.json".to_string());
    let canvas_store = CanvasStore::new(PathBuf::from(storage_path)).await?;
    let peer_storage_path = env::var("LCC_PEER_STORAGE_PATH").unwrap_or_else(|_| "data/peer-bridge.jsonl".to_string());
    let peer_store = PeerStore::new(PathBuf::from(peer_storage_path)).await?;
    let state = AppState {
        sessions: Arc::new(RwLock::new(HashMap::new())),
        tx,
        canvas_store,
        peer_store,
    };

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/sessions", get(list_sessions).post(create_session))
        .route("/api/sessions/active", get(list_sessions))
        .route("/api/sessions/pty-stats", get(pty_stats))
        .route("/api/sessions/:id", delete(delete_session))
        .route("/api/sessions/:id/log", get(get_session_log))
        .route("/api/sessions/:id/write", post(write_session))
        .route("/api/sessions/:id/resize", post(resize_session))
        .route("/ws/terminal", get(terminal_ws))
        .route("/api/peer/status", get(peer_status))
        .route("/api/peer/messages", get(list_peer_messages).post(add_peer_message))
        .route("/api/canvases", get(list_canvases).post(create_canvas))
        .route("/api/canvases/:id", get(get_canvas).patch(update_canvas))
        .route("/api/canvases/:id/content", get(get_content).put(put_content).patch(put_content))
        .route("/api/canvases/:id/messages", get(get_messages).post(add_message))
        .route("/api/canvases/:id/invite", post(invite_member))
        .nest_service("/", ServeDir::new("apps/web/dist").fallback(ServeDir::new("apps/web")))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let host = env::var("LCC_API_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("LCC_API_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(9000);
    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .expect("LCC_API_HOST/LCC_API_PORT must form a valid socket address");
    tracing::info!("LCC Core API listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "service": "lcc-core-api",
        "time": Utc::now(),
        "sessions": state.sessions.read().await.len()
    }))
}

async fn list_sessions(State(state): State<AppState>) -> Json<Vec<SessionView>> {
    let sessions = state.sessions.read().await;
    let mut views = Vec::new();
    for session in sessions.values() {
        views.push(session.lock().await.view());
    }
    Json(views)
}

async fn pty_stats(State(state): State<AppState>) -> Json<Value> {
    let sessions = list_sessions(State(state)).await.0;
    let active = sessions
        .iter()
        .filter(|session| matches!(session.meta.status, SessionStatus::Active))
        .count();
    Json(json!({ "total": sessions.len(), "active": active, "sessions": sessions }))
}

async fn create_session(
    State(state): State<AppState>,
    Json(input): Json<CreateSession>,
) -> Result<(StatusCode, Json<SessionView>), ApiError> {
    let id = input.id.unwrap_or_else(|| format!("lcc-agent-{}", Utc::now().timestamp_millis()));
    if state.sessions.read().await.contains_key(&id) {
        return Err(ApiError::conflict("session already exists"));
    }

    let cmd = input.cmd.unwrap_or_else(default_shell);
    let args = input.args.unwrap_or_default();
    let cwd = input.cwd.unwrap_or_else(|| ".".to_string());
    fs::create_dir_all(&cwd)
        .await
        .map_err(|err| ApiError::bad_request(format!("workspace create failed: {err}")))?;
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 36,
            cols: 140,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| ApiError::bad_request(format!("pty open failed: {err}")))?;
    let mut command = CommandBuilder::new(&cmd);
    command.args(args.iter().map(String::as_str));
    command.cwd(&cwd);
    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|err| ApiError::bad_request(format!("spawn failed: {err}")))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|err| ApiError::bad_request(format!("pty reader failed: {err}")))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|err| ApiError::bad_request(format!("pty writer failed: {err}")))?;
    let meta = SessionMeta {
        id: id.clone(),
        name: input.name.unwrap_or_else(|| id.clone()),
        team: input.team.unwrap_or_else(|| "lcc".to_string()),
        cwd,
        cmd,
        args,
        model: input.model,
        status: SessionStatus::Active,
        pid: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        exit_code: None,
    };
    let session = Arc::new(Mutex::new(TerminalSession {
        meta,
        _master: pair.master,
        writer,
        output: VecDeque::new(),
    }));

    state.sessions.write().await.insert(id.clone(), session.clone());
    spawn_pty_reader(state.clone(), id.clone(), reader);
    spawn_pty_waiter(state.clone(), id.clone(), move || child.wait().ok().map(|status| status.exit_code() as i32));
    let view = session.lock().await.view();
    let _ = state.tx.send(ServerEvent::SessionCreated { session: view.clone() });
    Ok((StatusCode::CREATED, Json(view)))
}

async fn delete_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let Some(session) = state.sessions.write().await.remove(&id) else {
        return Err(ApiError::not_found("session not found"));
    };
    let mut session = session.lock().await;
    session.meta.status = SessionStatus::Stopped;
    let _ = session.writer.write_all(b"\x03exit\r\n");
    let _ = state.tx.send(ServerEvent::SessionDeleted { session_id: id });
    Ok(Json(json!({ "ok": true })))
}

async fn write_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<WriteSession>,
) -> Result<Json<SessionView>, ApiError> {
    let data = input.input.or(input.data).or(input.prompt).unwrap_or_default();
    let session = write_to_session(&state, &id, data).await?;
    Ok(Json(session))
}

async fn get_session_log(Path(id): Path<String>) -> Result<impl IntoResponse, ApiError> {
    let path = terminal_log_path(&id);
    let text = match fs::read_to_string(path).await {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(err) => return Err(ApiError::internal(err)),
    };
    Ok(([(header::CONTENT_TYPE, "text/plain; charset=utf-8")], text))
}

async fn resize_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<ResizeSession>,
) -> Result<Json<Value>, ApiError> {
    let cols = input.cols.unwrap_or(120).clamp(20, 300);
    let rows = input.rows.unwrap_or(30).clamp(5, 120);
    resize_to_session(&state, &id, cols, rows).await?;
    Ok(Json(json!({ "ok": true, "cols": cols, "rows": rows })))
}

async fn terminal_ws(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| terminal_socket(socket, state))
}

async fn terminal_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.tx.subscribe();
    let mut attached_sessions = HashSet::<String>::new();
    loop {
        tokio::select! {
            event = rx.recv() => {
                let Ok(event) = event else {
                    break;
                };
                if let Some(session_id) = event_session_id(&event) {
                    if !attached_sessions.contains(session_id) && !matches!(event, ServerEvent::SessionDeleted { .. } | ServerEvent::Exit { .. }) {
                        continue;
                    }
                }
                let Ok(text) = serde_json::to_string(&event) else {
                    continue;
                };
                if socket.send(Message::Text(text)).await.is_err() {
                    break;
                }
            }
            inbound = socket.recv() => {
                let Some(Ok(message)) = inbound else {
                    break;
                };
                if let Message::Text(text) = message {
                    if let Ok(value) = serde_json::from_str::<Value>(&text) {
                        if value.get("type").and_then(Value::as_str) == Some("attach") {
                            if let Some(session_id) = value.get("sessionId").or_else(|| value.get("session_id")).and_then(Value::as_str) {
                                attached_sessions.insert(session_id.to_string());
                            }
                        }
                    }
                    if let Some(response) = handle_terminal_protocol(&state, &text).await {
                        let _ = socket.send(Message::Text(response.to_string())).await;
                    }
                }
            }
        }
    }
}

fn event_session_id(event: &ServerEvent) -> Option<&str> {
    match event {
        ServerEvent::Attached { session_id }
        | ServerEvent::Replay { session_id, .. }
        | ServerEvent::SessionDeleted { session_id }
        | ServerEvent::Output { session_id, .. }
        | ServerEvent::Input { session_id, .. }
        | ServerEvent::Exit { session_id, .. } => Some(session_id),
        ServerEvent::SessionCreated { .. } | ServerEvent::Error { session_id: None, .. } => None,
        ServerEvent::Error { session_id: Some(session_id), .. } => Some(session_id),
    }
}

async fn handle_terminal_protocol(state: &AppState, raw: &str) -> Option<Value> {
    let value = serde_json::from_str::<Value>(raw).ok()?;
    let kind = value.get("type")?.as_str()?;
    let session_id = value
        .get("sessionId")
        .or_else(|| value.get("session_id"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    match kind {
        "attach" => {
            let sessions = state.sessions.read().await;
            let Some(session) = sessions.get(&session_id).cloned() else {
                return Some(json!({ "type": "error", "sessionId": session_id, "message": "session not found" }));
            };
            let session = session.lock().await;
            let preview = session.view().preview;
            let _ = state.tx.send(ServerEvent::Attached { session_id: session_id.clone() });
            Some(json!({ "type": "replay", "sessionId": session_id, "data": preview }))
        }
        "input" => {
            let data = value.get("data").and_then(Value::as_str).unwrap_or_default().to_string();
            match write_raw_to_session(state, &session_id, data).await {
                Ok(_) => None,
                Err(err) => Some(json!({ "type": "error", "sessionId": session_id, "message": err.message })),
            }
        }
        "sendPrompt" => {
            let prompt = value.get("prompt").and_then(Value::as_str).unwrap_or_default().to_string();
            match write_to_session(state, &session_id, prompt).await {
                Ok(_) => None,
                Err(err) => Some(json!({ "type": "error", "sessionId": session_id, "message": err.message })),
            }
        }
        "resize" => {
            let cols = value.get("cols").and_then(Value::as_u64).unwrap_or(120).clamp(20, 300) as u16;
            let rows = value.get("rows").and_then(Value::as_u64).unwrap_or(30).clamp(5, 120) as u16;
            match resize_to_session(state, &session_id, cols, rows).await {
                Ok(_) => Some(json!({ "type": "resized", "sessionId": session_id, "ok": true, "cols": cols, "rows": rows })),
                Err(err) => Some(json!({ "type": "error", "sessionId": session_id, "message": err.message })),
            }
        }
        _ => Some(json!({ "type": "error", "sessionId": session_id, "message": "unknown terminal protocol message" })),
    }
}

async fn resize_to_session(state: &AppState, id: &str, cols: u16, rows: u16) -> Result<SessionView, ApiError> {
    let Some(session) = state.sessions.read().await.get(id).cloned() else {
        return Err(ApiError::not_found("session not found"));
    };
    let mut session = session.lock().await;
    session
        ._master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(ApiError::internal)?;
    session.meta.updated_at = Utc::now();
    Ok(session.view())
}

async fn write_to_session(state: &AppState, id: &str, data: String) -> Result<SessionView, ApiError> {
    let line = if data.ends_with('\n') || data.ends_with('\r') { data } else { format!("{data}\r\n") };
    write_session_bytes(state, id, line, true).await
}

async fn write_raw_to_session(state: &AppState, id: &str, data: String) -> Result<SessionView, ApiError> {
    write_session_bytes(state, id, data, false).await
}

async fn write_session_bytes(state: &AppState, id: &str, data: String, echo_input: bool) -> Result<SessionView, ApiError> {
    let Some(session) = state.sessions.read().await.get(id).cloned() else {
        return Err(ApiError::not_found("session not found"));
    };
    let mut session = session.lock().await;
    if !data.is_empty() {
        session.writer.write_all(data.as_bytes()).map_err(ApiError::internal)?;
        session.writer.flush().map_err(ApiError::internal)?;
        session.meta.updated_at = Utc::now();
        if echo_input {
            let _ = state.tx.send(ServerEvent::Input { session_id: id.to_string(), data });
        }
    }
    Ok(session.view())
}

fn spawn_pty_reader(state: AppState, id: String, mut reader: Box<dyn Read + Send>) {
    let handle = Handle::current();
    let log_path = terminal_log_path(&id);
    thread::spawn(move || {
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let mut log_file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .ok();
        if let Some(file) = log_file.as_mut() {
            let _ = writeln!(file, "\r\n===== LCC session {id} started at {} =====\r", Utc::now().to_rfc3339());
        }
        let mut buf = [0_u8; 4096];
        loop {
            let Ok(n) = reader.read(&mut buf) else {
                break;
            };
            if n == 0 {
                break;
            }
            if let Some(file) = log_file.as_mut() {
                let _ = file.write_all(&buf[..n]);
                let _ = file.flush();
            }
            let data = String::from_utf8_lossy(&buf[..n]).to_string();
            let state_for_buffer = state.clone();
            let id_for_buffer = id.clone();
            let data_for_buffer = data.clone();
            handle.spawn(async move {
                if let Some(session) = state_for_buffer.sessions.read().await.get(&id_for_buffer).cloned() {
                    session.lock().await.push_output(&data_for_buffer);
                }
            });
            let _ = state.tx.send(ServerEvent::Output {
                session_id: id.clone(),
                source: "pty".to_string(),
                data,
            });
        }
    });
}

fn terminal_log_path(id: &str) -> PathBuf {
    let safe_id: String = id
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') { ch } else { '_' })
        .collect();
    PathBuf::from("data").join("terminal-logs").join(format!("{safe_id}.ansi.log"))
}

fn spawn_pty_waiter<F>(state: AppState, id: String, wait: F)
where
    F: FnOnce() -> Option<i32> + Send + 'static,
{
    let handle = Handle::current();
    thread::spawn(move || {
        let code = wait();
        let state_for_status = state.clone();
        let id_for_status = id.clone();
        handle.spawn(async move {
            if let Some(session) = state_for_status.sessions.read().await.get(&id_for_status).cloned() {
                let mut session = session.lock().await;
                session.meta.status = SessionStatus::Exited;
                session.meta.exit_code = code;
                session.meta.updated_at = Utc::now();
            }
        });
        let _ = state.tx.send(ServerEvent::Exit { session_id: id, code });
    });
}

impl TerminalSession {
    fn push_output(&mut self, data: &str) {
        self.output.push_back(data.to_string());
        while self.output.iter().map(String::len).sum::<usize>() > 50_000 {
            self.output.pop_front();
        }
        self.meta.updated_at = Utc::now();
    }

    fn view(&self) -> SessionView {
        SessionView {
            meta: self.meta.clone(),
            preview: self.output.iter().cloned().collect::<String>(),
        }
    }
}

async fn peer_status(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "service": "lcc-peer-bridge",
        "messages": state.peer_store.messages.read().await.len(),
        "path": state.peer_store.path.display().to_string()
    }))
}

async fn list_peer_messages(State(state): State<AppState>) -> Json<Vec<PeerMessage>> {
    Json(state.peer_store.messages.read().await.clone())
}

async fn add_peer_message(
    State(state): State<AppState>,
    Json(input): Json<CreatePeerMessage>,
) -> Result<(StatusCode, Json<PeerMessage>), ApiError> {
    let message = PeerMessage {
        id: input.id.unwrap_or_else(|| format!("peer-msg-{}", Utc::now().timestamp_millis())),
        at: input.at.unwrap_or_else(Utc::now),
        from_peer: require_field(input.from_peer, "from")?,
        to: require_field(input.to, "to")?,
        kind: input.kind.unwrap_or_else(|| "terminal".to_string()),
        body: require_field(input.body, "body")?,
    };
    state.peer_store.insert(message.clone()).await?;
    Ok((StatusCode::CREATED, Json(message)))
}

fn require_field(value: Option<String>, field: &str) -> Result<String, ApiError> {
    let Some(value) = value else {
        return Err(ApiError::bad_request(format!("{field} is required")));
    };
    if value.trim().is_empty() {
        return Err(ApiError::bad_request(format!("{field} is required")));
    }
    Ok(value)
}

async fn list_canvases(State(state): State<AppState>) -> Json<Vec<Canvas>> {
    Json(state.canvas_store.canvases.read().await.clone())
}

async fn create_canvas(
    State(state): State<AppState>,
    Json(input): Json<CreateCanvas>,
) -> Result<(StatusCode, Json<Canvas>), ApiError> {
    let now = Utc::now();
    let canvas = Canvas {
        id: input.id.unwrap_or_else(|| format!("canvas-{}", now.timestamp_millis())),
        title: input.title.unwrap_or_else(|| "Untitled Canvas".to_string()),
        owner: input.owner.unwrap_or_else(|| "Lucas".to_string()),
        status: "active".to_string(),
        canvas_type: input.canvas_type.unwrap_or_else(|| "issue".to_string()),
        members: input.members.unwrap_or_default(),
        linked_issues: input.linked_issues.unwrap_or_default(),
        linked_meetings: input.linked_meetings.unwrap_or_default(),
        content: input.content.unwrap_or_else(default_sections),
        messages: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    state.canvas_store.insert(canvas.clone()).await?;
    Ok((StatusCode::CREATED, Json(canvas)))
}

async fn get_canvas(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Canvas>, ApiError> {
    state.canvas_store.get(&id).await.map(Json)
}

async fn update_canvas(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(patch): Json<Value>,
) -> Result<Json<Canvas>, ApiError> {
    let canvas = state
        .canvas_store
        .update(&id, |canvas| {
            if let Some(title) = patch.get("title").and_then(Value::as_str) {
                canvas.title = title.to_string();
            }
            if let Some(owner) = patch.get("owner").and_then(Value::as_str) {
                canvas.owner = owner.to_string();
            }
            canvas.updated_at = Utc::now();
        })
        .await?;
    Ok(Json(canvas))
}

async fn get_content(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<CanvasSection>>, ApiError> {
    Ok(Json(state.canvas_store.get(&id).await?.content))
}

async fn put_content(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(content): Json<Vec<CanvasSection>>,
) -> Result<Json<Vec<CanvasSection>>, ApiError> {
    let canvas = state
        .canvas_store
        .update(&id, |canvas| {
            canvas.content = content;
            canvas.updated_at = Utc::now();
        })
        .await?;
    Ok(Json(canvas.content))
}

async fn get_messages(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<CanvasMessage>>, ApiError> {
    Ok(Json(state.canvas_store.get(&id).await?.messages))
}

async fn add_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<AddMessage>,
) -> Result<(StatusCode, Json<CanvasMessage>), ApiError> {
    let message = CanvasMessage {
        id: format!("msg-{}", Utc::now().timestamp_millis()),
        author: input.author.unwrap_or_else(|| "Lucas".to_string()),
        body: input.body.or(input.message).unwrap_or_default(),
        created_at: Utc::now(),
    };
    state
        .canvas_store
        .update(&id, |canvas| {
            canvas.messages.push(message.clone());
            canvas.updated_at = Utc::now();
        })
        .await?;
    Ok((StatusCode::CREATED, Json(message)))
}

async fn invite_member(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<InviteMember>,
) -> Result<Json<Canvas>, ApiError> {
    let member = input.member.or(input.agent).unwrap_or_default();
    let canvas = state
        .canvas_store
        .update(&id, |canvas| {
            if !member.is_empty() && !canvas.members.contains(&member) {
                canvas.members.push(member.clone());
            }
            canvas.updated_at = Utc::now();
        })
        .await?;
    Ok(Json(canvas))
}

impl CanvasStore {
    async fn new(path: PathBuf) -> anyhow::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let canvases = match fs::read_to_string(&path).await {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(_) => Vec::new(),
        };
        Ok(Self {
            path: Arc::new(path),
            canvases: Arc::new(RwLock::new(canvases)),
        })
    }

    async fn persist(&self, canvases: &[Canvas]) -> Result<(), ApiError> {
        let raw = serde_json::to_string_pretty(canvases).map_err(ApiError::internal)?;
        fs::write(&*self.path, raw).await.map_err(ApiError::internal)
    }

    async fn insert(&self, canvas: Canvas) -> Result<(), ApiError> {
        let mut canvases = self.canvases.write().await;
        canvases.insert(0, canvas);
        self.persist(&canvases).await
    }

    async fn get(&self, id: &str) -> Result<Canvas, ApiError> {
        self.canvases
            .read()
            .await
            .iter()
            .find(|canvas| canvas.id == id)
            .cloned()
            .ok_or_else(|| ApiError::not_found("canvas not found"))
    }

    async fn update(&self, id: &str, f: impl FnOnce(&mut Canvas)) -> Result<Canvas, ApiError> {
        let mut canvases = self.canvases.write().await;
        let canvas = canvases
            .iter_mut()
            .find(|canvas| canvas.id == id)
            .ok_or_else(|| ApiError::not_found("canvas not found"))?;
        f(canvas);
        let result = canvas.clone();
        self.persist(&canvases).await?;
        Ok(result)
    }
}

impl PeerStore {
    async fn new(path: PathBuf) -> anyhow::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let messages = match fs::read_to_string(&path).await {
            Ok(raw) => raw
                .lines()
                .filter_map(|line| {
                    let line = line.trim();
                    if line.is_empty() {
                        None
                    } else {
                        serde_json::from_str::<PeerMessage>(line).ok()
                    }
                })
                .collect(),
            Err(_) => Vec::new(),
        };
        Ok(Self {
            path: Arc::new(path),
            messages: Arc::new(RwLock::new(messages)),
        })
    }

    async fn insert(&self, message: PeerMessage) -> Result<(), ApiError> {
        let raw = serde_json::to_string(&message).map_err(ApiError::internal)?;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&*self.path)
            .await
            .map_err(ApiError::internal)?;
        file.write_all(raw.as_bytes()).await.map_err(ApiError::internal)?;
        file.write_all(b"\n").await.map_err(ApiError::internal)?;
        file.flush().await.map_err(ApiError::internal)?;
        self.messages.write().await.push(message);
        Ok(())
    }
}

fn default_sections() -> Vec<CanvasSection> {
    ["Problem", "Decision", "Tasks", "Evidence", "Terminal Agents"]
        .into_iter()
        .map(|title| CanvasSection {
            id: title.to_lowercase().replace(' ', "-"),
            title: title.to_string(),
            body: String::new(),
        })
        .collect()
}

#[cfg(windows)]
fn default_shell() -> String {
    "powershell.exe".to_string()
}

#[cfg(not(windows))]
fn default_shell() -> String {
    "bash".to_string()
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn not_found(message: impl Into<String>) -> Self {
        Self { status: StatusCode::NOT_FOUND, message: message.into() }
    }

    fn conflict(message: impl Into<String>) -> Self {
        Self { status: StatusCode::CONFLICT, message: message.into() }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        Self { status: StatusCode::BAD_REQUEST, message: message.into() }
    }

    fn internal(error: impl std::fmt::Display) -> Self {
        Self { status: StatusCode::INTERNAL_SERVER_ERROR, message: error.to_string() }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}
