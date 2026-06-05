use std::collections::HashSet;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::{fs, sync::Mutex};

use crate::{
    active_session_count, active_session_limit, build_internal_session_view, build_session_view,
    default_shell, ensure_minimum_sessions, prompt_body_from_write_session, prompt_line_count,
    read_os_agent_record, read_os_agent_views, resize_to_session, resolve_session_view,
    set_os_agent_attached, spawn_pty_reader, spawn_pty_waiter, terminal_log_path,
    write_prompt_submit_to_session, write_prompt_text_to_session, write_to_session, ApiError,
    AppState, CreateSession, ResizeSession, ServerEvent, SessionMeta, SessionSource, SessionStatus,
    SessionView, TerminalSession, WriteSession,
};

pub(crate) async fn list_sessions(State(state): State<AppState>) -> Json<Vec<SessionView>> {
    ensure_minimum_sessions(&state).await;
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
        let view = match build_internal_session_view(&state, meta.clone()).await {
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

pub(crate) async fn pty_stats(State(state): State<AppState>) -> Json<Value> {
    let sessions = list_sessions(State(state)).await.0;
    let active = sessions
        .iter()
        .filter(|session| matches!(session.meta.status, SessionStatus::Active))
        .count();
    Json(
        json!({ "total": sessions.len(), "active": active, "max_active": active_session_limit(), "sessions": sessions }),
    )
}

pub(crate) async fn create_session(
    State(state): State<AppState>,
    Json(input): Json<CreateSession>,
) -> Result<(StatusCode, Json<SessionView>), ApiError> {
    let id = input
        .id
        .unwrap_or_else(|| format!("lcc-agent-{}", Utc::now().timestamp_millis()));
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

    state
        .sessions
        .write()
        .await
        .insert(id.clone(), session.clone());
    spawn_pty_reader(state.clone(), id.clone(), reader);
    spawn_pty_waiter(state.clone(), id.clone(), move || {
        child.wait().ok().map(|status| status.exit_code() as i32)
    });
    let meta = session.lock().await.meta.clone();
    let view = build_internal_session_view(&state, meta).await?;
    let _ = state.tx.send(ServerEvent::SessionCreated {
        session: view.clone(),
    });
    Ok((StatusCode::CREATED, Json(view)))
}

pub(crate) async fn delete_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let Some(session) = state.sessions.write().await.remove(&id) else {
        if read_os_agent_record(&id).await.is_some() {
            set_os_agent_attached(&id, false).await?;
            return Ok(Json(
                json!({ "ok": true, "detached": true, "session_id": id }),
            ));
        }
        return Err(ApiError::not_found("session not found"));
    };
    let mut session = session.lock().await;
    session.meta.status = SessionStatus::Stopped;
    let _ = session.writer.write_all(b"\x03exit\r\n");
    let _ = state
        .tx
        .send(ServerEvent::SessionDeleted { session_id: id });
    Ok(Json(json!({ "ok": true })))
}

pub(crate) async fn get_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SessionView>, ApiError> {
    Ok(Json(resolve_session_view(&state, &id).await?))
}

pub(crate) async fn write_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<WriteSession>,
) -> Result<Json<SessionView>, ApiError> {
    let data = input
        .input
        .or(input.data)
        .or(input.prompt)
        .unwrap_or_default();
    let session = write_to_session(&state, &id, data).await?;
    Ok(Json(session))
}

pub(crate) async fn write_session_prompt_text(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<WriteSession>,
) -> Result<Json<Value>, ApiError> {
    let body = prompt_body_from_write_session(&input);
    let session = write_prompt_text_to_session(&state, &id, body.clone()).await?;
    Ok(Json(json!({
        "ok": true,
        "type": "promptTextAck",
        "sessionId": id,
        "textBytes": body.as_bytes().len(),
        "lineCount": prompt_line_count(&body),
        "session": session
    })))
}

pub(crate) async fn write_session_prompt_submit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<WriteSession>,
) -> Result<Json<Value>, ApiError> {
    let repeat = input.repeat.unwrap_or(1).clamp(1, 2);
    let session = write_prompt_submit_to_session(&state, &id, repeat).await?;
    Ok(Json(json!({
        "ok": true,
        "type": "promptSubmitAck",
        "sessionId": id,
        "submitKey": "\\r",
        "repeat": repeat,
        "session": session
    })))
}

pub(crate) async fn resize_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<ResizeSession>,
) -> Result<Json<Value>, ApiError> {
    let cols = input.cols.unwrap_or(120).clamp(20, 300);
    let rows = input.rows.unwrap_or(30).clamp(5, 120);
    resize_to_session(&state, &id, cols, rows).await?;
    Ok(Json(json!({ "ok": true, "cols": cols, "rows": rows })))
}
