use anyhow::{bail, Context};
use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env,
    io::{Read, Write},
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
    thread,
};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
    sync::{Mutex, RwLock},
    time::{sleep, Duration},
};
use tracing_subscriber::EnvFilter;

const DEFAULT_PORT: u16 = 19003;
const DEFAULT_COLS: u16 = 140;
const DEFAULT_ROWS: u16 = 36;
const DEFAULT_LOG_TAIL_BYTES: u64 = 256 * 1024;

#[derive(Clone)]
struct RunnerState {
    config: Arc<RunnerConfig>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    status: Arc<RwLock<RunnerStatus>>,
}

#[derive(Debug, Clone)]
struct RunnerConfig {
    id: String,
    name: String,
    team: String,
    cwd: PathBuf,
    cmd: String,
    args: Vec<String>,
    model: Option<String>,
    host: String,
    port: u16,
    registry_path: PathBuf,
    log_path: PathBuf,
    err_path: PathBuf,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RunnerStatus {
    id: String,
    status: String,
    pid: Option<u32>,
    exit_code: Option<i32>,
    started_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    endpoint: String,
    log_path: String,
}

#[derive(Debug, Deserialize)]
struct WriteRequest {
    input: Option<Value>,
    data: Option<Value>,
    prompt: Option<Value>,
    enter: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct LogQuery {
    tail: Option<u64>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let config = Arc::new(RunnerConfig::from_env_and_args()?);
    fs::create_dir_all(&config.cwd)
        .await
        .with_context(|| format!("failed to create cwd {}", config.cwd.display()))?;
    if let Some(parent) = config.log_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    if let Some(parent) = config.registry_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: DEFAULT_ROWS,
        cols: DEFAULT_COLS,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let mut command = CommandBuilder::new(&config.cmd);
    command.args(config.args.iter().map(String::as_str));
    command.cwd(&config.cwd);

    let mut child = pair
        .slave
        .spawn_command(command)
        .with_context(|| format!("failed to spawn {}", config.cmd))?;
    let pid = child.process_id();
    let reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;

    let endpoint = format!("http://{}:{}", config.host, config.port);
    let status = RunnerStatus {
        id: config.id.clone(),
        status: "active".to_string(),
        pid,
        exit_code: None,
        started_at: config.created_at,
        updated_at: config.created_at,
        endpoint: endpoint.clone(),
        log_path: root_relative_or_display(&config.log_path),
    };
    let state = RunnerState {
        config: config.clone(),
        writer: Arc::new(Mutex::new(writer)),
        status: Arc::new(RwLock::new(status)),
    };

    let status_snapshot = state.status.read().await.clone();
    upsert_registry(&config, &status_snapshot).await?;
    spawn_reader(config.clone(), reader);
    spawn_waiter(config.clone(), state.status.clone(), move || {
        child.wait().ok().map(|exit| exit.exit_code() as i32)
    });

    let app = Router::new()
        .route("/health", get(get_status))
        .route("/status", get(get_status))
        .route("/log", get(get_log))
        .route("/write", post(post_write))
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .context("LCC_OS_RUNNER_HOST/LCC_OS_RUNNER_PORT must form a valid socket address")?;
    tracing::info!("OS agent runner {} listening on {endpoint}", config.id);
    let listener = tokio::net::TcpListener::bind(addr).await?;

    let _master = pair.master;
    axum::serve(listener, app).await?;
    Ok(())
}

impl RunnerConfig {
    fn from_env_and_args() -> anyhow::Result<Self> {
        let mut id = env::var("LCC_OS_RUNNER_ID").unwrap_or_else(|_| "test-agent-1".to_string());
        let mut name = env::var("LCC_OS_RUNNER_NAME").unwrap_or_else(|_| "Test Agent 1".to_string());
        let mut team = env::var("LCC_OS_RUNNER_TEAM").unwrap_or_else(|_| "development".to_string());
        let mut cwd = PathBuf::from(
            env::var("LCC_OS_RUNNER_CWD").unwrap_or_else(|_| "workspaces/test-agent-1/repo".to_string()),
        );
        let mut cmd = env::var("LCC_OS_RUNNER_CMD").unwrap_or_else(|_| default_codex_cmd());
        let mut model = env::var("LCC_OS_RUNNER_MODEL").ok().filter(|value| !value.trim().is_empty());
        let mut host = env::var("LCC_OS_RUNNER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let mut port = env::var("LCC_OS_RUNNER_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(DEFAULT_PORT);
        let mut registry_path = PathBuf::from(
            env::var("LCC_OS_AGENT_REGISTRY").unwrap_or_else(|_| "data/os-agents-9003/registry.json".to_string()),
        );
        let mut log_dir = PathBuf::from(
            env::var("LCC_OS_RUNNER_LOG_DIR").unwrap_or_else(|_| "data/os-agents-9003/logs".to_string()),
        );
        let mut child_args = env::var("LCC_OS_RUNNER_ARGS")
            .ok()
            .map(|value| split_args_lossy(&value))
            .unwrap_or_else(default_codex_args);

        let mut args = env::args().skip(1).peekable();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--id" => id = take_arg(&mut args, "--id")?,
                "--name" => name = take_arg(&mut args, "--name")?,
                "--team" => team = take_arg(&mut args, "--team")?,
                "--cwd" => cwd = PathBuf::from(take_arg(&mut args, "--cwd")?),
                "--cmd" => cmd = take_arg(&mut args, "--cmd")?,
                "--model" => model = Some(take_arg(&mut args, "--model")?),
                "--host" => host = take_arg(&mut args, "--host")?,
                "--port" => port = take_arg(&mut args, "--port")?.parse().context("--port must be a u16")?,
                "--registry" => registry_path = PathBuf::from(take_arg(&mut args, "--registry")?),
                "--log-dir" => log_dir = PathBuf::from(take_arg(&mut args, "--log-dir")?),
                "--arg" => child_args.push(take_arg(&mut args, "--arg")?),
                "--" => {
                    child_args = args.collect();
                    break;
                }
                _ => bail!("unknown argument: {arg}"),
            }
        }

