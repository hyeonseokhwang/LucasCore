use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    env,
    io::{Read, SeekFrom, Write},
    net::{SocketAddr, ToSocketAddrs},
    path::PathBuf,
    sync::Arc,
    thread,
};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
    net::TcpStream,
    runtime::Handle,
    sync::{broadcast, Mutex, RwLock},
    time::{sleep, Duration},
};
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    sessions: Arc<RwLock<HashMap<String, Arc<Mutex<TerminalSession>>>>>,
    tx: broadcast::Sender<ServerEvent>,
    canvas_store: CanvasStore,
    peer_store: PeerStore,
    work_ledger: WorkLedgerStore,
}

struct TerminalSession {
    meta: SessionMeta,
    _master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

const SESSION_PREVIEW_LIMIT_BYTES: usize = 12_000;
const SESSION_LOG_VIEW_LIMIT_BYTES: u64 = 256 * 1024;
const SESSION_LOG_MAX_TAIL_BYTES: u64 = 1024 * 1024;
const TERMINAL_WS_REPLAY_LIMIT_BYTES: u64 = 32 * 1024;

fn tail_string_by_bytes(value: &str, max_bytes: usize) -> String {
    if max_bytes == 0 {
        return String::new();
    }
    if value.len() <= max_bytes {
        return value.to_string();
    }
    let mut start = value.len() - max_bytes;
    while !value.is_char_boundary(start) {
        start += 1;
    }
    value[start..].to_string()
}

fn strip_ansi_for_ui(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            output.push(ch);
            continue;
        }
        match chars.next() {
            Some('[') => {
                for next in chars.by_ref() {
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
            }
            Some(']') => {
                let mut saw_esc = false;
                for next in chars.by_ref() {
                    if next == '\u{7}' || (saw_esc && next == '\\') {
                        break;
                    }
                    saw_esc = next == '\u{1b}';
                }
            }
            Some(_) => {}
            None => break,
        }
    }
    output
}

fn clamp_log_tail_limit(limit: Option<u64>) -> u64 {
    limit.unwrap_or(SESSION_LOG_VIEW_LIMIT_BYTES).clamp(1, SESSION_LOG_MAX_TAIL_BYTES)
}

fn session_log_info_for_path(path: &PathBuf, tail_bytes: u64) -> SessionLogInfo {
    match std::fs::metadata(path) {
        Ok(metadata) => SessionLogInfo {
            path: path.display().to_string(),
            available: true,
            bytes: metadata.len(),
            tail_bytes: tail_bytes.min(metadata.len()),
            updated_at: metadata.modified().ok().map(DateTime::<Utc>::from),
        },
        Err(_) => SessionLogInfo {
            path: path.display().to_string(),
            available: false,
            bytes: 0,
            tail_bytes: 0,
            updated_at: None,
        },
    }
}

