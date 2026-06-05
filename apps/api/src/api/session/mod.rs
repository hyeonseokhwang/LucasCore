use std::collections::HashSet;

use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};

use crate::{
    active_session_limit, build_internal_session_view, build_session_view, ensure_minimum_sessions,
    prompt_body_from_write_session, prompt_line_count, read_os_agent_record, read_os_agent_views,
    resize_to_session, resolve_session_view, set_os_agent_attached, terminal_log_path,
    write_prompt_submit_to_session, write_prompt_text_to_session, write_to_session, ApiError,
    AppState, ResizeSession, ServerEvent, SessionSource, SessionStatus, SessionView, WriteSession,
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