        if let Some(model) = model.as_ref() {
            if !child_args.iter().any(|arg| arg == "--model") {
                child_args.splice(0..0, ["--model".to_string(), model.clone()]);
            }
        }

        let safe_id = safe_file_stem(&id);
        let log_path = log_dir.join(format!("{safe_id}.ansi.log"));
        let err_path = log_dir.join(format!("{safe_id}.err.log"));
        Ok(Self {
            id,
            name,
            team,
            cwd,
            cmd,
            args: child_args,
            model,
            host,
            port,
            registry_path,
            log_path,
            err_path,
            created_at: Utc::now(),
        })
    }
}

async fn get_status(State(state): State<RunnerState>) -> Json<RunnerStatus> {
    Json(state.status.read().await.clone())
}

async fn get_log(
    State(state): State<RunnerState>,
    Query(query): Query<LogQuery>,
) -> Result<Json<Value>, RunnerError> {
    let max_bytes = query.tail.unwrap_or(DEFAULT_LOG_TAIL_BYTES);
    let text = read_tail_lossy(&state.config.log_path, max_bytes).await?;
    Ok(Json(json!({
        "id": state.config.id,
        "log_path": root_relative_or_display(&state.config.log_path),
        "data": text
    })))
}

async fn post_write(
    State(state): State<RunnerState>,
    uri: Uri,
    body: Bytes,
) -> Result<Json<Value>, RunnerError> {
    let body_preview = preview_bytes(&body);
    log_runner_debug(&state.config, &format!("request path={} body={}", uri.path(), body_preview));

    let input: WriteRequest = serde_json::from_slice(&body).map_err(|err| {
        let response = json!({ "error": format!("invalid write body: {err}") });
        log_runner_debug(&state.config, &format!("response path={} status=400 body={}", uri.path(), preview_value(&response)));
        RunnerError::bad_request(format!("invalid write body: {err}"))
    })?;

    let status = state.status.read().await.status.clone();
    if status != "active" {
        let response = json!({ "error": format!("agent is not active: {status}") });
        log_runner_debug(&state.config, &format!("response path={} status=400 body={}", uri.path(), preview_value(&response)));
        return Err(RunnerError::bad_request(format!("agent is not active: {status}")));
    }

    let mut data = input
        .input
        .or(input.data)
        .or(input.prompt)
        .map(write_value_to_string)
        .unwrap_or_default();
    if input.enter.unwrap_or(false) {
        data.push_str("\r\n");
    }
    if data.is_empty() {
        let response = json!({ "error": "write body must include input, data, prompt, or enter=true" });
        log_runner_debug(&state.config, &format!("response path={} status=400 body={}", uri.path(), preview_value(&response)));
        return Err(RunnerError::bad_request("write body must include input, data, prompt, or enter=true"));
    }

    let mut writer = state.writer.lock().await;
    writer.write_all(data.as_bytes())?;
    writer.flush()?;

    let response = json!({ "ok": true, "bytes": data.len() });
    log_runner_debug(&state.config, &format!("response path={} status=200 body={}", uri.path(), preview_value(&response)));
    Ok(Json(response))
}

fn write_value_to_string(value: Value) -> String {
    match value {
        Value::String(text) => text,
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn log_runner_debug(config: &RunnerConfig, message: &str) {
    let line = format!("[runner:{}] {}", config.id, truncate_for_log(message, 512));
    eprintln!("{line}");
    let _ = append_line(&config.err_path, &line);
}

fn preview_bytes(bytes: &[u8]) -> String {
    truncate_for_log(&String::from_utf8_lossy(bytes), 256)
}

fn preview_value(value: &Value) -> String {
    truncate_for_log(&value.to_string(), 256)
}

fn truncate_for_log(value: &str, max_chars: usize) -> String {
    let compact = value.replace(['\r', '\n'], "\\n");
    if compact.chars().count() <= max_chars {
        return compact;
    }

    let mut truncated: String = compact.chars().take(max_chars).collect();
    truncated.push_str("...");
    truncated
}

fn spawn_reader(config: Arc<RunnerConfig>, mut reader: Box<dyn Read + Send>) {
    thread::spawn(move || {
        let _ = append_line(&config.log_path, &format!("===== OS agent {} started at {} =====", config.id, Utc::now().to_rfc3339()));
        let mut buf = [0_u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let _ = append_bytes(&config.log_path, &buf[..n]);
                }
                Err(err) => {
                    let _ = append_line(&config.err_path, &format!("pty read failed: {err}"));
                    break;
                }
            }
        }
    });
}

fn spawn_waiter<F>(config: Arc<RunnerConfig>, status: Arc<RwLock<RunnerStatus>>, wait: F)
where
    F: FnOnce() -> Option<i32> + Send + 'static,
{
    tokio::task::spawn_blocking(move || {
        let exit_code = wait();
        let handle = tokio::runtime::Handle::current();
        handle.block_on(async move {
            {
                let mut status = status.write().await;
                status.status = "exited".to_string();
                status.exit_code = exit_code;
                status.updated_at = Utc::now();
                let _ = upsert_registry(&config, &status).await;
            }
            let _ = append_line(
                &config.log_path,
                &format!("===== OS agent {} exited at {} code {:?} =====", config.id, Utc::now().to_rfc3339(), exit_code),
            );
        });
    });
}

async fn upsert_registry(config: &RunnerConfig, status: &RunnerStatus) -> anyhow::Result<()> {
    let _lock = RegistryLock::acquire(&config.registry_path).await?;
    let mut records = read_registry(&config.registry_path).await.unwrap_or_default();
    let record = json!({
        "id": config.id,
        "name": config.name,
        "team": config.team,
        "cwd": root_relative_or_display(&config.cwd),
        "cmd": config.cmd,
        "args": config.args,
        "model": config.model,
        "pid": status.pid,
        "status": status.status,
        "log_path": root_relative_or_display(&config.log_path),
        "err_path": root_relative_or_display(&config.err_path),
        "io_mode": "os-runner-pty",
        "input_mode": "http-write",
        "log_mode": "runner-tail",
        "control_url": status.endpoint,
        "write_url": format!("{}/write", status.endpoint),
        "attach_url": status.endpoint,
        "runner_endpoint": status.endpoint,
        "created_at": config.created_at,
        "updated_at": status.updated_at
    });
    records.retain(|existing| existing.get("id").and_then(Value::as_str) != Some(config.id.as_str()));
    records.push(record);
    records.sort_by(|left, right| {
        let left = left.get("id").and_then(Value::as_str).unwrap_or_default();
        let right = right.get("id").and_then(Value::as_str).unwrap_or_default();
        left.cmp(right)
    });
    let text = serde_json::to_string_pretty(&records)?;
    write_registry_atomic(&config.registry_path, text.as_bytes()).await?;
    Ok(())
}

struct RegistryLock {
    path: PathBuf,
}

impl RegistryLock {
    async fn acquire(registry_path: &Path) -> anyhow::Result<Self> {
        let lock_path = registry_path.with_extension("json.lock");
        for attempt in 0..120 {
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&lock_path)
                .await
            {
                Ok(mut file) => {
                    file.write_all(std::process::id().to_string().as_bytes()).await?;
                    return Ok(Self { path: lock_path });
                }
                Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                    if attempt >= 40 && registry_lock_is_stale(&lock_path).await {
                        let _ = fs::remove_file(&lock_path).await;
                        continue;
                    }
                    sleep(Duration::from_millis(25)).await;
                }
                Err(err) => return Err(err.into()),
            }
        }
        bail!("timed out waiting for registry lock {}", lock_path.display())
    }
}

