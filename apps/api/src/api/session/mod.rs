use std::collections::HashSet;

use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{
    active_session_limit, build_internal_session_view, build_session_view, ensure_minimum_sessions,
    read_os_agent_views, terminal_log_path, AppState, SessionSource, SessionStatus, SessionView,
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