fn build_session_view(
    meta: SessionMeta,
    preview: String,
    source: SessionSource,
    attached: bool,
    interactive: bool,
    input_disabled_reason: Option<String>,
    log_path: PathBuf,
) -> SessionView {
    let preview_text = strip_ansi_for_ui(&preview);
    let preview_has_ansi = preview_text != preview;
    SessionView {
        meta,
        preview,
        preview_text,
        preview_has_ansi,
        source,
        attached,
        interactive,
        input_disabled_reason,
        log: session_log_info_for_path(&log_path, SESSION_LOG_VIEW_LIMIT_BYTES),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum SessionSource {
    Internal,
    Os,
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
    preview_text: String,
    preview_has_ansi: bool,
    source: SessionSource,
    attached: bool,
    interactive: bool,
    input_disabled_reason: Option<String>,
    log: SessionLogInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionLogInfo {
    path: String,
    available: bool,
    bytes: u64,
    tail_bytes: u64,
    updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Default)]
struct SessionLogQuery {
    format: Option<String>,
    limit: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
struct SessionLogTailResponse {
    session_id: String,
    source: SessionSource,
    log: SessionLogInfo,
    tail: SessionLogTail,
}

#[derive(Debug, Clone, Serialize)]
struct SessionLogTail {
    ansi: String,
    text: String,
    has_ansi: bool,
    truncated: bool,
    bytes: usize,
    text_bytes: usize,
    start_offset: u64,
    end_offset: u64,
}

#[derive(Debug, Clone)]
struct TailChunk {
    text: String,
    start: u64,
    end: u64,
    file_len: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct OsAgentRecord {
    id: String,
    name: String,
    team: String,
    cwd: String,
    cmd: String,
    args: Vec<String>,
    model: Option<String>,
    pid: Option<u32>,
    status: Option<String>,
    log_path: Option<String>,
    created_at: Option<DateTime<Utc>>,
    updated_at: Option<DateTime<Utc>>,
    attach_url: Option<String>,
    control_url: Option<String>,
    write_url: Option<String>,
    log_url: Option<String>,
    resize_url: Option<String>,
    runner_endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct OsAgentAttachmentRecord {
    attached: bool,
    updated_at: Option<DateTime<Utc>>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkLedger {
    tasks: Vec<WorkTask>,
    events: Vec<WorkTaskEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkTask {
    id: String,
    title: String,
    status: WorkTaskStatus,
    priority: i32,
    due_at: Option<DateTime<Utc>>,
    reminder_minutes: Option<u32>,
    last_reminded_at: Option<DateTime<Utc>>,
    notes: Option<String>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum WorkTaskStatus {
    Todo,
    Doing,
    Done,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkTaskEvent {
    id: String,
    task_id: String,
    at: DateTime<Utc>,
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

#[derive(Debug, Deserialize)]
struct UpsertWorkTask {
    title: Option<String>,
    status: Option<WorkTaskStatus>,
    priority: Option<i32>,
    due_at: Option<DateTime<Utc>>,
    reminder_minutes: Option<u32>,
    last_reminded_at: Option<DateTime<Utc>>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AddWorkTaskEvent {
    id: Option<String>,
    at: Option<DateTime<Utc>>,
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

#[derive(Clone)]
struct WorkLedgerStore {
    path: Arc<PathBuf>,
    ledger: Arc<RwLock<WorkLedger>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("lcc_core_api=debug,tower_http=info,axum=info")
        .init();

    let (tx, _) = broadcast::channel(64);
    let storage_path = env::var("LCC_STORAGE_PATH").unwrap_or_else(|_| "data/canvases.json".to_string());
    let canvas_store = CanvasStore::new(PathBuf::from(storage_path)).await?;
    let peer_storage_path = env::var("LCC_PEER_STORAGE_PATH").unwrap_or_else(|_| "data/peer-bridge.jsonl".to_string());
    let peer_store = PeerStore::new(PathBuf::from(peer_storage_path)).await?;
    let work_ledger_path = env::var("LCC_WORK_LEDGER_PATH").unwrap_or_else(|_| "data/work-ledger.json".to_string());
    let work_ledger = WorkLedgerStore::new(PathBuf::from(work_ledger_path)).await?;
    let state = AppState {
        sessions: Arc::new(RwLock::new(HashMap::new())),
        tx,
        canvas_store,
        peer_store,
        work_ledger,
    };

    let inbound_only = env::var("LCC_INBOUND_ONLY")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let serve_web = env::var("LCC_SERVE_WEB")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let route = if inbound_only {
        Router::new()
            .route("/api/branch/health", get(branch_health))
            .route("/api/branch/status", get(branch_status))
            .route("/api/branch/work-ledger", get(branch_work_ledger))
            .route("/api/branch/messages", get(branch_list_messages).post(branch_add_message))
    } else {
        let api_route = Router::new()
            .route("/api/health", get(health))
            .route("/api/sessions", get(list_sessions).post(create_session))
            .route("/api/sessions/active", get(list_sessions))
            .route("/api/sessions/pty-stats", get(pty_stats))
            .route("/api/sessions/:id", get(get_session).delete(delete_session))
            .route("/api/sessions/:id/log", get(get_session_log))
            .route("/api/sessions/:id/write", post(write_session))
            .route("/api/sessions/:id/resize", post(resize_session))
            .route("/api/os-agents", get(list_os_agents))
            .route("/api/os-agents/:id/attach", post(attach_os_agent))
            .route("/api/os-agents/:id/detach", post(detach_os_agent))
            .route("/ws/terminal", get(terminal_ws))
            .route("/api/peer/status", get(peer_status))
            .route("/api/peer/messages", get(list_peer_messages).post(add_peer_message))
            .route("/api/work-ledger", get(get_work_ledger))
            .route("/api/work-ledger/tasks/:id", put(upsert_work_task))
            .route("/api/work-ledger/tasks/:id/events", post(add_work_task_event))
            .route("/api/canvases", get(list_canvases).post(create_canvas))
            .route("/api/canvases/:id", get(get_canvas).patch(update_canvas))
            .route("/api/canvases/:id/content", get(get_content).put(put_content).patch(put_content))
            .route("/api/canvases/:id/messages", get(get_messages).post(add_message))
            .route("/api/canvases/:id/invite", post(invite_member));

        if serve_web {
            api_route.nest_service("/", ServeDir::new("apps/web/dist").fallback(ServeDir::new("apps/web")))
        } else {
            api_route
        }
    };

    let app = if inbound_only {
        route.layer(TraceLayer::new_for_http()).with_state(state)
    } else {
        route.layer(CorsLayer::permissive())
            .layer(TraceLayer::new_for_http())
            .with_state(state)
    };

    let host = env::var("LCC_API_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("LCC_API_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(9001);
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

async fn branch_health() -> Json<Value> {
    Json(json!({
        "ok": true,
        "service": "lcc-core-branch-inbound",
        "time": Utc::now()
    }))
}

async fn branch_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    require_branch_token(&headers)?;
    Ok(Json(json!({
        "ok": true,
        "service": "lcc-core-branch-inbound",
        "time": Utc::now(),
        "work_ledger_tasks": state.work_ledger.ledger.read().await.tasks.len(),
        "peer_messages": state.peer_store.messages.read().await.len()
    })))
}

async fn branch_work_ledger(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<WorkLedger>, ApiError> {
    require_branch_token(&headers)?;
    Ok(Json(state.work_ledger.ledger.read().await.clone()))
}

async fn branch_list_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<PeerMessage>>, ApiError> {
    require_branch_token(&headers)?;
    Ok(Json(state.peer_store.messages.read().await.clone()))
}

async fn branch_add_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreatePeerMessage>,
) -> Result<(StatusCode, Json<PeerMessage>), ApiError> {
    require_branch_token(&headers)?;
    let message = PeerMessage {
        id: input.id.unwrap_or_else(|| format!("peer-msg-{}", Utc::now().timestamp_millis())),
        at: input.at.unwrap_or_else(Utc::now),
        from_peer: require_field(input.from_peer, "from")?,
        to: input.to.unwrap_or_else(|| "branch".to_string()),
        kind: input.kind.unwrap_or_else(|| "hq-inbound".to_string()),
        body: require_field(input.body, "body")?,
    };
    state.peer_store.insert(message.clone()).await?;
    Ok((StatusCode::CREATED, Json(message)))
}

fn require_branch_token(headers: &HeaderMap) -> Result<(), ApiError> {
    let expected = env::var("LCC_BRANCH_INBOUND_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| ApiError::service_unavailable("branch inbound token is not configured"))?;
    let provided = headers
        .get("X-LCC-Token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if provided == expected {
        Ok(())
    } else {
        Err(ApiError::unauthorized("invalid branch inbound token"))
    }
}

async fn list_sessions(State(state): State<AppState>) -> Json<Vec<SessionView>> {
    let sessions = state.sessions.read().await;
    let mut internal_meta = Vec::with_capacity(sessions.len());
    for session in sessions.values() {
        internal_meta.push(session.lock().await.meta.clone());
    }
    drop(sessions);
    let mut views = Vec::new();
    let mut internal_ids = HashSet::new();
    for meta in internal_meta {
        internal_ids.insert(meta.id.clone());
        let log_path = terminal_log_path(&meta.id);
        let view = match build_internal_session_view(meta.clone()).await {
            Ok(view) => view,
            Err(_) => build_session_view(
                meta,
                String::new(),
                SessionSource::Internal,
                true,
                true,
                None,
                log_path,
            ),
        };
        views.push(view);
    }
    views.extend(read_os_agent_views(&internal_ids).await);
    Json(views)
}

async fn pty_stats(State(state): State<AppState>) -> Json<Value> {
    let sessions = list_sessions(State(state)).await.0;
    let active = sessions
        .iter()
        .filter(|session| matches!(session.meta.status, SessionStatus::Active))
        .count();
    Json(json!({ "total": sessions.len(), "active": active, "max_active": active_session_limit(), "sessions": sessions }))
}

async fn create_session(
    State(state): State<AppState>,
    Json(input): Json<CreateSession>,
) -> Result<(StatusCode, Json<SessionView>), ApiError> {
    let id = input.id.unwrap_or_else(|| format!("lcc-agent-{}", Utc::now().timestamp_millis()));
    if state.sessions.read().await.contains_key(&id) {
        return Err(ApiError::conflict("session already exists"));
    }
    if let Some(max_active) = active_session_limit() {
        let active = active_session_count(&state).await;
        if active >= max_active {
            return Err(ApiError::service_unavailable(format!(
                "active session limit reached ({active}/{max_active}); stop a session before creating another"
            )));
        }
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
    }));

    state.sessions.write().await.insert(id.clone(), session.clone());
    spawn_pty_reader(state.clone(), id.clone(), reader);
    spawn_pty_waiter(state.clone(), id.clone(), move || child.wait().ok().map(|status| status.exit_code() as i32));
    let meta = session.lock().await.meta.clone();
    let view = build_internal_session_view(meta).await?;
    let _ = state.tx.send(ServerEvent::SessionCreated { session: view.clone() });
    Ok((StatusCode::CREATED, Json(view)))
}

async fn delete_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let Some(session) = state.sessions.write().await.remove(&id) else {
        if read_os_agent_record(&id).await.is_some() {
            set_os_agent_attached(&id, false).await?;
            return Ok(Json(json!({ "ok": true, "detached": true, "session_id": id })));
        }
        return Err(ApiError::not_found("session not found"));
    };
    let mut session = session.lock().await;
    session.meta.status = SessionStatus::Stopped;
    let _ = session.writer.write_all(b"\x03exit\r\n");
    let _ = state.tx.send(ServerEvent::SessionDeleted { session_id: id });
    Ok(Json(json!({ "ok": true })))
}

async fn list_os_agents() -> Json<Vec<SessionView>> {
    let attachment_states = read_os_agent_attachment_states().await;
    let mut views = Vec::new();
    for record in read_os_agent_records().await {
        let attached = os_agent_attached_by_default(&record, &attachment_states);
        let preview = read_os_agent_preview(&record).await.unwrap_or_default();
        views.push(os_agent_view(record, preview, attached));
    }
    Json(views)
}

async fn attach_os_agent(Path(id): Path<String>) -> Result<Json<SessionView>, ApiError> {
    let Some(record) = read_os_agent_record(&id).await else {
        return Err(ApiError::not_found("OS agent not found"));
    };
    set_os_agent_attached(&id, true).await?;
    let preview = read_os_agent_preview(&record).await.unwrap_or_default();
    Ok(Json(os_agent_view(record, preview, true)))
}

async fn get_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SessionView>, ApiError> {
    Ok(Json(resolve_session_view(&state, &id).await?))
}

async fn detach_os_agent(Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    if read_os_agent_record(&id).await.is_none() {
        return Err(ApiError::not_found("OS agent not found"));
    }
    set_os_agent_attached(&id, false).await?;
    Ok(Json(json!({ "ok": true, "detached": true, "session_id": id })))
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

async fn get_session_log(
    Path(id): Path<String>,
    Query(query): Query<SessionLogQuery>,
) -> Result<axum::response::Response, ApiError> {
    let (source, path) = resolve_session_log_path(&id).await?;
    let limit = clamp_log_tail_limit(query.limit);
    let chunk = match read_tail_chunk(path.clone(), limit).await {
        Ok(chunk) => chunk,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => TailChunk {
            text: String::new(),
            start: 0,
            end: 0,
            file_len: 0,
        },
        Err(err) => return Err(ApiError::internal(err)),
    };
    let text = strip_ansi_for_ui(&chunk.text);
    let has_ansi = text != chunk.text;
    let log = session_log_info_for_path(&path, limit);
    match query.format.as_deref().unwrap_or("ansi") {
        "ansi" => Ok(([(header::CONTENT_TYPE, "text/plain; charset=utf-8")], chunk.text).into_response()),
        "text" => Ok(([(header::CONTENT_TYPE, "text/plain; charset=utf-8")], text).into_response()),
        "json" => Ok(Json(SessionLogTailResponse {
            session_id: id,
            source,
            log,
            tail: SessionLogTail {
                ansi: chunk.text.clone(),
                text,
                has_ansi,
                truncated: chunk.start > 0,
                bytes: chunk.text.len(),
                text_bytes: strip_ansi_for_ui(&chunk.text).len(),
                start_offset: chunk.start,
                end_offset: chunk.end.max(chunk.file_len),
            },
        })
        .into_response()),
        other => Err(ApiError::bad_request(format!(
            "unsupported log format '{other}'; expected ansi, text, or json"
        ))),
    }
}

async fn read_tail_lossy(path: PathBuf, max_bytes: u64) -> std::io::Result<String> {
    Ok(read_tail_chunk(path, max_bytes).await?.text)
}

async fn read_tail_lossy_or_empty(path: PathBuf, max_bytes: u64) -> std::io::Result<String> {
    match read_tail_lossy(path, max_bytes).await {
        Ok(text) => Ok(text),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(err) => Err(err),
    }
}

async fn read_tail_chunk(path: PathBuf, max_bytes: u64) -> std::io::Result<TailChunk> {
    let mut file = fs::File::open(path).await?;
    let len = file.metadata().await?.len();
    let start = len.saturating_sub(max_bytes);
    file.seek(SeekFrom::Start(start)).await?;
    let mut bytes = Vec::with_capacity((len - start).min(max_bytes) as usize);
    file.read_to_end(&mut bytes).await?;
    Ok(TailChunk {
        text: String::from_utf8_lossy(&bytes).to_string(),
        start,
        end: len,
        file_len: len,
    })
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
            let replay = match resolve_terminal_replay(state, &session_id).await {
                Ok(replay) => replay,
                Err(err) => return Some(json!({ "type": "error", "sessionId": session_id, "message": err.message })),
            };
            let _ = state.tx.send(ServerEvent::Attached { session_id: session_id.clone() });
            Some(json!({ "type": "replay", "sessionId": session_id, "data": replay }))
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
        if let Some(record) = read_os_agent_record(id).await {
            let attached = os_agent_is_attached(&record).await;
            if !attached {
                return Err(ApiError::conflict("OS agent is detached from this API"));
            }
            return Err(ApiError::bad_request(format!(
                "OS agent resize is not supported by this runner-backed session (cols={cols}, rows={rows})"
            )));
        }
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
    session.touch();
    let meta = session.meta.clone();
    drop(session);
    build_internal_session_view(meta).await
}

async fn write_to_session(state: &AppState, id: &str, data: String) -> Result<SessionView, ApiError> {
    let body = normalize_prompt_body(&data);
    if !body.is_empty() {
        write_session_bytes(state, id, body, true).await?;
        sleep(Duration::from_millis(300)).await;
    }
    write_session_bytes(state, id, prompt_submit_key().to_string(), true).await
}

fn normalize_prompt_body(data: &str) -> String {
    let mut normalized = data.replace("\r\n", "\n").replace('\r', "\n");
    while normalized.ends_with('\n') {
        normalized.pop();
    }
    normalized
}

fn prompt_submit_key() -> &'static str {
    "\r"
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;
    use std::{env, fs as stdfs, path::PathBuf};

    use super::{normalize_prompt_body, normalize_work_event_kind, prompt_submit_key, read_tail_lossy, strip_ansi_for_ui, tail_string_by_bytes};

    fn encode_prompt_submit_for_test(data: &str) -> String {
        format!("{}{}", normalize_prompt_body(data), prompt_submit_key())
    }

    #[test]
    fn prompt_submit_adds_enter_when_missing() {
        assert_eq!(encode_prompt_submit_for_test("hello"), "hello\r");
    }

    #[test]
    fn prompt_submit_collapses_trailing_newlines_to_single_enter() {
        assert_eq!(encode_prompt_submit_for_test("hello\r\n"), "hello\r");
        assert_eq!(encode_prompt_submit_for_test("hello\n\n"), "hello\r");
        assert_eq!(encode_prompt_submit_for_test("hello\r\r"), "hello\r");
    }

    #[test]
    fn prompt_submit_preserves_multiline_body_before_submit() {
        assert_eq!(encode_prompt_submit_for_test("line 1\r\nline 2"), "line 1\nline 2\r");
        assert_eq!(encode_prompt_submit_for_test("line 1\rline 2\n"), "line 1\nline 2\r");
    }

    #[test]
    fn prompt_submit_handles_empty_or_only_newlines_as_submit_only() {
        assert_eq!(encode_prompt_submit_for_test(""), "\r");
        assert_eq!(encode_prompt_submit_for_test("\n"), "\r");
        assert_eq!(encode_prompt_submit_for_test("\r\n\r\n"), "\r");
    }

    #[test]
    fn prompt_submit_preserves_internal_blank_lines() {
        assert_eq!(encode_prompt_submit_for_test("line 1\n\nline 3\n"), "line 1\n\nline 3\r");
    }

    #[test]
    fn prompt_submit_normalizes_mixed_cr_and_lf_without_dropping_text() {
        assert_eq!(
            encode_prompt_submit_for_test("alpha\rbravo\r\ncharlie\ndelta\r\n"),
            "alpha\nbravo\ncharlie\ndelta\r"
        );
    }

    #[test]
    fn prompt_submit_never_uses_bracketed_paste_or_csi_submit() {
        let encoded = encode_prompt_submit_for_test("line 1\nline 2\n");
        assert!(!encoded.contains("\x1b[200~"));
        assert!(!encoded.contains("\x1b[201~"));
        assert!(!encoded.contains("\x1b[13;1u"));
        assert!(encoded.ends_with('\r'));
    }

    #[test]
    fn prompt_submit_key_is_plain_carriage_return_for_delayed_write() {
        assert_eq!(prompt_submit_key(), "\r");
    }

    #[test]
    fn tail_string_by_bytes_preserves_utf8_boundaries() {
        let value = format!("{}끝", "가".repeat(8));
        let tail = tail_string_by_bytes(&value, 7);
        assert_eq!(tail, "가끝");
    }

    #[test]
    fn strip_ansi_for_ui_removes_csi_and_osc_sequences() {
        let raw = "\u{1b}[2Khello\u{1b}]0;title\u{7}\u{1b}[31m world\u{1b}[0m";
        assert_eq!(strip_ansi_for_ui(raw), "hello world");
    }

    #[tokio::test]
    async fn read_tail_lossy_returns_only_the_requested_tail_window() {
        let path = temp_test_file("read-tail-window.log");
        let content = (0..512).map(|idx| format!("line-{idx:04}\n")).collect::<String>();
        stdfs::write(&path, &content).unwrap();

        let tail = read_tail_lossy(path.clone(), 64).await.unwrap();

        assert!(tail.len() <= 64);
        assert!(tail.contains("line-0511"));
        assert!(!tail.contains("line-0000"));

        let _ = stdfs::remove_file(path);
    }

    #[tokio::test]
    async fn read_tail_lossy_returns_entire_file_when_under_limit() {
        let path = temp_test_file("read-tail-small.log");
        stdfs::write(&path, "alpha\nbeta\n").unwrap();

        let tail = read_tail_lossy(path.clone(), 1024).await.unwrap();

        assert_eq!(tail, "alpha\nbeta\n");

        let _ = stdfs::remove_file(path);
    }

    #[test]
    fn work_event_kind_defaults_to_note() {
        assert_eq!(normalize_work_event_kind(None).unwrap(), "note");
    }

    #[test]
    fn work_event_kind_normalizes_known_state_events() {
        assert_eq!(normalize_work_event_kind(Some(" ACKNOWLEDGED ".to_string())).unwrap(), "acknowledged");
        assert_eq!(normalize_work_event_kind(Some("HEARTBEAT".to_string())).unwrap(), "heartbeat");
        assert_eq!(normalize_work_event_kind(Some("qa-pass".to_string())).unwrap(), "qa-pass");
    }

    #[test]
    fn work_event_kind_rejects_unknown_values() {
        let err = normalize_work_event_kind(Some("maybe-later".to_string())).unwrap_err();
        assert_eq!(err.status, StatusCode::BAD_REQUEST);
    }

    fn temp_test_file(name: &str) -> PathBuf {
        let unique = uuid::Uuid::new_v4().to_string();
        env::temp_dir().join(format!("lcc-core-{unique}-{name}"))
    }
}

async fn resolve_terminal_replay(state: &AppState, id: &str) -> Result<String, ApiError> {
    if state.sessions.read().await.contains_key(id) {
        return read_tail_lossy_or_empty(terminal_log_path(id), TERMINAL_WS_REPLAY_LIMIT_BYTES)
            .await
            .map_err(ApiError::internal);
    }
    let Some(record) = read_os_agent_record(id).await else {
        return Err(ApiError::not_found("session not found"));
    };
    if !os_agent_is_attached(&record).await {
        return Err(ApiError::conflict("OS agent is detached from this API"));
    }
    let path = record.log_path.map(PathBuf::from).unwrap_or_else(|| terminal_log_path(id));
    read_tail_lossy_or_empty(path, TERMINAL_WS_REPLAY_LIMIT_BYTES)
        .await
        .map_err(ApiError::internal)
}

async fn build_internal_session_view(meta: SessionMeta) -> Result<SessionView, ApiError> {
    let log_path = terminal_log_path(&meta.id);
    let preview = read_tail_lossy_or_empty(log_path.clone(), SESSION_PREVIEW_LIMIT_BYTES as u64)
        .await
        .map_err(ApiError::internal)?;
    Ok(build_session_view(
        meta,
        tail_string_by_bytes(&preview, SESSION_PREVIEW_LIMIT_BYTES),
        SessionSource::Internal,
        true,
        true,
        None,
        log_path,
    ))
}

async fn write_raw_to_session(state: &AppState, id: &str, data: String) -> Result<SessionView, ApiError> {
    write_session_bytes(state, id, data, false).await
}

async fn write_session_bytes(state: &AppState, id: &str, data: String, echo_input: bool) -> Result<SessionView, ApiError> {
    let Some(session) = state.sessions.read().await.get(id).cloned() else {
        if let Some(record) = read_os_agent_record(id).await {
            if !os_agent_is_attached(&record).await {
                return Err(ApiError::conflict("OS agent is detached from this API"));
            }
            let Some(write_url) = os_agent_write_url(&record) else {
                return Err(ApiError::bad_request("OS agent is attached but does not expose a write endpoint"));
            };
            os_agent_control_write(&write_url, &data).await?;
            let preview = read_os_agent_preview(&record).await.unwrap_or_default();
            return Ok(os_agent_view(record, preview, true));
        }
        return Err(ApiError::not_found("session not found"));
    };
    let mut session = session.lock().await;
    if !data.is_empty() {
        session.writer.write_all(data.as_bytes()).map_err(ApiError::internal)?;
        session.writer.flush().map_err(ApiError::internal)?;
        session.touch();
        if echo_input {
            let _ = state.tx.send(ServerEvent::Input { session_id: id.to_string(), data });
        }
    }
    let meta = session.meta.clone();
    drop(session);
    build_internal_session_view(meta).await
}

fn spawn_pty_reader(state: AppState, id: String, mut reader: Box<dyn Read + Send>) {
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

async fn resolve_session_view(state: &AppState, id: &str) -> Result<SessionView, ApiError> {
    if let Some(session) = state.sessions.read().await.get(id).cloned() {
        let meta = session.lock().await.meta.clone();
        return build_internal_session_view(meta).await;
    }
    let Some(record) = read_os_agent_record(id).await else {
        return Err(ApiError::not_found("session not found"));
    };
    let attached = os_agent_is_attached(&record).await;
    let preview = read_os_agent_preview(&record).await.unwrap_or_default();
    Ok(os_agent_view(record, preview, attached))
}

async fn resolve_session_log_path(id: &str) -> Result<(SessionSource, PathBuf), ApiError> {
    if let Some(record) = read_os_agent_record(id).await {
        if !os_agent_is_attached(&record).await {
            return Err(ApiError::not_found("OS agent is detached from this API"));
        }
        let path = record.log_path.map(PathBuf::from).unwrap_or_else(|| terminal_log_path(id));
        return Ok((SessionSource::Os, path));
    }
    Ok((SessionSource::Internal, terminal_log_path(id)))
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
    fn touch(&mut self) {
        self.meta.updated_at = Utc::now();
    }
}

async fn read_os_agent_views(internal_ids: &HashSet<String>) -> Vec<SessionView> {
    let attachment_states = read_os_agent_attachment_states().await;
    let mut views = Vec::new();
    for record in read_os_agent_records().await {
        if internal_ids.contains(&record.id) {
            continue;
        }
        let attached = os_agent_attached_by_default(&record, &attachment_states);
        if !attached {
            continue;
        }
        let preview = read_os_agent_preview(&record).await.unwrap_or_default();
        views.push(os_agent_view(record, preview, true));
    }
    views
}

async fn read_os_agent_record(id: &str) -> Option<OsAgentRecord> {
    read_os_agent_records().await.into_iter().find(|record| record.id == id)
}

fn os_agent_registry_path() -> Option<PathBuf> {
    let raw = env::var("LCC_OS_AGENT_REGISTRY").ok();
    match raw.as_deref().map(str::trim) {
        Some("") | Some("0") | Some("off") | Some("false") | Some("none") | Some("disabled") => None,
        Some(path) => Some(PathBuf::from(path)),
        None => Some(PathBuf::from("data/os-agents/registry.json")),
    }
}

async fn read_os_agent_records() -> Vec<OsAgentRecord> {
    let Some(path) = os_agent_registry_path() else {
        return Vec::new();
    };
    let Ok(text) = fs::read_to_string(path).await else {
        return Vec::new();
    };
    let text = text.trim_start_matches('\u{feff}');
    serde_json::from_str::<Vec<OsAgentRecord>>(text).unwrap_or_default()
}

fn os_agent_attachment_path() -> PathBuf {
    if let Ok(path) = env::var("LCC_OS_AGENT_ATTACHMENTS") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Some(path) = os_agent_registry_path() {
        if let Some(parent) = path.parent() {
            return parent.join("attachments.json");
        }
    }
    PathBuf::from("data/os-agents/attachments.json")
}

async fn read_os_agent_attachment_states() -> HashMap<String, OsAgentAttachmentRecord> {
    let path = os_agent_attachment_path();
    let Ok(text) = fs::read_to_string(path).await else {
        return HashMap::new();
    };
    let text = text.trim_start_matches('\u{feff}');
    serde_json::from_str::<HashMap<String, OsAgentAttachmentRecord>>(text).unwrap_or_default()
}

async fn write_os_agent_attachment_states(states: &HashMap<String, OsAgentAttachmentRecord>) -> Result<(), ApiError> {
    let path = os_agent_attachment_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.map_err(ApiError::internal)?;
    }
    let text = serde_json::to_string_pretty(states).map_err(ApiError::internal)?;
    fs::write(path, text).await.map_err(ApiError::internal)
}

async fn set_os_agent_attached(id: &str, attached: bool) -> Result<(), ApiError> {
    let mut states = read_os_agent_attachment_states().await;
    states.insert(
        id.to_string(),
        OsAgentAttachmentRecord {
            attached,
            updated_at: Some(Utc::now()),
        },
    );
    write_os_agent_attachment_states(&states).await
}

fn os_agent_attached_by_default(record: &OsAgentRecord, states: &HashMap<String, OsAgentAttachmentRecord>) -> bool {
    if let Some(state) = states.get(&record.id) {
        return state.attached;
    }
    !matches!(record.status.as_deref(), Some("stopped") | Some("exited") | Some("error"))
}

async fn os_agent_is_attached(record: &OsAgentRecord) -> bool {
    let states = read_os_agent_attachment_states().await;
    os_agent_attached_by_default(record, &states)
}

async fn read_os_agent_preview(record: &OsAgentRecord) -> std::io::Result<String> {
    let Some(path) = record.log_path.as_ref() else {
        return Ok(String::new());
    };
    let text = read_tail_lossy(PathBuf::from(path), SESSION_PREVIEW_LIMIT_BYTES as u64).await?;
    Ok(tail_string_by_bytes(&text, SESSION_PREVIEW_LIMIT_BYTES))
}

fn os_agent_write_url(record: &OsAgentRecord) -> Option<String> {
    record
        .write_url
        .as_deref()
        .or(record.control_url.as_deref())
        .or(record.attach_url.as_deref())
        .map(normalize_os_agent_write_url)
}

fn normalize_os_agent_write_url(url: &str) -> String {
    let base = url.trim_end_matches('/');
    if base.ends_with("/write") {
        base.to_string()
    } else if let Some(prefix) = base.strip_suffix("/control") {
        format!("{prefix}/write")
    } else {
        format!("{base}/write")
    }
}

async fn os_agent_control_write(write_url: &str, data: &str) -> Result<(), ApiError> {
    let base = write_url.trim_end_matches('/');
    let Some(rest) = base.strip_prefix("http://") else {
        return Err(ApiError::bad_request("OS agent write endpoint must use http://"));
    };
    let (host_port, path_prefix) = match rest.split_once('/') {
        Some((host_port, path)) => (host_port, format!("/{path}")),
        None => (rest, "/write".to_string()),
    };
    let addr = host_port
        .to_socket_addrs()
        .map_err(ApiError::internal)?
        .next()
        .ok_or_else(|| ApiError::bad_request("OS agent write endpoint did not resolve"))?;
    let body = serde_json::to_vec(&json!({ "input": data, "data": data })).map_err(ApiError::internal)?;
    let request = format!(
        "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        path_prefix, host_port, body.len()
    );
    let mut stream = TcpStream::connect(addr).await.map_err(ApiError::internal)?;
    stream.write_all(request.as_bytes()).await.map_err(ApiError::internal)?;
    stream.write_all(&body).await.map_err(ApiError::internal)?;
    stream.flush().await.map_err(ApiError::internal)?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).await.map_err(ApiError::internal)?;
    let status = parse_http_response_status(&response)
        .ok_or_else(|| ApiError::bad_request("OS agent write endpoint returned an invalid HTTP response"))?;
    if !(200..300).contains(&status) {
        return Err(ApiError::bad_request(format!(
            "OS agent control write failed with HTTP {status}: {}",
            http_response_body_preview(&response)
        )));
    }
    Ok(())
}

fn parse_http_response_status(response: &[u8]) -> Option<u16> {
    let line_end = response.windows(2).position(|window| window == b"\r\n")?;
    let status_line = std::str::from_utf8(&response[..line_end]).ok()?;
    let mut parts = status_line.split_whitespace();
    let version = parts.next()?;
    if !version.starts_with("HTTP/") {
        return None;
    }
    parts.next()?.parse().ok()
}

fn http_response_body_preview(response: &[u8]) -> String {
    let body = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|idx| &response[idx + 4..])
        .unwrap_or_default();
    let text = String::from_utf8_lossy(body).trim().to_string();
    if text.is_empty() {
        "<empty body>".to_string()
    } else {
        text.chars().take(200).collect()
    }
}

fn os_agent_view(record: OsAgentRecord, preview: String, attached: bool) -> SessionView {
    let now = Utc::now();
    let interactive = os_agent_write_url(&record).is_some();
    let log_path = record.log_path.as_ref().map(PathBuf::from).unwrap_or_else(|| terminal_log_path(&record.id));
    let status = match record.status.as_deref() {
        Some("stopped") => SessionStatus::Stopped,
        Some("error") => SessionStatus::Error,
        Some("exited") => SessionStatus::Exited,
        _ => SessionStatus::Active,
    };
    build_session_view(
        SessionMeta {
            id: record.id,
            name: record.name,
            team: record.team,
            cwd: record.cwd,
            cmd: record.cmd,
            args: record.args,
            model: record.model,
            status,
            pid: record.pid,
            created_at: record.created_at.unwrap_or(now),
            updated_at: record.updated_at.unwrap_or(now),
            exit_code: None,
        },
        preview,
        SessionSource::Os,
        attached,
        interactive,
        if !attached {
            Some("OS agent is detached from this API".to_string())
        } else if interactive {
            None
        } else {
            Some("OS agent is attached as a bounded log-backed session; write endpoint is unavailable".to_string())
        },
        log_path,
    )
}

async fn active_session_count(state: &AppState) -> usize {
    let sessions = state.sessions.read().await;
    let mut active = 0;
    for session in sessions.values() {
        if matches!(session.lock().await.meta.status, SessionStatus::Active) {
            active += 1;
        }
    }
    active
}

fn active_session_limit() -> Option<usize> {
    match env::var("LCC_MAX_ACTIVE_SESSIONS") {
        Ok(value) => value.parse::<usize>().ok().filter(|value| *value > 0),
        Err(_) => Some(20),
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

async fn get_work_ledger(State(state): State<AppState>) -> Json<WorkLedger> {
    Json(state.work_ledger.ledger.read().await.clone())
}

async fn upsert_work_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpsertWorkTask>,
) -> Result<Json<WorkTask>, ApiError> {
    state.work_ledger.upsert_task(&id, input).await.map(Json)
}

async fn add_work_task_event(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<AddWorkTaskEvent>,
) -> Result<(StatusCode, Json<WorkTaskEvent>), ApiError> {
    let kind = normalize_work_event_kind(input.kind)?;
    let event = WorkTaskEvent {
        id: input.id.unwrap_or_else(|| format!("work-event-{}", Utc::now().timestamp_millis())),
        task_id: id.clone(),
        at: input.at.unwrap_or_else(Utc::now),
        kind,
        body: require_field(input.body, "body")?,
    };
    state.work_ledger.add_event(&id, event.clone()).await?;
    Ok((StatusCode::CREATED, Json(event)))
}

fn normalize_work_event_kind(kind: Option<String>) -> Result<String, ApiError> {
    let kind = kind.unwrap_or_else(|| "note".to_string()).trim().to_ascii_lowercase();
    if allowed_work_event_kinds().contains(&kind.as_str()) {
        return Ok(kind);
    }
    Err(ApiError::bad_request(format!(
        "unsupported work event kind '{kind}'; allowed: {}",
        allowed_work_event_kinds().join(", ")
    )))
}

fn allowed_work_event_kinds() -> &'static [&'static str] {
    &[
        "assigned",
        "acknowledged",
        "doing",
        "heartbeat",
        "reported",
        "blocked",
        "stopped",
        "completed",
        "qa",
        "qa-pass",
        "qa-fail",
        "evidence",
        "handoff",
        "decision",
        "risk",
        "note",
        "ledger-update",
        "execution-board-update",
        "communication-policy",
        "enterprise-p0-order",
        "organization",
        "dev-request",
        "risk-check",
    ]
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

impl WorkLedgerStore {
    async fn new(path: PathBuf) -> anyhow::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let ledger = match fs::read_to_string(&path).await {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|_| default_work_ledger()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                let ledger = default_work_ledger();
                let raw = serde_json::to_string_pretty(&ledger)?;
                fs::write(&path, raw).await?;
                ledger
            }
            Err(err) => return Err(err.into()),
        };
        Ok(Self {
            path: Arc::new(path),
            ledger: Arc::new(RwLock::new(ledger)),
        })
    }

    async fn persist(&self, ledger: &WorkLedger) -> Result<(), ApiError> {
        let raw = serde_json::to_string_pretty(ledger).map_err(ApiError::internal)?;
        fs::write(&*self.path, raw).await.map_err(ApiError::internal)
    }

    async fn upsert_task(&self, id: &str, input: UpsertWorkTask) -> Result<WorkTask, ApiError> {
        let mut ledger = self.ledger.write().await;
        let now = Utc::now();
        let result = if let Some(task) = ledger.tasks.iter_mut().find(|task| task.id == id) {
            if let Some(title) = input.title {
                task.title = title;
            }
            if let Some(status) = input.status {
                task.status = status;
            }
            if let Some(priority) = input.priority {
                task.priority = priority;
            }
            if input.due_at.is_some() {
                task.due_at = input.due_at;
            }
            if input.reminder_minutes.is_some() {
                task.reminder_minutes = input.reminder_minutes;
            }
            if input.last_reminded_at.is_some() {
                task.last_reminded_at = input.last_reminded_at;
            }
            if input.notes.is_some() {
                task.notes = input.notes;
            }
            task.updated_at = now;
            task.clone()
        } else {
            let task = WorkTask {
                id: id.to_string(),
                title: input.title.unwrap_or_else(|| id.to_string()),
                status: input.status.unwrap_or(WorkTaskStatus::Todo),
                priority: input.priority.unwrap_or(100),
                due_at: input.due_at,
                reminder_minutes: input.reminder_minutes,
                last_reminded_at: input.last_reminded_at,
                notes: input.notes,
                updated_at: now,
            };
            ledger.tasks.push(task.clone());
            task
        };
        self.persist(&ledger).await?;
        Ok(result)
    }

    async fn add_event(&self, task_id: &str, event: WorkTaskEvent) -> Result<(), ApiError> {
        let mut ledger = self.ledger.write().await;
        let Some(task) = ledger.tasks.iter_mut().find(|task| task.id == task_id) else {
            return Err(ApiError::not_found("work task not found"));
        };
        task.updated_at = Utc::now();
        ledger.events.push(event);
        self.persist(&ledger).await
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

fn default_work_ledger() -> WorkLedger {
    let now = Utc::now();
    WorkLedger {
        tasks: vec![
            WorkTask {
                id: "year-end-tax-hourly-reminder".to_string(),
                title: "Year-end tax hourly reminder".to_string(),
                status: WorkTaskStatus::Todo,
                priority: 1,
                due_at: None,
                reminder_minutes: Some(60),
                last_reminded_at: None,
                notes: Some("Daily objective seed.".to_string()),
                updated_at: now,
            },
            WorkTask {
                id: "spring-msa-study-2000".to_string(),
                title: "Spring MSA study 20:00".to_string(),
                status: WorkTaskStatus::Todo,
                priority: 2,
                due_at: Some(today_at_utc(11, 0)),
                reminder_minutes: None,
                last_reminded_at: None,
                notes: Some("20:00 KST stored as 11:00 UTC.".to_string()),
                updated_at: now,
            },
            WorkTask {
                id: "heungkuk-android-final-package".to_string(),
                title: "Heungkuk Android final package".to_string(),
                status: WorkTaskStatus::Todo,
                priority: 3,
                due_at: None,
                reminder_minutes: None,
                last_reminded_at: None,
                notes: Some("Daily objective seed.".to_string()),
                updated_at: now,
            },
        ],
        events: Vec::new(),
    }
}

fn today_at_utc(hour: u32, minute: u32) -> DateTime<Utc> {
    let date = Utc::now().date_naive();
    let naive = date.and_hms_opt(hour, minute, 0).expect("seed time must be valid");
    DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc)
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

    fn unauthorized(message: impl Into<String>) -> Self {
        Self { status: StatusCode::UNAUTHORIZED, message: message.into() }
    }

    fn service_unavailable(message: impl Into<String>) -> Self {
        Self { status: StatusCode::SERVICE_UNAVAILABLE, message: message.into() }
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