impl Drop for RegistryLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

async fn registry_lock_is_stale(path: &Path) -> bool {
    fs::metadata(path)
        .await
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.elapsed().ok())
        .map(|age| age > std::time::Duration::from_secs(30))
        .unwrap_or(false)
}

async fn write_registry_atomic(path: &Path, bytes: &[u8]) -> anyhow::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).await?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("registry.json");
    let tmp_path = parent.join(format!(".{file_name}.{}.tmp", std::process::id()));
    fs::write(&tmp_path, bytes).await?;
    fs::rename(&tmp_path, path).await?;
    Ok(())
}

async fn read_registry(path: &Path) -> anyhow::Result<Vec<Value>> {
    let Ok(text) = fs::read_to_string(path).await else {
        return Ok(Vec::new());
    };
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }
    let value: Value = serde_json::from_str(text.trim_start_matches('\u{feff}'))?;
    Ok(flatten_registry_records(value))
}

fn flatten_registry_records(value: Value) -> Vec<Value> {
    match value {
        Value::Array(items) => items
            .into_iter()
            .flat_map(|item| match item {
                Value::Object(mut object) => match object.remove("value") {
                    Some(Value::Array(nested)) if !object.contains_key("id") => nested,
                    other => {
                        if let Some(other) = other {
                            object.insert("value".to_string(), other);
                        }
                        vec![Value::Object(object)]
                    }
                },
                other => vec![other],
            })
            .filter(|item| item.get("id").is_some())
            .collect(),
        Value::Object(object) => object
            .into_iter()
            .map(|(id, mut item)| {
                if let Value::Object(fields) = &mut item {
                    fields.entry("id".to_string()).or_insert(Value::String(id));
                }
                item
            })
            .filter(|item| item.get("id").is_some())
            .collect(),
        _ => Vec::new(),
    }
}

async fn read_tail_lossy(path: &Path, max_bytes: u64) -> std::io::Result<String> {
    let mut file = fs::File::open(path).await?;
    let len = file.metadata().await?.len();
    let start = len.saturating_sub(max_bytes);
    file.seek(std::io::SeekFrom::Start(start)).await?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).await?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn append_bytes(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = std::fs::OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(bytes)?;
    file.flush()
}

fn append_line(path: &Path, line: &str) -> std::io::Result<()> {
    append_bytes(path, format!("{line}\r\n").as_bytes())
}

fn default_codex_cmd() -> String {
    if cfg!(windows) {
        "codex.cmd".to_string()
    } else {
        "codex".to_string()
    }
}

fn default_codex_args() -> Vec<String> {
    vec![
        "--cd".to_string(),
        ".".to_string(),
        "--no-alt-screen".to_string(),
        "--dangerously-bypass-approvals-and-sandbox".to_string(),
    ]
}

fn split_args_lossy(value: &str) -> Vec<String> {
    value.split_whitespace().map(str::to_string).collect()
}

fn take_arg<I>(args: &mut std::iter::Peekable<I>, name: &str) -> anyhow::Result<String>
where
    I: Iterator<Item = String>,
{
    args.next().with_context(|| format!("{name} requires a value"))
}

fn safe_file_stem(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') { ch } else { '_' })
        .collect()
}

fn root_relative_or_display(path: &Path) -> String {
    let full = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    if let Ok(root) = env::current_dir() {
        if let Ok(relative) = full.strip_prefix(root) {
            return relative.to_string_lossy().replace('\\', "/");
        }
    }
    path.to_string_lossy().replace('\\', "/")
}

#[derive(Debug)]
struct RunnerError {
    status: StatusCode,
    message: String,
}

impl RunnerError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }
}

impl From<std::io::Error> for RunnerError {
    fn from(value: std::io::Error) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: value.to_string(),
        }
    }
}

impl IntoResponse for RunnerError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}
